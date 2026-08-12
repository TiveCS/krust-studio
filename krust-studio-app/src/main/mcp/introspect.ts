import { listEntities, describeTable, bulkIntrospect } from '../db/session'
import { getConnectionConfig } from '../store/connections'
import { getMcpGrant } from '../store/mcp'
import type { EntityInfo, IntrospectResult, IntrospectedTable } from '../../shared/types'

/** tiny glob: `*` matches any run of chars; matching is case-insensitive and
 *  tested against both `name` and `schema.name` so `audit.*` or `*_log` work. */
function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${esc}$`, 'i')
}

export function matchesGlobs(
  name: string,
  schema: string | undefined,
  globs: string[]
): boolean {
  return isExcluded(name, schema, globs)
}

function isExcluded(name: string, schema: string | undefined, globs: string[]): boolean {
  const qualified = schema ? `${schema}.${name}` : name
  return globs.some((g) => {
    const re = globToRegExp(g)
    return re.test(name) || re.test(qualified)
  })
}

/**
 * Table and view NAMES only — no columns, no keys, no rows, no counts.
 *
 * Deliberately gated more loosely than `introspectSchema`: any connection the
 * user has granted *something* can be enumerated, without the introspection
 * grant. A connection with no grants at all stays invisible, so default-deny
 * still holds at the connection boundary (ADR-0022, amended). The motivating
 * case is diffing which tables exist between two connections — staging against
 * a dev audit database — which should not require handing over full structure.
 *
 * The connection's exclude globs still apply: they are an instruction the user
 * typed, and a tool that quietly ignored them would be a surprise.
 */
export async function listConnectionTables(
  connectionId: string
): Promise<{ connectionId: string; tables: EntityInfo[] }> {
  const config = getConnectionConfig(connectionId)
  if (!config) throw new Error(`Unknown connection: ${connectionId}`)
  const grant = getMcpGrant(connectionId)
  const anyGrant =
    !!grant.introspection ||
    !!grant.propose ||
    !!grant.dataReads ||
    !!grant.dataWrites ||
    !!grant.historyReads
  if (!anyGrant) {
    throw new Error('This connection is not exposed to MCP')
  }
  const excludes = grant.introspectExcludes ?? []
  const entities = await listEntities(connectionId)
  return {
    connectionId,
    tables: entities.filter((e) => !isExcluded(e.name, e.schema, excludes))
  }
}

/**
 * Whole-connection STRUCTURE snapshot (no rows) for an AI diff. Gated by the
 * per-connection introspection grant; internal tables matching the connection's
 * exclude globs are omitted. Reuses the existing session structure reads.
 */
export async function introspectSchema(connectionId: string): Promise<IntrospectResult> {
  const config = getConnectionConfig(connectionId)
  if (!config) throw new Error(`Unknown connection: ${connectionId}`)
  const grant = getMcpGrant(connectionId)
  if (!grant.introspection) {
    throw new Error('Schema introspection is not granted for this connection')
  }
  const excludes = grant.introspectExcludes ?? []
  const keep = (name: string, schema?: string): boolean => !isExcluded(name, schema, excludes)

  // Fast path: one bulk pass (a few catalog queries) instead of N sequential
  // describeTable round-trips — critical on a remote/serverless DB (65 tables
  // went from ~63s to a couple of round-trips). If a bulk query errors, fall
  // through to the reliable per-table path rather than failing introspection.
  let bulk: IntrospectedTable[] | null = null
  try {
    bulk = await bulkIntrospect(connectionId)
  } catch {
    bulk = null
  }
  if (bulk) {
    return {
      connectionId,
      database: config.database ?? null,
      engine: config.driver,
      tables: bulk.filter((t) => keep(t.name, t.schema))
    }
  }

  // Fallback: per-table describe (sqlite — local + fast; or a driver with no
  // bulk path).
  const entities = await listEntities(connectionId)
  const visible = entities.filter((e) => keep(e.name, e.schema))
  const tables: IntrospectedTable[] = []
  for (const e of visible) {
    const s = await describeTable(connectionId, { name: e.name, schema: e.schema })
    tables.push({
      name: e.name,
      schema: e.schema,
      type: e.type,
      columns: s.columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable,
        pk: c.pk,
        default: c.default,
        fk: c.fk
          ? { refTable: c.fk.refTable, refColumn: c.fk.refColumn, refSchema: c.fk.refSchema }
          : undefined
      })),
      indexes: s.indexes.map((i) => ({
        name: i.name,
        unique: i.unique,
        columns: i.columns,
        method: i.method
      }))
    })
  }

  return {
    connectionId,
    database: config.database ?? null,
    engine: config.driver,
    tables
  }
}
