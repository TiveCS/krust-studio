import type {
  ApplyResult,
  ChangeSet,
  ConnectionConfig,
  EntityInfo,
  EntityRef,
  EntityType,
  EnumType,
  Filter,
  CreateTableSpec,
  IndexSpec,
  QueryResult,
  ReferencingTable,
  RowsResult,
  SchemaOp,
  SearchResult,
  Sort,
  TableStructure
} from '../../shared/types'
import type { DbDriver } from './driver'
import { splitStatements, classifyStatement, isConnectionFatal } from './driver'
import { MysqlDriver } from './drivers/mysql'
import { PostgresDriver } from './drivers/postgres'
import { SqliteDriver } from './drivers/sqlite'
import { getConnectionConfig, getStoredPassword } from '../store/connections'
import { capture } from '../store/history'
import type { HistoryStream } from '../../shared/types'

const sessions = new Map<string, DbDriver>()

/**
 * Run `fn` against the driver for `id`, retrying once after a connection-fatal
 * error. On fatal: drops the dead driver, reconnects, then calls `fn` again.
 * Only reads and transactional writes use this (non-transactional DDL does not).
 */
async function withRetry<T>(id: string, fn: (driver: DbDriver) => Promise<T>): Promise<T> {
  if (!sessions.has(id)) await connectSession(id)
  try {
    return await fn(sessions.get(id)!)
  } catch (err) {
    if (!isConnectionFatal(err)) throw err
    sessions.delete(id)
    await connectSession(id)
    return fn(sessions.get(id)!)
  }
}

/** Record captured statements (best-effort; capture() swallows its own errors). */
async function captureAll(
  connectionId: string,
  stream: HistoryStream,
  statements: string[],
  entity: string | null,
  affected: number | null = null
): Promise<void> {
  for (const statement of statements) {
    await capture({
      connectionId,
      stream,
      source: 'gui',
      statement,
      status: 'success',
      entity,
      affected
    })
  }
}

function createDriver(config: ConnectionConfig, password?: string): DbDriver {
  const deps = { config, password }
  switch (config.driver) {
    case 'mysql':
      return new MysqlDriver(deps)
    case 'postgres':
      return new PostgresDriver(deps)
    case 'sqlite':
      return new SqliteDriver(deps)
    default:
      throw new Error(`Unsupported driver: ${config.driver}`)
  }
}

export async function connectSession(id: string): Promise<void> {
  if (sessions.has(id)) return
  const config = getConnectionConfig(id)
  if (!config) throw new Error('Connection not found')
  const driver = createDriver(config, getStoredPassword(id))
  await driver.connect()
  sessions.set(id, driver)
}

export async function listEntities(id: string): Promise<EntityInfo[]> {
  return withRetry(id, (d) => d.listEntities())
}

export async function listDatabases(id: string): Promise<string[]> {
  return withRetry(id, (d) => d.listDatabases())
}

export async function currentDatabase(id: string): Promise<string | null> {
  if (!sessions.has(id)) await connectSession(id)
  return sessions.get(id)!.currentDatabase()
}

export async function useDatabase(id: string, name: string): Promise<void> {
  return withRetry(id, (d) => d.useDatabase(name))
}

export async function listEnums(id: string): Promise<EnumType[]> {
  return withRetry(id, (d) => d.listEnums())
}

export async function readRows(
  id: string,
  entity: EntityRef,
  limit: number,
  offset: number,
  filters?: Filter[],
  orderBy?: Sort[]
): Promise<RowsResult> {
  return withRetry(id, (d) => d.readRows(entity, limit, offset, filters, orderBy))
}

export async function countRows(
  id: string,
  entity: EntityRef,
  filters?: Filter[]
): Promise<number> {
  return withRetry(id, (d) => d.countRows(entity, filters))
}

export async function searchRows(
  id: string,
  entity: EntityRef,
  term: string,
  limit: number,
  offset: number
): Promise<SearchResult> {
  return withRetry(id, (d) => d.searchRows(entity, term, limit, offset))
}

export async function exportAllRows(
  id: string,
  entity: EntityRef,
  filters?: Filter[],
  orderBy?: Sort[]
): Promise<SearchResult> {
  const PAGE = 1000
  const MAX = 500_000
  let offset = 0
  let columns: SearchResult['columns'] = []
  const rows: Record<string, unknown>[] = []
  for (;;) {
    const res = await withRetry(id, (d) => d.readRows(entity, PAGE, offset, filters, orderBy))
    if (offset === 0) columns = res.columns
    rows.push(...res.rows)
    if (res.rows.length < PAGE || rows.length >= MAX) break
    offset += PAGE
  }
  return { columns, rows }
}

export async function applyChanges(
  id: string,
  entity: EntityRef,
  changes: ChangeSet
): Promise<ApplyResult> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; writes are blocked')
  const res = await withRetry(id, (d) => d.applyChanges(entity, changes))
  await captureAll(id, 'data_mutation', res.statements ?? [], entity.name)
  return res
}

export async function describeTable(
  id: string,
  entity: EntityRef
): Promise<TableStructure> {
  return withRetry(id, (d) => d.describeTable(entity))
}

