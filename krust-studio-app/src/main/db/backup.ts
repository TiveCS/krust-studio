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

function target(driver: DriverType, entity: EntityRef): string {
  // pg supports schema-qualified names; mysql/sqlite use the bare (quoted) name
  if (driver === 'postgres' && entity.schema)
    return `${quoteIdent(driver, entity.schema)}.${quoteIdent(driver, entity.name)}`
  return quoteIdent(driver, entity.name)
}

/** Engine-aware SQL literal for a backup INSERT. Handles NULL, numbers, bools,
 *  dates, Buffers (BLOB → hex), and objects (JSON columns). */
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
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

/**
 * Stream a self-contained SQL dump of the selected tables to `filePath`.
 * Schema via getCreateSql; data paged through readRows (auto-retry aware) and
 * written incrementally so large tables stream rather than buffer in memory.
 */
export async function runBackup(
  id: string,
  spec: BackupSpec,
  filePath: string
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
    await write(
      `-- Krust Studio backup\n-- generated: ${new Date().toISOString()}\n` +
        `-- connection: ${config.name} (${driver})\n\n`
    )
    for (const t of spec.tables) {
      if (t.mode === 'skip') continue
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
        let offset = 0
        for (;;) {
          const res = await readRows(id, entity, BATCH, offset)
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
  } finally {
    await new Promise<void>((resolve, reject) => {
      ws.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })
  }
  return { saved: true, path: filePath, tablesWritten, rowsWritten }
}

const DESTRUCTIVE = /^\s*(DROP|TRUNCATE|DELETE)\b/i

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
