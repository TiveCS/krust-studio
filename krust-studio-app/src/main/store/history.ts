import type { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { getDataDir } from './paths'
import { getConnectionConfig } from './connections'
import type {
  CaptureInput,
  Changeset,
  DmlVerb,
  HistoryEntry,
  HistoryQuery
} from '../../shared/types'

/**
 * Query History + Changeset store (CONTEXT.md, ADR 0002/0008).
 * A local SQLite file in the data dir, opened lazily. Records the exact SQL
 * Krust runs — never result sets. Reuses node:sqlite (zero native deps).
 */
let db: DatabaseSync | null = null

async function getDb(): Promise<DatabaseSync> {
  if (db) return db
  const { DatabaseSync } = await import('node:sqlite')
  db = new DatabaseSync(join(getDataDir(), 'history.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS history_entries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            INTEGER NOT NULL,
      connection_id TEXT    NOT NULL,
      stream        TEXT    NOT NULL,
      source        TEXT    NOT NULL,
      statement     TEXT    NOT NULL,
      status        TEXT    NOT NULL,
      affected      INTEGER,
      entity        TEXT,
      error         TEXT,
      changeset_id  INTEGER,
      destructive   INTEGER NOT NULL DEFAULT 0,
      commit_group  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_history_conn_stream_ts
      ON history_entries (connection_id, stream, ts DESC);
    CREATE TABLE IF NOT EXISTS changesets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id TEXT    NOT NULL,
      name          TEXT    NOT NULL,
      ticket        TEXT,
      status        TEXT    NOT NULL DEFAULT 'draft',
      created_at    INTEGER NOT NULL,
      exported_at   INTEGER,
      kind          TEXT    NOT NULL DEFAULT 'schema'
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    -- Staged AI Proposals (ADR-0024). Durable so an unattended agent's work
    -- survives quit / crash / an auto-update restart (ADR-0019). Purely
    -- additive: a new table never disturbs an existing history.db.
    CREATE TABLE IF NOT EXISTS proposals (
      id             TEXT    PRIMARY KEY,
      connection_id  TEXT    NOT NULL,
      kind           TEXT    NOT NULL,
      client         TEXT,
      created_at     INTEGER NOT NULL,
      changeset_name TEXT,
      payload        TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_proposals_kind_created
      ON proposals (kind, created_at DESC);
  `)
  // migrations: add columns to pre-existing history_entries tables
  const cols = db
    .prepare('PRAGMA table_info(history_entries)')
    .all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'changeset_id')) {
    db.exec('ALTER TABLE history_entries ADD COLUMN changeset_id INTEGER')
  }
  if (!cols.some((c) => c.name === 'destructive')) {
    db.exec(
      'ALTER TABLE history_entries ADD COLUMN destructive INTEGER NOT NULL DEFAULT 0'
    )
  }
  if (!cols.some((c) => c.name === 'commit_group')) {
    db.exec('ALTER TABLE history_entries ADD COLUMN commit_group TEXT')
  }
  // typed changesets (ADR-0023): kind column — pre-existing changesets are Schema.
  const csCols = db
    .prepare('PRAGMA table_info(changesets)')
    .all() as Array<{ name: string }>
  if (!csCols.some((c) => c.name === 'kind')) {
    db.exec("ALTER TABLE changesets ADD COLUMN kind TEXT NOT NULL DEFAULT 'schema'")
  }
  // migrate the old single active slot (`active_cs:<conn>`) → the schema slot
  // (`active_cs:schema:<conn>`). Old keys never carry a kind segment.
  const legacy = db
    .prepare("SELECT key, value FROM meta WHERE key LIKE 'active_cs:%'")
    .all() as Array<{ key: string; value: string }>
  for (const row of legacy) {
    const rest = row.key.slice('active_cs:'.length)
    if (rest.startsWith('schema:') || rest.startsWith('data:')) continue
    db.prepare('DELETE FROM meta WHERE key = ?').run(row.key)
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(`active_cs:schema:${rest}`, row.value)
  }
  return db
}

type ChangesetKind = 'schema' | 'data'

/** the history stream that belongs in each changeset kind */
const kindStream = (kind: ChangesetKind): string =>
  kind === 'data' ? 'data_mutation' : 'table_mutation'

const activeKey = (connectionId: string, kind: ChangesetKind): string =>
  `active_cs:${kind}:${connectionId}`

function getActiveId(
  d: DatabaseSync,
  connectionId: string,
  kind: ChangesetKind
): number | null {
  const row = d
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get(activeKey(connectionId, kind)) as { value: string } | undefined
  return row ? Number(row.value) : null
}

function getChangesetKind(d: DatabaseSync, id: number): ChangesetKind | null {
  const row = d.prepare('SELECT kind FROM changesets WHERE id = ?').get(id) as
    | { kind: string }
    | undefined
  if (!row) return null
  return row.kind === 'data' ? 'data' : 'schema'
}

// Global toggle: when ON (default), destructive table-mutation DDL (DROP TABLE/
// VIEW) also auto-attaches to the active changeset instead of going to the
// Unassigned inbox. Stored once in `meta`, NOT per-connection.
const AUTO_ATTACH_DESTRUCTIVE_KEY = 'auto_attach_destructive'

function getAutoAttachDestructiveSync(d: DatabaseSync): boolean {
  const row = d
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get(AUTO_ATTACH_DESTRUCTIVE_KEY) as { value: string } | undefined
  return row ? row.value === '1' : true // default ON when unset
}

export async function getAutoAttachDestructive(): Promise<boolean> {
  const d = await getDb()
  return getAutoAttachDestructiveSync(d)
}

export async function setAutoAttachDestructive(on: boolean): Promise<void> {
  const d = await getDb()
  d.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(AUTO_ATTACH_DESTRUCTIVE_KEY, on ? '1' : '0')
}

/** every verb — the fallback when a connection has no explicit setting */
const ALL_DML_VERBS: DmlVerb[] = ['insert', 'update', 'delete']

/**
 * The DML verb a captured statement performs, or null when it isn't one of the
 * three (e.g. TRUNCATE, which is Data Mutation but not an INSERT/UPDATE/DELETE).
 * Leading-keyword match, same approach as `isDestructiveStatement`.
 */
export function dmlVerbOf(sql: string): DmlVerb | null {
  const body = sql.replace(/^\s*(\/\*[\s\S]*?\*\/|--[^\n]*\n)*\s*/, '').trimStart()
  if (/^INSERT\b/i.test(body) || /^REPLACE\b/i.test(body)) return 'insert'
  if (/^UPDATE\b/i.test(body)) return 'update'
  if (/^DELETE\b/i.test(body)) return 'delete'
  return null
}

/**
 * Which verbs auto-attach to the active Data changeset for this connection
 * (ADR-0024). **Absent means all three** — an existing connection carried over
 * from an older build must keep auto-attaching, not silently stop.
 */
function dataAttachRule(connectionId: string): {
  verbs: Set<DmlVerb>
  unscoped: boolean
} {
  const cfg = getConnectionConfig(connectionId)
  const verbs = cfg?.dataAttachVerbs ?? ALL_DML_VERBS
  return { verbs: new Set(verbs), unscoped: cfg?.dataAttachUnscoped === true }
}

/** Record one captured statement. Best-effort: never let logging break a mutation. */
export async function capture(input: CaptureInput): Promise<void> {
  try {
    const d = await getDb()
    const destructive = input.destructive ? 1 : 0
    // Auto-attach to the active changeset of the matching kind (ADR-0023/0024):
    //  • Schema DDL (table_mutation) → active SCHEMA changeset. Non-destructive
    //    always; destructive (DROP TABLE/VIEW) only when the global toggle is on.
    //  • DML (data_mutation) → active DATA changeset, gated by the connection's
    //    verb set AND the whole-table-wipes toggle. Both gates must pass.
    // With no active slot of that kind, nothing attaches (stays in history).
    // An explicit `changesetId` (an AI Proposal commit, bound to one changeset
    // by construction — ADR-0024) overrides the whole rule.
    let changesetId: number | null = null
    if (input.changesetId !== undefined) {
      changesetId = input.changesetId
    } else if (input.stream === 'table_mutation') {
      if (!input.destructive || getAutoAttachDestructiveSync(d)) {
        changesetId = getActiveId(d, input.connectionId, 'schema')
      }
    } else if (input.stream === 'data_mutation') {
      const rule = dataAttachRule(input.connectionId)
      const verb = dmlVerbOf(input.statement)
      // A statement with no INSERT/UPDATE/DELETE head (TRUNCATE) is only eligible
      // via the wipes toggle; the three verbs need their own box ticked too.
      const verbOk = verb ? rule.verbs.has(verb) : rule.unscoped
      const scopeOk = !input.destructive || rule.unscoped
      if (verbOk && scopeOk) {
        changesetId = getActiveId(d, input.connectionId, 'data')
      }
    }
    d.prepare(
      `INSERT INTO history_entries
         (ts, connection_id, stream, source, statement, status, affected, entity, error, changeset_id, destructive, commit_group)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      Date.now(),
      input.connectionId,
      input.stream,
      input.source,
      input.statement,
      input.status,
      input.affected ?? null,
      input.entity ?? null,
      input.error ?? null,
      changesetId,
      destructive,
      input.commitGroup ?? null
    )
  } catch (err) {
    console.error('history capture failed', err)
  }
}

export async function listHistory(query: HistoryQuery): Promise<HistoryEntry[]> {
  const d = await getDb()
  const where: string[] = []
  const params: unknown[] = []
  if (query.connectionId) {
    where.push('connection_id = ?')
    params.push(query.connectionId)
  }
  if (query.stream) {
    where.push('stream = ?')
    params.push(query.stream)
  }
  if (query.source) {
    where.push('source = ?')
    params.push(query.source)
  }
  if (typeof query.changesetId === 'number') {
    where.push('changeset_id = ?')
    params.push(query.changesetId)
  } else if (query.unassigned) {
    // Unassigned inbox — a specific kind's stream when `stream` is given
    // (rail: schema inbox = table_mutation, data inbox = data_mutation), else both.
    where.push('changeset_id IS NULL')
    if (!query.stream) where.push("stream IN ('table_mutation', 'data_mutation')")
  }
  const limit = Math.max(1, Math.min(2000, query.limit ?? 500))
  const offset = Math.max(0, query.offset ?? 0)
  const rows = d
    .prepare(
      `SELECT id, ts, connection_id AS connectionId, stream, source, statement,
              status, affected, entity, error, changeset_id AS changesetId,
              destructive, commit_group AS commitGroup
         FROM history_entries
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY ts DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}`
    )
    .all(...(params as never[])) as unknown as Array<
    Omit<HistoryEntry, 'destructive'> & { destructive: number }
  >
  return rows.map((r) => ({ ...r, destructive: r.destructive !== 0 }))
}

export async function clearHistory(
  connectionId: string,
  stream: HistoryEntry['stream']
): Promise<void> {
  const d = await getDb()
  d.prepare(
    'DELETE FROM history_entries WHERE connection_id = ? AND stream = ?'
  ).run(connectionId, stream)
}

// ---- Changesets -----------------------------------------------------------

export async function listChangesets(
  connectionId: string
): Promise<Changeset[]> {
  const d = await getDb()
  const activeSchema = getActiveId(d, connectionId, 'schema')
  const activeData = getActiveId(d, connectionId, 'data')
  const rows = d
    .prepare(
      `SELECT c.id, c.connection_id AS connectionId, c.name, c.ticket,
              c.status, c.created_at AS createdAt, c.exported_at AS exportedAt,
              c.kind,
              (SELECT count(*) FROM history_entries h WHERE h.changeset_id = c.id) AS count
         FROM changesets c
        WHERE c.connection_id = ?
        ORDER BY c.created_at DESC`
    )
    .all(connectionId) as unknown as Array<Omit<Changeset, 'active'>>
  return rows.map((r) => ({
    ...r,
    kind: r.kind === 'data' ? 'data' : 'schema',
    active: r.id === activeSchema || r.id === activeData
  }))
}

export async function createChangeset(
  connectionId: string,
  name: string,
  ticket?: string,
  kind: ChangesetKind = 'schema'
): Promise<Changeset> {
  const d = await getDb()
  const now = Date.now()
  const res = d
    .prepare(
      `INSERT INTO changesets (connection_id, name, ticket, status, created_at, kind)
       VALUES (?, ?, ?, 'draft', ?, ?)`
    )
    .run(connectionId, name, ticket ?? null, now, kind)
  const id = Number(res.lastInsertRowid)
  // a freshly created changeset becomes the active auto-attach target for its kind
  setActiveSync(d, connectionId, kind, id)
  return {
    id,
    connectionId,
    name,
    ticket: ticket ?? null,
    status: 'draft',
    createdAt: now,
    exportedAt: null,
    count: 0,
    kind,
    active: true
  }
}

export async function renameChangeset(
  id: number,
  name: string,
  ticket?: string
): Promise<void> {
  const d = await getDb()
  d.prepare('UPDATE changesets SET name = ?, ticket = ? WHERE id = ?').run(
    name,
    ticket ?? null,
    id
  )
}

export async function deleteChangeset(id: number): Promise<void> {
  const d = await getDb()
  const kind = getChangesetKind(d, id)
  // entries revert to the Unassigned inbox (never lost)
  d.prepare(
    'UPDATE history_entries SET changeset_id = NULL WHERE changeset_id = ?'
  ).run(id)
  d.prepare('DELETE FROM changesets WHERE id = ?').run(id)
  // clear the active slot if it pointed at this changeset
  if (kind) {
    d.prepare('DELETE FROM meta WHERE key LIKE ? AND value = ?').run(
      `active_cs:${kind}:%`,
      String(id)
    )
  }
}

function setActiveSync(
  d: DatabaseSync,
  connectionId: string,
  kind: ChangesetKind,
  changesetId: number | null
): void {
  if (changesetId == null) {
    d.prepare('DELETE FROM meta WHERE key = ?').run(activeKey(connectionId, kind))
  } else {
    d.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(activeKey(connectionId, kind), String(changesetId))
  }
}

/**
 * Toggle/set the active changeset. `null` clears both kind slots (generic). A
 * changeset id **toggles** its own kind's slot: if it is already the active one,
 * clear that kind; otherwise make it active (replacing any other active of the
 * same kind — one active per kind). Never touches the other kind's slot.
 */
export async function setActiveChangeset(
  connectionId: string,
  changesetId: number | null
): Promise<void> {
  const d = await getDb()
  if (changesetId == null) {
    setActiveSync(d, connectionId, 'schema', null)
    setActiveSync(d, connectionId, 'data', null)
    return
  }
  const kind = getChangesetKind(d, changesetId) ?? 'schema'
  const current = getActiveId(d, connectionId, kind)
  setActiveSync(d, connectionId, kind, current === changesetId ? null : changesetId)
}

export async function assignEntries(
  entryIds: number[],
  changesetId: number | null
): Promise<void> {
  if (entryIds.length === 0) return
  const d = await getDb()
  const placeholders = entryIds.map(() => '?').join(', ')
  if (changesetId == null) {
    // move to Unassigned — any schema/data mutation entry
    d.prepare(
      `UPDATE history_entries SET changeset_id = NULL
        WHERE id IN (${placeholders})
          AND stream IN ('table_mutation', 'data_mutation')`
    ).run(...(entryIds as never[]))
    return
  }
  // kind-scoped: only entries of the changeset's stream may attach (ADR-0023)
  const kind = getChangesetKind(d, changesetId) ?? 'schema'
  d.prepare(
    `UPDATE history_entries SET changeset_id = ?
      WHERE id IN (${placeholders}) AND stream = ?`
  ).run(changesetId, ...(entryIds as never[]), kindStream(kind))
}

function renderStmt(r: { ts: number; statement: string; entity: string | null }): string {
  const stmt = r.statement.trimEnd()
  const withSemi = stmt.endsWith(';') ? stmt : stmt + ';'
  const tag = `-- ${new Date(r.ts).toISOString()}${r.entity ? ` · ${r.entity}` : ''}`
  return `${tag}\n${withSemi}`
}

/** Build the commented .sql handoff script for one changeset (oldest → newest). */
export async function buildChangesetSql(id: number): Promise<{
  name: string
  ticket: string | null
  sql: string
} | null> {
  const d = await getDb()
  const cs = d
    .prepare('SELECT name, ticket, kind FROM changesets WHERE id = ?')
    .get(id) as { name: string; ticket: string | null; kind: string } | undefined
  if (!cs) return null
  const kind: ChangesetKind = cs.kind === 'data' ? 'data' : 'schema'
  const rows = d
    .prepare(
      `SELECT ts, statement, entity FROM history_entries
        WHERE changeset_id = ? AND stream = ?
        ORDER BY ts ASC, id ASC`
    )
    .all(id, kindStream(kind)) as Array<{
    ts: number
    statement: string
    entity: string | null
  }>
  const header = [
    `-- Changeset: ${cs.name} (${kind})`,
    cs.ticket ? `-- Ticket: ${cs.ticket}` : null,
    `-- Generated by Krust Studio at ${new Date().toISOString()}`,
    `-- ${rows.length} statement(s), raw chronological order (not squashed)`,
    ''
  ]
    .filter((l) => l !== null)
    .join('\n')
  const body = rows.map(renderStmt).join('\n\n')
  return { name: cs.name, ticket: cs.ticket, sql: `${header}\n${body}\n` }
}

/**
 * Export-together (ADR-0023): merge several changesets into one `.sql`, statements
 * **interleaved by execution timestamp** across all of them (a data backfill can
 * belong between two DDL steps). Storage stays separate; this is a render.
 */
export async function buildMergedChangesetSql(ids: number[]): Promise<{
  sql: string
  names: string[]
} | null> {
  if (ids.length === 0) return null
  const d = await getDb()
  const csRows = d
    .prepare(
      `SELECT id, name, kind FROM changesets WHERE id IN (${ids.map(() => '?').join(', ')})`
    )
    .all(...(ids as never[])) as Array<{ id: number; name: string; kind: string }>
  if (csRows.length === 0) return null
  const names = csRows.map((c) => `${c.name} (${c.kind === 'data' ? 'data' : 'schema'})`)
  const rows = d
    .prepare(
      `SELECT ts, statement, entity FROM history_entries
        WHERE changeset_id IN (${ids.map(() => '?').join(', ')})
          AND stream IN ('table_mutation', 'data_mutation')
        ORDER BY ts ASC, id ASC`
    )
    .all(...(ids as never[])) as Array<{
    ts: number
    statement: string
    entity: string | null
  }>
  const header = [
    `-- Merged export: ${names.join(', ')}`,
    `-- Generated by Krust Studio at ${new Date().toISOString()}`,
    `-- ${rows.length} statement(s), interleaved by execution time (not squashed)`,
    ''
  ].join('\n')
  const body = rows.map(renderStmt).join('\n\n')
  return { sql: `${header}\n${body}\n`, names }
}

export async function markExportedMany(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const d = await getDb()
  const now = Date.now()
  d.prepare(
    `UPDATE changesets SET status = 'exported', exported_at = ?
      WHERE id IN (${ids.map(() => '?').join(', ')})`
  ).run(now, ...(ids as never[]))
}

export async function deleteEntries(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const d = await getDb()
  const placeholders = ids.map(() => '?').join(', ')
  d.prepare(`DELETE FROM history_entries WHERE id IN (${placeholders})`).run(
    ...(ids as never[])
  )
}

export async function markExported(id: number): Promise<void> {
  const d = await getDb()
  d.prepare(
    "UPDATE changesets SET status = 'exported', exported_at = ? WHERE id = ?"
  ).run(Date.now(), id)
}

// ---- Staged AI Proposals (ADR-0024) ---------------------------------------
// Durable replacement for the in-memory pending Map: an agent works while the
// user is elsewhere, so a proposal must survive quit / crash / auto-update.

export interface StoredProposal {
  id: string
  connectionId: string
  kind: 'schema' | 'data'
  client: string | null
  createdAt: number
  changesetName: string | null
  /** the kind-specific proposal body, JSON */
  payload: string
}

export async function saveProposal(p: StoredProposal): Promise<void> {
  const d = await getDb()
  d.prepare(
    `INSERT INTO proposals
       (id, connection_id, kind, client, created_at, changeset_name, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload,
                                   changeset_name = excluded.changeset_name`
  ).run(
    p.id,
    p.connectionId,
    p.kind,
    p.client,
    p.createdAt,
    p.changesetName,
    p.payload
  )
}

export async function listProposals(
  kind: 'schema' | 'data'
): Promise<StoredProposal[]> {
  const d = await getDb()
  return d
    .prepare(
      `SELECT id, connection_id AS connectionId, kind, client,
              created_at AS createdAt, changeset_name AS changesetName, payload
         FROM proposals WHERE kind = ? ORDER BY created_at ASC`
    )
    .all(kind) as unknown as StoredProposal[]
}

export async function getProposal(id: string): Promise<StoredProposal | null> {
  const d = await getDb()
  const row = d
    .prepare(
      `SELECT id, connection_id AS connectionId, kind, client,
              created_at AS createdAt, changeset_name AS changesetName, payload
         FROM proposals WHERE id = ?`
    )
    .get(id) as unknown as StoredProposal | undefined
  return row ?? null
}

export async function deleteProposal(id: string): Promise<void> {
  const d = await getDb()
  d.prepare('DELETE FROM proposals WHERE id = ?').run(id)
}

/** drop proposals for connections that no longer exist (best-effort housekeeping) */
export async function pruneOrphanProposals(liveIds: string[]): Promise<void> {
  const d = await getDb()
  const rows = d
    .prepare('SELECT DISTINCT connection_id AS id FROM proposals')
    .all() as Array<{ id: string }>
  const live = new Set(liveIds)
  for (const r of rows) {
    if (!live.has(r.id)) {
      d.prepare('DELETE FROM proposals WHERE connection_id = ?').run(r.id)
    }
  }
}

/**
 * Find-or-create the changeset a committing proposal binds to (ADR-0022's
 * "one run, one changeset", now kind-aware). A named changeset is reused if one
 * of the right kind already exists, else created; with no name the active slot
 * of that kind is used, and if there is none the caller gets null (statements
 * land in Unassigned, never lost).
 */
export async function resolveChangesetFor(
  connectionId: string,
  kind: ChangesetKind,
  name?: string
): Promise<number | null> {
  const d = await getDb()
  if (!name?.trim()) return getActiveId(d, connectionId, kind)
  const existing = d
    .prepare(
      'SELECT id FROM changesets WHERE connection_id = ? AND kind = ? AND name = ?'
    )
    .get(connectionId, kind, name.trim()) as { id: number } | undefined
  if (existing) return existing.id
  return (await createChangeset(connectionId, name.trim(), undefined, kind)).id
}
