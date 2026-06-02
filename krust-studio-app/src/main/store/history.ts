import type { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { getDataDir } from './paths'
import type {
  CaptureInput,
  Changeset,
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
      changeset_id  INTEGER
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
      exported_at   INTEGER
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)
  // migration: add changeset_id to pre-existing history_entries tables
  const cols = db
    .prepare('PRAGMA table_info(history_entries)')
    .all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'changeset_id')) {
    db.exec('ALTER TABLE history_entries ADD COLUMN changeset_id INTEGER')
  }
  return db
}

const activeKey = (connectionId: string): string => `active_cs:${connectionId}`

function getActiveId(d: DatabaseSync, connectionId: string): number | null {
  const row = d
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get(activeKey(connectionId)) as { value: string } | undefined
  return row ? Number(row.value) : null
}

/** Record one captured statement. Best-effort: never let logging break a mutation. */
export async function capture(input: CaptureInput): Promise<void> {
  try {
    const d = await getDb()
    // Table-Mutation (DDL) auto-attaches to the connection's active changeset
    const changesetId =
      input.stream === 'table_mutation'
        ? getActiveId(d, input.connectionId)
        : null
    d.prepare(
      `INSERT INTO history_entries
         (ts, connection_id, stream, source, statement, status, affected, entity, error, changeset_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      changesetId
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
  if (typeof query.changesetId === 'number') {
    where.push('changeset_id = ?')
    params.push(query.changesetId)
  } else if (query.unassigned) {
    where.push("stream = 'table_mutation' AND changeset_id IS NULL")
  }
  const limit = Math.max(1, Math.min(2000, query.limit ?? 500))
  const offset = Math.max(0, query.offset ?? 0)
  const rows = d
    .prepare(
      `SELECT id, ts, connection_id AS connectionId, stream, source, statement,
              status, affected, entity, error, changeset_id AS changesetId
         FROM history_entries
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY ts DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}`
    )
    .all(...(params as never[])) as unknown as HistoryEntry[]
  return rows
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
  const active = getActiveId(d, connectionId)
  const rows = d
    .prepare(
      `SELECT c.id, c.connection_id AS connectionId, c.name, c.ticket,
              c.status, c.created_at AS createdAt, c.exported_at AS exportedAt,
              (SELECT count(*) FROM history_entries h WHERE h.changeset_id = c.id) AS count
         FROM changesets c
        WHERE c.connection_id = ?
        ORDER BY c.created_at DESC`
    )
    .all(connectionId) as unknown as Omit<Changeset, 'active'>[]
  return rows.map((r) => ({ ...r, active: r.id === active }))
}

export async function createChangeset(
  connectionId: string,
  name: string,
  ticket?: string
): Promise<Changeset> {
  const d = await getDb()
  const now = Date.now()
  const res = d
    .prepare(
      `INSERT INTO changesets (connection_id, name, ticket, status, created_at)
       VALUES (?, ?, ?, 'draft', ?)`
    )
    .run(connectionId, name, ticket ?? null, now)
  const id = Number(res.lastInsertRowid)
  // a freshly created changeset becomes the active auto-attach target
  setActiveSync(d, connectionId, id)
  return {
    id,
    connectionId,
    name,
    ticket: ticket ?? null,
    status: 'draft',
    createdAt: now,
    exportedAt: null,
    count: 0,
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
  // entries revert to the Unassigned inbox (never lost)
  d.prepare(
    'UPDATE history_entries SET changeset_id = NULL WHERE changeset_id = ?'
  ).run(id)
  d.prepare('DELETE FROM changesets WHERE id = ?').run(id)
  // clear any meta rows pointing at it
  d.prepare('DELETE FROM meta WHERE value = ?').run(String(id))
}

function setActiveSync(
  d: DatabaseSync,
  connectionId: string,
  changesetId: number | null
): void {
  if (changesetId == null) {
    d.prepare('DELETE FROM meta WHERE key = ?').run(activeKey(connectionId))
  } else {
    d.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(activeKey(connectionId), String(changesetId))
  }
}

export async function setActiveChangeset(
  connectionId: string,
  changesetId: number | null
): Promise<void> {
  const d = await getDb()
  setActiveSync(d, connectionId, changesetId)
}

export async function assignEntries(
  entryIds: number[],
  changesetId: number | null
): Promise<void> {
  if (entryIds.length === 0) return
  const d = await getDb()
  const placeholders = entryIds.map(() => '?').join(', ')
  d.prepare(
    `UPDATE history_entries SET changeset_id = ?
      WHERE id IN (${placeholders}) AND stream = 'table_mutation'`
  ).run(changesetId, ...(entryIds as never[]))
}

/** Build the commented .sql handoff script for a changeset (oldest → newest). */
export async function buildChangesetSql(id: number): Promise<{
  name: string
  ticket: string | null
  sql: string
} | null> {
  const d = await getDb()
  const cs = d
    .prepare('SELECT name, ticket FROM changesets WHERE id = ?')
    .get(id) as { name: string; ticket: string | null } | undefined
  if (!cs) return null
  const rows = d
    .prepare(
      `SELECT ts, statement, entity FROM history_entries
        WHERE changeset_id = ? AND stream = 'table_mutation'
        ORDER BY ts ASC, id ASC`
    )
    .all(id) as Array<{ ts: number; statement: string; entity: string | null }>
  const header = [
    `-- Changeset: ${cs.name}`,
    cs.ticket ? `-- Ticket: ${cs.ticket}` : null,
    `-- Generated by Krust Studio at ${new Date().toISOString()}`,
    `-- ${rows.length} statement(s), raw chronological order (not squashed)`,
    ''
  ]
    .filter((l) => l !== null)
    .join('\n')
  const body = rows
    .map((r) => {
      const stmt = r.statement.trimEnd()
      const withSemi = stmt.endsWith(';') ? stmt : stmt + ';'
      const tag = `-- ${new Date(r.ts).toISOString()}${r.entity ? ` · ${r.entity}` : ''}`
      return `${tag}\n${withSemi}`
    })
    .join('\n\n')
  return { name: cs.name, ticket: cs.ticket, sql: `${header}\n${body}\n` }
}

export async function markExported(id: number): Promise<void> {
  const d = await getDb()
  d.prepare(
    "UPDATE changesets SET status = 'exported', exported_at = ? WHERE id = ?"
  ).run(Date.now(), id)
}
