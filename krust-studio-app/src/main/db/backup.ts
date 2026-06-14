import { createWriteStream } from 'fs'
import { readFile } from 'fs/promises'
import { readRows, getCreateSql, execRestoreStatement } from './session'
import { getConnectionConfig } from '../store/connections'
import { splitStatements, classifyStatement } from './driver'
import type {
  BackupResult,
  BackupSpec,
  DriverType,
  EntityRef,
  RestorePreview,
  RestoreRunResult,
  RestoreStatement
} from '../../shared/types'

const BATCH = 500

function quoteIdent(driver: DriverType, name: string): string {
  if (driver === 'mysql') return '`' + name.replace(/`/g, '``') + '`'
  return '"' + name.replace(/"/g, '""') + '"'
}

/** Statements that disable FK enforcement so a dump restores regardless of table
 *  order (child before parent) — the mysqldump / pg_dump --disable-triggers
 *  approach. pg's `session_replication_role` needs table-owner privileges. */
function fkGuards(driver: DriverType): { head: string; foot: string } {
  switch (driver) {
    case 'mysql':
      return {
        head: 'SET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\n\n',
        foot: '\nSET UNIQUE_CHECKS=1;\nSET FOREIGN_KEY_CHECKS=1;\n'
      }
    case 'sqlite':
      return { head: 'PRAGMA foreign_keys=OFF;\n\n', foot: '\nPRAGMA foreign_keys=ON;\n' }
    case 'postgres':
      return {
        head:
          '-- requires table-owner privileges; ignore the error if it fails\n' +
          'SET session_replication_role = replica;\n\n',
        foot: '\nSET session_replication_role = origin;\n'
      }
  }
}

function target(driver: DriverType, entity: EntityRef): string {
  // pg supports schema-qualified names; mysql/sqlite use the bare (quoted) name
  if (driver === 'postgres' && entity.schema)
    return `${quoteIdent(driver, entity.schema)}.${quoteIdent(driver, entity.name)}`
  return quoteIdent(driver, entity.name)
}

/** Build a Postgres array literal body (`{...}`) from a JS array. Elements are
 *  double-quoted with `\`-escaping (NULL stays bare, nested arrays recurse
 *  unquoted) so the result round-trips through a pg array-typed column. */
function pgArrayBody(arr: unknown[]): string {
  const parts = arr.map((el) => {
    if (el === null || el === undefined) return 'NULL'
    if (Array.isArray(el)) return pgArrayBody(el) // nested dims stay unquoted
    const s =
      el instanceof Date
        ? el.toISOString()
        : typeof el === 'object'
          ? JSON.stringify(el)
          : String(el)
    // escape backslash + double-quote for the array-literal element syntax
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  })
  return `{${parts.join(',')}}`
}

/** Engine-aware SQL literal for a backup INSERT. Handles NULL, numbers, bools,
 *  dates, Buffers (BLOB → hex), pg arrays, and objects (JSON columns). */
function sqlLiteral(driver: DriverType, v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean')
    return driver === 'mysql' ? (v ? '1' : '0') : v ? 'TRUE' : 'FALSE'
  if (v instanceof Date) return `'${v.toISOString()}'`
  if (Buffer.isBuffer(v)) {
    const hex = v.toString('hex')
    return driver === 'postgres' ? `'\\x${hex}'` : `X'${hex}'`
  }
  // pg array columns come back as JS arrays — emit a pg array literal `'{...}'`,
  // not JSON, so the value restores into the array-typed column.
  if (driver === 'postgres' && Array.isArray(v))
    return `'${pgArrayBody(v).replace(/'/g, "''")}'`
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

/**
 * Stream a self-contained SQL dump of the selected tables to `filePath`.
 * Schema via getCreateSql; data paged through readRows (auto-retry aware) and
 * written incrementally so large tables stream rather than buffer in memory.
 */
export interface BackupProgress {
  table: string
  index: number
  total: number
  rowsWritten: number
}

export async function runBackup(
  id: string,
  spec: BackupSpec,
  filePath: string,
  onProgress?: (p: BackupProgress) => void
): Promise<BackupResult> {
  const config = getConnectionConfig(id)
  if (!config) throw new Error('Connection not found')
  const driver = config.driver

  const ws = createWriteStream(filePath, { encoding: 'utf-8' })
  const write = (s: string): Promise<void> =>
    new Promise((resolve, reject) => {
      ws.once('error', reject)
      if (ws.write(s)) resolve()
      else ws.once('drain', resolve)
    })

  let tablesWritten = 0
  let rowsWritten = 0
  try {
    const guards = fkGuards(driver)
    await write(
      `-- Krust Studio backup\n-- generated: ${new Date().toISOString()}\n` +
        `-- connection: ${config.name} (${driver})\n\n`
    )
    await write(guards.head)
    const included = spec.tables.filter((t) => t.mode !== 'skip')
    let tableIndex = 0
    for (const t of included) {
      tableIndex++
      onProgress?.({ table: t.name, index: tableIndex, total: included.length, rowsWritten })
      const entity: EntityRef = { name: t.name, schema: t.schema }
      const tgt = target(driver, entity)
      await write(`-- ---------- ${t.name} ----------\n`)

      // schema
      const ddl = await getCreateSql(id, entity)
      if (spec.dropFirst) {
        const kw = t.type === 'view' ? 'VIEW' : 'TABLE'
        await write(`DROP ${kw} IF EXISTS ${tgt};\n`)
      }
      await write(ddl.trim().replace(/;?\s*$/, ';') + '\n')
      tablesWritten++

      // data (views are never dumped with data)
      if (t.mode === 'schema+data' && t.type !== 'view') {
        // order by PK so OFFSET paging is stable (no dup/skip across batches)
        const head = await readRows(id, entity, 1, 0)
        const orderBy = head.primaryKey.length
          ? head.primaryKey.map((c) => ({ column: c, dir: 'asc' as const }))
          : undefined
        let offset = 0
        for (;;) {
          const res = await readRows(id, entity, BATCH, offset, undefined, orderBy)
          if (res.rows.length === 0) break
          const cols = res.columns.map((c) => c.name)
          const qcols = cols.map((c) => quoteIdent(driver, c)).join(', ')
          for (const row of res.rows) {
            const vals = cols.map((c) => sqlLiteral(driver, row[c])).join(', ')
            await write(`INSERT INTO ${tgt} (${qcols}) VALUES (${vals});\n`)
            rowsWritten++
          }
          if (res.rows.length < BATCH) break
          offset += BATCH
        }
      }
      await write('\n')
    }
    await write(guards.foot)
  } finally {
    await new Promise<void>((resolve, reject) => {
      ws.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })
  }
  return { saved: true, path: filePath, tablesWritten, rowsWritten }
}

const DESTRUCTIVE = /^\s*(DROP|TRUNCATE|DELETE)\b/i
// FK-guard / session-setting statements — failure is non-fatal during restore
// (e.g. pg session_replication_role needs owner privileges the user may lack)
const SOFT =
  /^\s*(SET\s+(SESSION\s+)?(FOREIGN_KEY_CHECKS|UNIQUE_CHECKS|session_replication_role)|PRAGMA\s+foreign_keys)\b/i

/** Parse a dump into classified statements without executing (restore dry-run). */
export async function restorePreview(filePath: string): Promise<RestorePreview> {
  const sql = await readFile(filePath, 'utf-8')
  const statements: RestoreStatement[] = splitStatements(sql).map((statement) => {
    const cls = classifyStatement(statement)
    const kind: RestoreStatement['kind'] = cls.reads
      ? 'read'
      : cls.stream === 'table_mutation'
        ? 'ddl'
        : cls.stream === 'data_mutation'
          ? 'dml'
          : 'other'
    return { statement, kind, destructive: DESTRUCTIVE.test(statement) }
  })
  return {
    statements,
    total: statements.length,
    destructiveCount: statements.filter((s) => s.destructive).length
  }
}

/** Execute a previewed dump against the connection (explicit confirm upstream). */
export async function restoreRun(
  id: string,
  filePath: string,
  stopOnError: boolean
): Promise<RestoreRunResult> {
  const config = getConnectionConfig(id)
  if (!config) throw new Error('Connection not found')
  if (config.readOnly)
    throw new Error('Connection is read-only; restore is blocked')

  const sql = await readFile(filePath, 'utf-8')
  const statements = splitStatements(sql)
  const errors: RestoreRunResult['errors'] = []
  let ran = 0
  for (let i = 0; i < statements.length; i++) {
    try {
      await execRestoreStatement(id, statements[i])
      ran++
    } catch (err) {
      // FK-guard / session settings: ignore failure (e.g. no pg privilege)
      if (SOFT.test(statements[i])) continue
      errors.push({
        index: i,
        statement: statements[i],
        error: err instanceof Error ? err.message : String(err)
      })
      if (stopOnError) break
    }
  }
  return { ran, failed: errors.length, errors }
}
