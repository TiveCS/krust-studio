import { describeTable, readRows } from '../db/session'
import { getConnectionConfig } from '../store/connections'
import { getMcpConfig, getMcpGrant } from '../store/mcp'
import type { Filter, McpAllowEntry, Sort } from '../../shared/types'

/**
 * Structured, read-only DATA tools (ADR-0003) gated by the per-connection AI Read
 * Allowlist. Default-deny: a table is describable/readable only if it's on the
 * allowlist; masked columns are stripped from every result. No arbitrary SQL.
 */

function requireDataReads(connectionId: string): McpAllowEntry[] {
  const config = getConnectionConfig(connectionId)
  if (!config) throw new Error(`Unknown connection: ${connectionId}`)
  const grant = getMcpGrant(connectionId)
  if (!grant.dataReads) throw new Error('Data reads are not granted for this connection')
  return grant.allowlist ?? []
}

function findEntry(
  allow: McpAllowEntry[],
  table: string,
  schema?: string
): McpAllowEntry | undefined {
  return allow.find(
    (e) =>
      e.table.toLowerCase() === table.toLowerCase() &&
      (e.schema ?? '').toLowerCase() === (schema ?? '').toLowerCase()
  )
}

export function listAllowedTables(connectionId: string): {
  tables: { table: string; schema?: string; data: boolean; maskedColumns: number }[]
} {
  const allow = requireDataReads(connectionId)
  return {
    tables: allow.map((e) => ({
      table: e.table,
      schema: e.schema,
      data: e.data,
      maskedColumns: e.maskColumns?.length ?? 0
    }))
  }
}

export async function describeAllowedTable(
  connectionId: string,
  table: string,
  schema?: string
): Promise<unknown> {
  const allow = requireDataReads(connectionId)
  const entry = findEntry(allow, table, schema)
  if (!entry) throw new Error(`Table not on the AI Read Allowlist: ${table}`)
  const masked = new Set((entry.maskColumns ?? []).map((c) => c.toLowerCase()))
  const s = await describeTable(connectionId, { name: table, schema })
  return {
    table,
    schema,
    columns: s.columns
      .filter((c) => !masked.has(c.name.toLowerCase()))
      .map((c) => ({ name: c.name, type: c.type, nullable: c.nullable, pk: c.pk })),
    indexes: s.indexes.map((i) => ({ name: i.name, unique: i.unique, columns: i.columns })),
    relations: s.relations.map((r) => ({
      column: r.column,
      refTable: r.refTable,
      refColumn: r.refColumn
    })),
    maskedColumns: [...masked]
  }
}

export interface ReadRowsInput {
  limit?: number
  offset?: number
  /** structured predicate (Krust Filter[]) — compiled to a parameterized WHERE */
  filter?: Filter[]
  /** multi-column sort */
  orderBy?: Sort[]
  /** projection — restrict the result to these columns (must be allowlisted) */
  columns?: string[]
}

/**
 * Read a bounded sample from an allowlisted table (ADR-0003, refined beta.5).
 * Filtering/sorting/projection are **structured** (Filter[]/Sort[]) — never raw
 * SQL. Every column referenced in filter/orderBy/columns must itself be
 * **allowlisted and unmasked**, else the call is rejected: a raw or masked-column
 * predicate could probe a masked value one boolean at a time (oracle leak).
 */
export async function readAllowedRows(
  connectionId: string,
  table: string,
  schema: string | undefined,
  input: ReadRowsInput
): Promise<unknown> {
  const allow = requireDataReads(connectionId)
  const entry = findEntry(allow, table, schema)
  if (!entry) throw new Error(`Table not on the AI Read Allowlist: ${table}`)
  if (!entry.data) throw new Error(`Row data is not allowed for ${table} (schema-only grant)`)
  const cfg = getMcpConfig()
  const n = Math.min(input.limit ?? cfg.readSampleDefault, cfg.readSampleMax)
  const masked = new Set((entry.maskColumns ?? []).map((c) => c.toLowerCase()))

  // the set of columns the AI is allowed to SEE for this table (real ∧ unmasked)
  const filters = input.filter ?? []
  const orderBy = input.orderBy ?? []
  const projection = input.columns ?? []
  const referenced = [
    ...filters.map((f) => f.column),
    ...orderBy.map((o) => o.column),
    ...projection
  ].filter(Boolean)
  if (referenced.length) {
    const desc = await describeTable(connectionId, { name: table, schema })
    const visible = new Set(
      desc.columns.map((c) => c.name.toLowerCase()).filter((c) => !masked.has(c))
    )
    for (const col of referenced) {
      if (!visible.has(col.toLowerCase())) {
        throw new Error(
          `Column "${col}" is not readable on ${table} ` +
            `(not on the allowlist or masked) — cannot filter/sort/select on it`
        )
      }
    }
  }

  const res = await readRows(
    connectionId,
    { name: table, schema },
    n,
    input.offset ?? 0,
    filters.length ? filters : undefined,
    orderBy.length ? orderBy : undefined
    // NOTE: rawWhere is deliberately never passed — structured only (no oracle leak)
  )
  const wanted = projection.length
    ? new Set(projection.map((c) => c.toLowerCase()))
    : null
  const columns = res.columns.filter(
    (c) => !masked.has(c.name.toLowerCase()) && (!wanted || wanted.has(c.name.toLowerCase()))
  )
  const rows = res.rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const c of columns) out[c.name] = row[c.name]
    return out
  })
  return { table, schema, limit: n, offset: input.offset ?? 0, columns, rows }
}
