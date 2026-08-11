import { applyRowChanges, countPredicate } from '../db/session'
import { getConnectionConfig } from '../store/connections'
import { getMcpGrant } from '../store/mcp'
import { assertColumnsVisible, findEntry } from './reads'
import type { DmlVerb, Filter, McpAllowEntry, ProposedRowChange } from '../../shared/types'

/**
 * The **AI Write Allowlist** boundary (ADR-0024). Default-deny, per
 * (connection → table → verb). Nothing here executes: a validated change set is
 * staged as a Data Proposal for a human to commit.
 *
 * Two rules are enforced here and nowhere else, so a renderer bug cannot bypass
 * them:
 *
 *  1. **Predicate columns follow the read rules** — a column named in a WHERE
 *     must be allowlisted and unmasked, exactly as for `read_rows`.
 *  2. **Unscoped writes are rejected** — the predicate is required and non-empty
 *     and there is no TRUNCATE verb, so a Destructive DML statement cannot even
 *     be *staged* over MCP. Whole-table operations stay in the GUI behind the
 *     typed confirmation (ADR-0005).
 */

function requireDataWrites(connectionId: string): McpAllowEntry[] {
  const config = getConnectionConfig(connectionId)
  if (!config) throw new Error(`Unknown connection: ${connectionId}`)
  const grant = getMcpGrant(connectionId)
  if (!grant.dataWrites) throw new Error('Data writes are not granted for this connection')
  return grant.allowlist ?? []
}

/** the allowlist entry for a table, asserting it permits `verb` */
function requireWritableTable(
  allow: McpAllowEntry[],
  table: string,
  schema: string | undefined,
  verb: DmlVerb
): McpAllowEntry {
  const entry = findEntry(allow, table, schema)
  if (!entry) throw new Error(`Table not on the AI Read Allowlist: ${table}`)
  // A table is never writable without being readable — an agent must be able to
  // see a row before it may change it.
  if (!entry.data) throw new Error(`Row data is not allowed for ${table} (schema-only grant)`)
  const verbs = entry.write ?? []
  if (!verbs.includes(verb)) {
    throw new Error(
      `${verb.toUpperCase()} is not allowed on ${table}. ` +
        `Permitted: ${verbs.length ? verbs.join(', ') : 'none'}`
    )
  }
  return entry
}

/** columns a filter references, including nothing for the null-ary operators */
function filterColumns(filters: Filter[]): string[] {
  return filters.map((f) => f.column).filter(Boolean)
}

export interface ProposeDataInput {
  connectionId: string
  changesetName?: string
  changes: ProposedRowChange[]
}

/**
 * Validate a proposed change set against the write allowlist and render its DML.
 * Throws on the first violation — a partially-valid proposal is never staged,
 * so the human never reviews a list that would fail halfway through commit.
 */
export async function validateAndRender(input: ProposeDataInput): Promise<ProposedRowChange[]> {
  const allow = requireDataWrites(input.connectionId)
  if (!input.changes.length) throw new Error('No changes proposed')

  const out: ProposedRowChange[] = []
  for (const c of input.changes) {
    const entry = requireWritableTable(allow, c.table, c.schema, c.verb)
    const where = c.where ?? []

    if (c.verb === 'insert') {
      const values = c.values ?? {}
      if (!Object.keys(values).length)
        throw new Error(`INSERT into ${c.table} has no column values`)
      await assertColumnsVisible(input.connectionId, c.table, c.schema, entry, Object.keys(values))
    } else {
      // The unscoped-write rejection. An empty predicate is a whole-table
      // UPDATE/DELETE — Destructive, and never proposable over MCP.
      if (!where.length) {
        throw new Error(
          `'where' is required and must be non-empty for ${c.verb} on ` +
            `${c.table}. Unscoped writes are not proposable over MCP — ` +
            `run whole-table operations from the Krust UI, where the typed ` +
            `confirmation applies.`
        )
      }
      const referenced = filterColumns(where)
      if (c.verb === 'update') {
        const set = c.set ?? {}
        if (!Object.keys(set).length) throw new Error(`UPDATE on ${c.table} has no columns to set`)
        referenced.push(...Object.keys(set))
      }
      await assertColumnsVisible(input.connectionId, c.table, c.schema, entry, referenced)
    }
    out.push({ ...c, where: where.length ? where : undefined })
  }

  // Render the DML without executing, so the review panel and the export both
  // show exactly what would run (Krust owns dialect — never AI-authored SQL).
  const preview = await applyRowChanges(input.connectionId, out, { dryRun: true })
  const rendered = preview.statements ?? []

  // Affected-row preview (ADR-0005). Best-effort: a count failure must not sink
  // the proposal, since the count is re-taken at commit anyway.
  for (let i = 0; i < out.length; i++) {
    out[i].sql = rendered[i]
    if (out[i].verb !== 'insert' && out[i].where?.length) {
      try {
        out[i].estimatedRows = await countPredicate(
          input.connectionId,
          { name: out[i].table, schema: out[i].schema },
          out[i].where!
        )
      } catch {
        // leave estimatedRows undefined — the review panel shows "unknown"
      }
    }
  }
  return out
}