export async function listReferencingTables(
  id: string,
  entity: EntityRef
): Promise<ReferencingTable[]> {
  return withRetry(id, (d) => d.listReferencingTables(entity))
}

export async function getCreateSql(
  id: string,
  entity: EntityRef
): Promise<string> {
  return withRetry(id, (d) => d.getCreateSql(entity))
}

export async function createTable(
  id: string,
  spec: CreateTableSpec
): Promise<{ ddl: string }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await sessions.get(id)!.createTable(spec)
  await captureAll(id, 'table_mutation', [res.ddl], spec.name)
  return res
}

export async function alterTable(
  id: string,
  entity: EntityRef,
  ops: SchemaOp[]
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  const res = await withRetry(id, (d) => d.alterTable(entity, ops))
  await captureAll(id, 'table_mutation', res.statements, entity.name)
  return res
}

/** Build the DDL that alterTable would run, without executing or capturing it
 *  (pre-commit preview). Harmless on read-only connections. */
export async function previewAlter(
  id: string,
  entity: EntityRef,
  ops: SchemaOp[]
): Promise<{ statements: string[] }> {
  return withRetry(id, (d) => d.alterTable(entity, ops, true))
}

export async function dropEntity(
  id: string,
  entity: EntityRef,
  type: EntityType
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await sessions.get(id)!.dropEntity(entity, type)
  await captureAll(id, 'table_mutation', res.statements, entity.name)
  return res
}

export async function renameTable(
  id: string,
  entity: EntityRef,
  newName: string
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await sessions.get(id)!.renameTable(entity, newName)
  await captureAll(id, 'table_mutation', res.statements, entity.name)
  return res
}

export async function truncateTable(
  id: string,
  entity: EntityRef
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; writes are blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await sessions.get(id)!.truncateTable(entity)
  await captureAll(id, 'table_mutation', res.statements, entity.name)
  return res
}

export async function createIndex(
  id: string,
  entity: EntityRef,
  spec: IndexSpec
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await sessions.get(id)!.createIndex(entity, spec)
  await captureAll(id, 'table_mutation', res.statements, entity.name)
  return res
}

export async function dropIndex(
  id: string,
  entity: EntityRef,
  name: string
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await sessions.get(id)!.dropIndex(entity, name)
  await captureAll(id, 'table_mutation', res.statements, entity.name)
  return res
}

export async function runScript(
  id: string,
  sql: string,
  autoLimit?: number
): Promise<QueryResult[]> {
  const config = getConnectionConfig(id)
  if (!sessions.has(id)) await connectSession(id)
  const driver = sessions.get(id)!
  const results: QueryResult[] = []
  for (const stmt of splitStatements(sql)) {
    const cls = classifyStatement(stmt)
    if (config?.readOnly && !cls.reads) {
      const error = 'Connection is read-only; only read statements are allowed'
      await capture({
        connectionId: id,
        stream: cls.stream,
        source: 'manual',
        statement: stmt,
        status: 'error',
        error
      })
      results.push({ statement: stmt, kind: 'error', error })
      break
    }
    const exec =
      cls.reads && autoLimit && autoLimit > 0 && !/\blimit\b/i.test(stmt)
        ? `${stmt} LIMIT ${autoLimit}`
        : stmt
    const t0 = Date.now()
    try {
      const r = await driver.query(exec)
      const ms = Date.now() - t0
      // Use `exec` (not `stmt`) so result footer + history reflect the actual
      // SQL that ran — auto-LIMIT appends LIMIT N and must be visible.
      results.push(
        r.rows
          ? { statement: exec, kind: 'rows', columns: r.columns, rows: r.rows, ms }
          : { statement: exec, kind: 'affected', affected: r.affected ?? 0, ms }
      )
      await capture({
        connectionId: id,
        stream: cls.stream,
        source: 'manual',
        statement: exec,
        status: 'success',
        affected: r.affected ?? null
      })
    } catch (err) {
      const ms = Date.now() - t0
      if (isConnectionFatal(err)) {
        // Transport died — reconnect silently, return marker, stop script.
        // Don't capture: this isn't a SQL error, and the statement never ran.
        sessions.delete(id)
        try {
          await connectSession(id)
        } catch {
          // reconnect failed; next op will surface the error
        }
        results.push({ statement: exec, kind: 'reconnected', ms })
        break
      }
      const error = err instanceof Error ? err.message : String(err)
      results.push({ statement: exec, kind: 'error', error, ms })
      await capture({
        connectionId: id,
        stream: cls.stream,
        source: 'manual',
        statement: exec,
        status: 'error',
        error
      })
      break
    }
  }
  return results
}

export async function cancelQuery(id: string): Promise<void> {
  const driver = sessions.get(id)
  if (driver) await driver.cancel()
}

export async function disconnectSession(id: string): Promise<void> {
  const driver = sessions.get(id)
  if (!driver) return
  await driver.close()
  sessions.delete(id)
}

/** Force close (even if already connected) then reconnect fresh. */
export async function reconnectSession(id: string): Promise<void> {
  await disconnectSession(id)
  await connectSession(id)
}
