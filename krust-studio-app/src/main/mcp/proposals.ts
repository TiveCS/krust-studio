import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import {
  listEntities,
  describeTable,
  createTable,
  alterTable,
  previewAlter
} from '../db/session'
import { getConnectionConfig } from '../store/connections'
import type {
  CreateTableSpec,
  SchemaOp,
  SchemaSyncProposal,
  SchemaSyncCommitResult,
  SchemaSyncReportItem,
  ProposedAlter,
  ProposedCreateTable
} from '../../shared/types'

/** raw payload an MCP client sends to propose_schema_ops */
export interface ProposeInput {
  connectionId: string
  changesetName?: string
  createTables?: CreateTableSpec[]
  alters?: { table: string; schema?: string; ops: SchemaOp[] }[]
  reportOnly?: SchemaSyncReportItem[]
}

/** pending proposals, in memory — cleared on quit (transient by design). */
const pending = new Map<string, SchemaSyncProposal>()

function push(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

/** stable key for one op in a proposal — the UI uses it to deselect ops */
export function createKey(spec: CreateTableSpec): string {
  return `create:${spec.name}`
}
export function alterKey(table: string, i: number): string {
  return `alter:${table}:${i}`
}

/**
 * Accept a proposal from an MCP client (ADR-0022): compute best-effort DDL for
 * each op (dry-run — no execution), store it pending, and push it to the renderer
 * so the Schema Sync tab badges + (optionally) toasts. Never writes the DB.
 */
export async function addProposal(
  input: ProposeInput,
  client: string
): Promise<{ id: string; createTables: number; alters: number; reportOnly: number }> {
  const config = getConnectionConfig(input.connectionId)
  if (!config) throw new Error(`Unknown connection: ${input.connectionId}`)

  const createTables: ProposedCreateTable[] = []
  for (const spec of input.createTables ?? []) {
    let ddl: string | undefined
    try {
      ddl = (await createTable(input.connectionId, spec, true)).ddl
    } catch {
      // preview failed (e.g. connection down) — keep the structured op anyway
    }
    createTables.push({ spec, ddl })
  }

  const alters: ProposedAlter[] = []
  for (const a of input.alters ?? []) {
    let statements: string[] | undefined
    try {
      statements = (
        await previewAlter(input.connectionId, { name: a.table, schema: a.schema }, a.ops)
      ).statements
    } catch {
      // preview failed — keep the ops
    }
    alters.push({ table: a.table, schema: a.schema, ops: a.ops, statements })
  }

  const proposal: SchemaSyncProposal = {
    id: randomUUID(),
    connectionId: input.connectionId,
    connectionName: config.name,
    client,
    receivedAt: Date.now(),
    changesetName: input.changesetName,
    createTables,
    alters,
    reportOnly: input.reportOnly ?? []
  }
  pending.set(proposal.id, proposal)
  push('mcp:proposal', proposal)
  return {
    id: proposal.id,
    createTables: createTables.length,
    alters: alters.length,
    reportOnly: proposal.reportOnly.length
  }
}

export function listProposals(): SchemaSyncProposal[] {
  return [...pending.values()].sort((a, b) => b.receivedAt - a.receivedAt)
}

export function dismissProposal(id: string): void {
  pending.delete(id)
}

/** current table/column shape for reconcile — a set of "table" + "table.column" */
async function liveShape(connectionId: string): Promise<{
  tables: Set<string>
  columns: Set<string>
  indexes: Set<string>
}> {
  const tables = new Set<string>()
  const columns = new Set<string>()
  const indexes = new Set<string>()
  const entities = await listEntities(connectionId)
  for (const e of entities) {
    tables.add(e.name.toLowerCase())
    try {
      const s = await describeTable(connectionId, { name: e.name, schema: e.schema })
      for (const c of s.columns) columns.add(`${e.name.toLowerCase()}.${c.name.toLowerCase()}`)
      for (const i of s.indexes) indexes.add(i.name.toLowerCase())
    } catch {
      // unreadable table — leave it out of the shape (op will attempt + may error)
    }
  }
  return { tables, columns, indexes }
}

/** does an op's target already exist? (idempotent skip — no duplicate-column errors) */
function opSatisfied(
  table: string,
  op: SchemaOp,
  shape: { columns: Set<string>; indexes: Set<string> }
): boolean {
  const t = table.toLowerCase()
  switch (op.kind) {
    case 'addColumn':
      return shape.columns.has(`${t}.${op.column.name.toLowerCase()}`)
    case 'addIndex':
      return op.spec.name ? shape.indexes.has(op.spec.name.toLowerCase()) : false
    default:
      return false
  }
}

/**
 * Commit a proposal on a writable connection: re-introspect and reconcile
 * (skip satisfied ops, run only what's missing), executing through the normal
 * createTable/alterTable path so DDL captures to history. `excludeKeys` are ops
 * the user deselected. Read-only connections are blocked here (main guard).
 */
export async function commitProposal(
  id: string,
  opts: { changesetName?: string; excludeKeys?: string[] }
): Promise<SchemaSyncCommitResult> {
  const p = pending.get(id)
  if (!p) throw new Error('Proposal not found (it may have been dismissed)')
  const config = getConnectionConfig(p.connectionId)
  if (config?.readOnly) {
    throw new Error('Connection is read-only — commit is blocked. Export the .sql instead.')
  }
  const exclude = new Set(opts.excludeKeys ?? [])
  const shape = await liveShape(p.connectionId)
  const ran: string[] = []
  const skipped: string[] = []
  const conflicts: string[] = []

  // create missing tables first (parents before FK-bearing children)
  for (const ct of p.createTables) {
    const key = createKey(ct.spec)
    if (exclude.has(key)) continue
    if (shape.tables.has(ct.spec.name.toLowerCase())) {
      skipped.push(`table ${ct.spec.name} (already exists)`)
      continue
    }
    try {
      await createTable(p.connectionId, ct.spec)
      ran.push(`CREATE TABLE ${ct.spec.name}`)
    } catch (err) {
      conflicts.push(`CREATE TABLE ${ct.spec.name}: ${err instanceof Error ? err.message : err}`)
    }
  }

  // then alters — reconcile each op against the (possibly just-changed) shape
  for (const a of p.alters) {
    const runOps: SchemaOp[] = []
    a.ops.forEach((op, i) => {
      if (exclude.has(alterKey(a.table, i))) return
      if (opSatisfied(a.table, op, shape)) {
        skipped.push(`${a.table}.${describeOp(op)} (already present)`)
        return
      }
      runOps.push(op)
    })
    if (runOps.length === 0) continue
    try {
      await alterTable(p.connectionId, { name: a.table, schema: a.schema }, runOps)
      ran.push(`ALTER ${a.table} (${runOps.length})`)
    } catch (err) {
      conflicts.push(`ALTER ${a.table}: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (conflicts.length === 0) pending.delete(id)
  return { ran, skipped, conflicts, changesetName: opts.changesetName ?? p.changesetName }
}

function describeOp(op: SchemaOp): string {
  switch (op.kind) {
    case 'addColumn':
      return `add ${op.column.name}`
    case 'addIndex':
      return `index ${op.spec.name ?? op.spec.columns.join('_')}`
    case 'addForeignKey':
      return `fk ${op.column}`
    default:
      return op.kind
  }
}

/** the handoff .sql from the proposal's draft DDL (works without executing) */
export async function exportProposalSql(id: string): Promise<string> {
  const p = pending.get(id)
  if (!p) throw new Error('Proposal not found')
  const lines: string[] = [
    `-- Krust Studio — Schema Sync export`,
    `-- connection: ${p.connectionName}`,
    p.changesetName ? `-- changeset: ${p.changesetName}` : `-- changeset: (none)`,
    `-- generated: ${new Date().toISOString()}`,
    ''
  ]
  for (const ct of p.createTables) {
    lines.push(`-- create table ${ct.spec.name}`)
    lines.push((ct.ddl ?? `-- (DDL unavailable) CREATE TABLE ${ct.spec.name}`).trim())
    lines.push('')
  }
  for (const a of p.alters) {
    lines.push(`-- alter ${a.table}`)
    for (const s of a.statements ?? []) lines.push(`${s.trim()};`)
    lines.push('')
  }
  if (p.reportOnly.length) {
    lines.push('-- report-only (not applied — review manually):')
    for (const r of p.reportOnly) lines.push(`--   ${r.table}: ${r.kind} — ${r.detail}`)
  }
  return lines.join('\n')
}
