import { listEntities, describeTable } from '../db/session'
import { getConnectionConfig } from '../store/connections'
import { getMcpGrant } from '../store/mcp'
import type { IntrospectResult, IntrospectedTable } from '../../shared/types'

/** tiny glob: `*` matches any run of chars; matching is case-insensitive and
 *  tested against both `name` and `schema.name` so `audit.*` or `*_log` work. */
function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${esc}$`, 'i')
}

function isExcluded(name: string, schema: string | undefined, globs: string[]): boolean {
  const qualified = schema ? `${schema}.${name}` : name
  return globs.some((g) => {
    const re = globToRegExp(g)
    return re.test(name) || re.test(qualified)
  })
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

  const entities = await listEntities(connectionId)
  const visible = entities.filter((e) => !isExcluded(e.name, e.schema, excludes))

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
