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
  QueryPlan,
  QueryResult,
  ReferencingTable,
  IntrospectedTable,
  ProposedRowChange,
  RowsResult,
  SchemaOp,
  SearchResult,
  Sort,
  TableStructure
} from '../../shared/types'
import type { DbDriver, DriverCore, RedisDriver, RoutineCapable } from './driver'
import { splitStatements, classifyStatement, isConnectionFatal } from './driver'
import { MysqlDriver } from './drivers/mysql'
import { PostgresDriver } from './drivers/postgres'
import { SqliteDriver } from './drivers/sqlite'
import { RedisDriver as RedisDriverImpl } from './drivers/redis'
import { getConnectionConfig, getStoredPassword } from '../store/connections'
import { capture } from '../store/history'
import type {
  HistorySource,
  HistoryStream,
  ReadValueOpts,
  RedisCommitBatch,
  RedisCommitResult,
  RedisDbInfo,
  RedisKeyMeta,
  RedisScanResult,
  RedisValuePage,
  RoutineInfo,
  RoutineDef,
  RoutineRef,
  RoutineArg,
  RoutineExecResult
} from '../../shared/types'

const sessions = new Map<string, DriverCore>()

/**
 * Run `fn` against the driver for `id`, retrying once after a connection-fatal
 * error. On fatal: drops the dead driver, reconnects, then calls `fn` again.
 * Only reads and transactional writes use this (non-transactional DDL does not).
 */
async function withRetry<T>(id: string, fn: (driver: DbDriver) => Promise<T>): Promise<T> {
  if (!sessions.has(id)) await connectSession(id)
  try {
    return await fn(sessions.get(id)! as DbDriver)
  } catch (err) {
    if (!isConnectionFatal(err)) throw err
    sessions.delete(id)
    await connectSession(id)
    return fn(sessions.get(id)! as DbDriver)
  }
}

/** the relational driver for a connected session (asserts non-Redis). Used by
 *  the non-transactional DDL paths that access the session directly. */
function rel(id: string): DbDriver {
  return sessions.get(id)! as DbDriver
}

/** withRetry for the Redis (key/value) driver — same auto-recovery contract. */
async function withRetryRedis<T>(
  id: string,
  fn: (driver: RedisDriver) => Promise<T>
): Promise<T> {
  if (!sessions.has(id)) await connectSession(id)
  try {
    return await fn(sessions.get(id)! as RedisDriver)
  } catch (err) {
    if (!isConnectionFatal(err)) throw err
    sessions.delete(id)
    await connectSession(id)
    return fn(sessions.get(id)! as RedisDriver)
  }
}

/**
 * True for statements that are irreversible by nature: TRUNCATE, DROP, and
 * DELETE/UPDATE without a WHERE clause. Used to gate changeset auto-attach.
 */
function isDestructiveStatement(sql: string): boolean {
  const body = sql.replace(/^\s*(\/\*[\s\S]*?\*\/|--[^\n]*\n)*\s*/, '').trimStart()
  const head = body.slice(0, 10).toUpperCase()
  // DROP INDEX is not data loss (matches the GUI dropIndex path, which never
  // flags it destructive) — exclude before the bare DROP rule below.
  if (/^DROP\s+INDEX\b/i.test(body)) return false
  if (/^(TRUNCATE|DROP)\b/.test(head)) return true
  if (/^(DELETE|UPDATE)\b/.test(head) && !/\bWHERE\b/i.test(body)) return true
  return false
}

/**
 * Record captured statements (best-effort; capture() swallows its own errors).
 * `destructive` defaults to **per-statement detection** rather than `false`: the
 * caller usually cannot know, and getting it wrong lets an unscoped statement
 * ride into a changeset export (ADR-0024).
 */
async function captureAll(
  connectionId: string,
  stream: HistoryStream,
  statements: string[],
  entity: string | null,
  affected: number | null = null,
  destructive?: boolean,
  opts: { source?: HistorySource; changesetId?: number | null } = {}
): Promise<void> {
  for (const statement of statements) {
    await capture({
      connectionId,
      stream,
      source: opts.source ?? 'gui',
      statement,
      status: 'success',
      entity,
      affected,
      destructive: destructive ?? isDestructiveStatement(statement),
      ...(opts.changesetId !== undefined ? { changesetId: opts.changesetId } : {})
    })
  }
}

function createDriver(config: ConnectionConfig, password?: string): DriverCore {
  const deps = { config, password }
  switch (config.driver) {
    case 'mysql':
      return new MysqlDriver(deps)
    case 'postgres':
      return new PostgresDriver(deps)
    case 'sqlite':
      return new SqliteDriver(deps)
    case 'redis':
      return new RedisDriverImpl(deps)
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
  orderBy?: Sort[],
  rawWhere?: string
): Promise<RowsResult> {
  return withRetry(id, (d) => d.readRows(entity, limit, offset, filters, orderBy, rawWhere))
}

export async function countRows(
  id: string,
  entity: EntityRef,
  filters?: Filter[],
  rawWhere?: string
): Promise<number> {
  return withRetry(id, (d) => d.countRows(entity, filters, rawWhere))
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
  orderBy?: Sort[],
  rawWhere?: string
): Promise<SearchResult> {
  const PAGE = 1000
  const MAX = 500_000
  let offset = 0
  let columns: SearchResult['columns'] = []
  const rows: Record<string, unknown>[] = []
  for (;;) {
    const res = await withRetry(id, (d) => d.readRows(entity, PAGE, offset, filters, orderBy, rawWhere))
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

/**
 * Apply a committed AI Data Proposal's predicate-scoped row changes (ADR-0024).
 * Runs in one transaction, captures each statement as **source `ai`** bound to
 * the proposal's changeset, and honours the read-only guard like every other
 * mutation path. `dryRun` renders the DML without touching the DB — it drives
 * the review preview and the read-only export.
 */
export async function applyRowChanges(
  id: string,
  changes: ProposedRowChange[],
  opts: { dryRun?: boolean; changesetId?: number | null } = {}
): Promise<ApplyResult> {
  if (changes.length === 0) return { affected: 0, statements: [] }
  if (opts.dryRun) {
    if (!sessions.has(id)) await connectSession(id)
    return rel(id).applyRowChanges(changes, true)
  }
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; writes are blocked')
  const res = await withRetry(id, (d) => d.applyRowChanges(changes, false))
  // One entity label per capture call, so group by table to keep it accurate.
  const rendered = res.statements ?? []
  for (let i = 0; i < rendered.length; i++) {
    await captureAll(
      id,
      'data_mutation',
      [rendered[i]],
      changes[i]?.table ?? null,
      null,
      undefined,
      { source: 'ai', changesetId: opts.changesetId }
    )
  }
  return res
}

/** rows a proposal's predicate currently matches — the affected-row preview */
export async function countPredicate(
  id: string,
  entity: EntityRef,
  filters: Filter[]
): Promise<number> {
  return withRetry(id, (d) => d.countPredicate(entity, filters))
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

/** whole-schema structure in one bulk pass when the driver supports it; null
 *  falls the caller back to per-table describeTable (MCP introspection). */
export async function bulkIntrospect(id: string): Promise<IntrospectedTable[] | null> {
  return withRetry(id, (d) => (d.bulkIntrospect ? d.bulkIntrospect() : Promise.resolve(null)))
}

export async function getCreateSql(
  id: string,
  entity: EntityRef
): Promise<string> {
  return withRetry(id, (d) => d.getCreateSql(entity))
}

export async function createTable(
  id: string,
  spec: CreateTableSpec,
  dryRun?: boolean
): Promise<{ ddl: string }> {
  const config = getConnectionConfig(id)
  // A dry-run only builds the DDL for the preview — no execution, no capture, so
  // it is allowed on read-only. A real create is read-only blocked.
  if (dryRun) {
    if (!sessions.has(id)) await connectSession(id)
    return rel(id).createTable(spec, true)
  }
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await rel(id).createTable(spec)
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
  const res = await rel(id).dropEntity(entity, type)
  await captureAll(id, 'table_mutation', res.statements, entity.name, null, true)
  return res
}

export async function renameTable(
  id: string,
  entity: EntityRef,
  newName: string,
  dryRun?: boolean
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  // A dry-run only builds the SQL for the preview — no execution, no capture, so
  // it is allowed even on read-only. A real rename is read-only blocked.
  if (!dryRun && config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await rel(id).renameTable(entity, newName, dryRun)
  if (dryRun) return res
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
  const res = await rel(id).truncateTable(entity)
  await captureAll(id, 'data_mutation', res.statements, entity.name, null, true)
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
  const res = await rel(id).createIndex(entity, spec)
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
  const res = await rel(id).dropIndex(entity, name)
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
  const driver = rel(id)
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
        affected: r.affected ?? null,
        destructive: isDestructiveStatement(stmt)
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

/**
 * EXPLAIN / EXPLAIN ANALYZE a statement (ADR-0014). Diagnostic — **not captured
 * to history** (would pollute the Data Retrieval stream). ANALYZE executes the
 * statement, so a write under ANALYZE is blocked on read-only connections.
 */
export async function explainQuery(
  id: string,
  sql: string,
  analyze: boolean
): Promise<QueryPlan> {
  const config = getConnectionConfig(id)
  if (analyze && config?.readOnly && !classifyStatement(sql).reads)
    throw new Error('Connection is read-only; cannot ANALYZE a write statement')
  return withRetry(id, (d) => d.explainQuery(sql, analyze))
}

/**
 * Run one statement as part of a restore. **No auto-retry** — a partially
 * applied write must not silently re-run. Only DDL (table_mutation) is captured
 * to history; bulk DML (thousands of INSERTs) is skipped to avoid flooding the
 * audit log — the restore was explicitly previewed + confirmed by the user.
 */
export async function execRestoreStatement(id: string, sql: string): Promise<void> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; restore is blocked')
  if (!sessions.has(id)) await connectSession(id)
  const cls = classifyStatement(sql)
  await rel(id).query(sql)
  if (cls.stream === 'table_mutation') {
    await capture({
      connectionId: id,
      stream: 'table_mutation',
      source: 'manual',
      statement: sql,
      status: 'success'
    })
  }
}

// ─────────────────── Routines: procedures & functions (ADR-0021) ──────────
// mysql/postgres only (gated by the `routines` capability). Relational sessions
// implement RoutineCapable; sqlite does not (never reached — UI hides it).

/** cast a live relational session to its routine capability */
const routineCap = (d: DbDriver): RoutineCapable => d as unknown as RoutineCapable

export async function listRoutines(id: string): Promise<RoutineInfo[]> {
  return withRetry(id, (d) => routineCap(d).listRoutines())
}

export async function getRoutine(id: string, ref: RoutineRef): Promise<RoutineDef> {
  return withRetry(id, (d) => routineCap(d).getRoutine(ref))
}

export async function previewRoutineCall(
  id: string,
  ref: RoutineRef,
  args: RoutineArg[]
): Promise<{ statements: string[] }> {
  return withRetry(id, (d) => routineCap(d).previewRoutineCall(ref, args))
}

export async function executeRoutine(
  id: string,
  ref: RoutineRef,
  args: RoutineArg[]
): Promise<RoutineExecResult> {
  const config = getConnectionConfig(id)
  // A procedure is potentially mutating (CALL) → blocked on read-only + captured
  // as Routine Execution. A function runs via SELECT (a read) — normally neither
  // applies, but a VOLATILE / MODIFIES-SQL-DATA function can still write, so it
  // is blocked on read-only too (server-side enforcement, not just the UI).
  if (config?.readOnly) {
    if (ref.kind === 'procedure')
      throw new Error('Connection is read-only; procedure execution is blocked')
    const def = await withRetry(id, (d) => routineCap(d).getRoutine(ref))
    if (def.volatile)
      throw new Error(
        'Connection is read-only; this function may modify data and is blocked'
      )
  }
  const res = await withRetry(id, (d) => routineCap(d).executeRoutine(ref, args))
  if (ref.kind === 'procedure') {
    for (const statement of res.statements) {
      await capture({
        connectionId: id,
        stream: 'routine_execution',
        source: 'gui',
        statement,
        status: 'success',
        entity: ref.name
      })
    }
  }
  return res
}

export async function createRoutine(
  id: string,
  definition: string
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await routineCap(rel(id)).createRoutine(definition)
  await captureAll(id, 'table_mutation', res.statements, null)
  return res
}

export async function dropRoutine(
  id: string,
  ref: RoutineRef
): Promise<{ statements: string[] }> {
  const config = getConnectionConfig(id)
  if (config?.readOnly)
    throw new Error('Connection is read-only; schema changes blocked')
  if (!sessions.has(id)) await connectSession(id)
  const res = await routineCap(rel(id)).dropRoutine(ref)
  await captureAll(id, 'table_mutation', res.statements, ref.name, null, true)
  return res
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

// ─────────────────────────── Redis (ADR-0020) ────────────────────────────
// Key/value ops. Reads need no guard; every mutation enforces read-only in the
// main process and captures the exact command(s) into the redis_mutation stream
// grouped by commit (decision 4).

export async function redisDbInfo(id: string): Promise<RedisDbInfo> {
  return withRetryRedis(id, (d) => d.dbInfo())
}

export async function redisSelectDb(id: string, index: number): Promise<void> {
  return withRetryRedis(id, (d) => d.useDatabase(String(index)))
}

export async function redisScan(
  id: string,
  match: string,
  cursor: string,
  count: number
): Promise<RedisScanResult> {
  return withRetryRedis(id, (d) => d.scanKeys(match, cursor, count))
}

export async function redisKeyMeta(
  id: string,
  key: string,
  keyB64?: string
): Promise<RedisKeyMeta> {
  return withRetryRedis(id, (d) => d.keyMeta(key, keyB64))
}

export async function redisReadValue(
  id: string,
  key: string,
  opts: ReadValueOpts,
  keyB64?: string
): Promise<RedisValuePage> {
  return withRetryRedis(id, (d) => d.readValue(key, opts, keyB64))
}

export async function redisKeyTtls(id: string, keysB64: string[]): Promise<number[]> {
  return withRetryRedis(id, (d) => d.keyTtls(keysB64))
}

export async function redisCommit(
  id: string,
  batch: RedisCommitBatch
): Promise<RedisCommitResult> {
  const config = getConnectionConfig(id)
  if (config?.readOnly) throw new Error('Connection is read-only; writes are blocked')
  const res = await withRetryRedis(id, (d) => d.commit(batch))
  if (res.ok) {
    for (const cmd of batch.commands) {
      await capture({
        connectionId: id,
        stream: 'redis_mutation',
        source: 'gui',
        statement: cmd.args
          .map((a) =>
            typeof a === 'string'
              ? a
              : `<binary ${Math.floor((a.b64.length * 3) / 4)} bytes>`
          )
          .join(' '),
        status: 'success',
        entity: batch.key,
        commitGroup: res.commitGroup,
        destructive: cmd.destructive
      })
    }
  }
  return res
}

export async function redisRenameKey(
  id: string,
  from: string,
  to: string,
  overwrite: boolean
): Promise<RedisCommitResult> {
  const config = getConnectionConfig(id)
  if (config?.readOnly) throw new Error('Connection is read-only; writes are blocked')
  const res = await withRetryRedis(id, (d) => d.renameKey(from, to, overwrite))
  if (res.ok) {
    await capture({
      connectionId: id,
      stream: 'redis_mutation',
      source: 'gui',
      statement: `${overwrite ? 'RENAME' : 'RENAMENX'} ${from} ${to}`,
      status: 'success',
      entity: from,
      commitGroup: res.commitGroup,
      destructive: overwrite // overwrite drops the target key's value
    })
  }
  return res
}

export async function redisDeleteKey(
  id: string,
  key: string,
  keyB64?: string
): Promise<RedisCommitResult> {
  const config = getConnectionConfig(id)
  if (config?.readOnly) throw new Error('Connection is read-only; writes are blocked')
  const res = await withRetryRedis(id, (d) => d.deleteKey(key, keyB64))
  if (res.ok) {
    await capture({
      connectionId: id,
      stream: 'redis_mutation',
      source: 'gui',
      statement: `UNLINK ${key}`,
      status: 'success',
      entity: key,
      commitGroup: res.commitGroup,
      destructive: true
    })
  }
  return res
}
