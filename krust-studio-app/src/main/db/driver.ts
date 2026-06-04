import type {
  ApplyResult,
  ChangeSet,
  ConnectionConfig,
  EntityInfo,
  EntityRef,
  EntityType,
  EnumType,
  CreateTableSpec,
  Filter,
  FilterOp,
  IndexSpec,
  RawQueryResult,
  RowsResult,
  SchemaOp,
  SearchResult,
  Sort,
  TableStructure
} from '../../shared/types'

/**
 * A live database driver. One instance wraps one open connection (a Session).
 * Future contract additions (query/cancel, generate-DDL, transactions, etc.)
 * live here so every engine implements them uniformly.
 */
export interface DbDriver {
  connect(): Promise<void>
  /** databases/catalogs visible to this connection (mysql SHOW DATABASES,
   *  pg pg_database). sqlite returns []. */
  listDatabases(): Promise<string[]>
  /** switch the active database. mysql: `USE db` (same connection); pg:
   *  reconnects bound to the new db; sqlite: throws (single-file). */
  useDatabase(name: string): Promise<void>
  /** the currently-active database name, or null when none selected. */
  currentDatabase(): string | null
  listEntities(): Promise<EntityInfo[]>
  listEnums(): Promise<EnumType[]>
  readRows(
    entity: EntityRef,
    limit: number,
    offset: number,
    filters?: Filter[],
    orderBy?: Sort[]
  ): Promise<RowsResult>
  /** Total rows matching the filters (ignores paging). For the row counter. */
  countRows(entity: EntityRef, filters?: Filter[]): Promise<number>
  /** FK Picker: cross-column substring search over a (parent) table. */
  searchRows(
    entity: EntityRef,
    term: string,
    limit: number,
    offset: number
  ): Promise<SearchResult>
  applyChanges(entity: EntityRef, changes: ChangeSet): Promise<ApplyResult>
  describeTable(entity: EntityRef): Promise<TableStructure>
  /** the CREATE statement for a table/view; pg reconstructs from catalog. */
  getCreateSql(entity: EntityRef): Promise<string>
  createTable(spec: CreateTableSpec): Promise<{ ddl: string }>
  /** apply schema ops. `dryRun` builds + returns the statements without
   *  executing them (for the pre-commit DDL preview). */
  alterTable(
    entity: EntityRef,
    ops: SchemaOp[],
    dryRun?: boolean
  ): Promise<{ statements: string[] }>
  /** DROP TABLE/VIEW. Destructive — guarded by read-only + typed confirm (UI). */
  dropEntity(entity: EntityRef, type: EntityType): Promise<{ statements: string[] }>
  /** ALTER/RENAME table to a new name (same schema). */
  renameTable(entity: EntityRef, newName: string): Promise<{ statements: string[] }>
  /** Empty a table's rows. Destructive — guarded like dropEntity. */
  truncateTable(entity: EntityRef): Promise<{ statements: string[] }>
  createIndex(entity: EntityRef, spec: IndexSpec): Promise<{ statements: string[] }>
  dropIndex(entity: EntityRef, name: string): Promise<{ statements: string[] }>
  /** run one arbitrary statement (SQL editor); returns rows or affected count */
  query(sql: string): Promise<RawQueryResult>
  /** cancel the in-flight query (pg/mysql); no-op/throw on sqlite */
  cancel(): Promise<void>
  close(): Promise<void>
}

/**
 * Split a SQL script into statements on top-level `;`, skipping semicolons
 * inside '…' "…" `…` strings, -- line and /* *\/ block comments, and pg $tag$
 * dollar-quoted bodies. Good enough for the editor's run-script.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let buf = ''
  let i = 0
  const n = sql.length
  let quote: string | null = null // ' " `
  let dollarTag: string | null = null // $tag$
  while (i < n) {
    const c = sql[i]
    const c2 = sql[i + 1]
    if (quote) {
      buf += c
      if (c === quote) {
        if (c === "'" && c2 === "'") {
          buf += c2
          i += 2
          continue
        }
        quote = null
      }
      i++
      continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      buf += c
      i++
      continue
    }
    if (c === '-' && c2 === '-') {
      const eol = sql.indexOf('\n', i)
      const end = eol === -1 ? n : eol
      buf += sql.slice(i, end)
      i = end
      continue
    }
    if (c === '/' && c2 === '*') {
      const close = sql.indexOf('*/', i + 2)
      const end = close === -1 ? n : close + 2
      buf += sql.slice(i, end)
      i = end
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c
      buf += c
      i++
      continue
    }
    if (c === '$') {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i))
      if (m) {
        dollarTag = m[0]
        buf += m[0]
        i += m[0].length
        continue
      }
    }
    if (c === ';') {
      if (buf.trim()) out.push(buf.trim())
      buf = ''
      i++
      continue
    }
    buf += c
    i++
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** classify a statement by leading keyword → history stream + result kind */
export function classifyStatement(sql: string): {
  stream: 'data_retrieval' | 'data_mutation' | 'table_mutation'
  reads: boolean
} {
  const kw = sql.replace(/^\s*(\/\*[\s\S]*?\*\/|--[^\n]*\n)*\s*/, '').trimStart()
  const head = kw.slice(0, 12).toUpperCase()
  if (/^(SELECT|WITH|SHOW|EXPLAIN|PRAGMA|DESCRIBE|DESC|VALUES|TABLE)\b/.test(head))
    return { stream: 'data_retrieval', reads: true }
  if (/^(CREATE|ALTER|DROP|TRUNCATE|RENAME|COMMENT|GRANT|REVOKE)\b/.test(head))
    return { stream: 'table_mutation', reads: false }
  return { stream: 'data_mutation', reads: false }
}

/** Default index name when the user leaves it blank: `idx_<table>_<cols>`. */
export function defaultIndexName(table: string, columns: string[]): string {
  return `idx_${[table, ...columns].join('_')}`.replace(/[^\w]/g, '_').slice(0, 60)
}

/** Build CREATE TABLE column defs + optional table-level PK clause. */
export function buildCreateTable(
  spec: CreateTableSpec,
  quote: (s: string) => string,
  opts: {
    singleIntPkInline?: boolean
    dialect?: 'sqlite' | 'mysql' | 'postgres'
  } = {}
): string {
  const pkCols = spec.columns.filter((c) => c.pk).map((c) => c.name)
  const singleInlinePk = opts.singleIntPkInline === true && pkCols.length === 1
  const defs = spec.columns.map((c) => {
    const hasDefault = !!c.default && c.default.trim() !== '' && !c.autoInc
    // SQLite auto-increment is only valid as: INTEGER PRIMARY KEY AUTOINCREMENT
    const sqliteAutoPk =
      opts.dialect === 'sqlite' && !!c.autoInc && singleInlinePk && c.pk
    let d = `${quote(c.name)} ${sqliteAutoPk ? 'INTEGER' : c.type}`
    if (sqliteAutoPk) {
      d += ' PRIMARY KEY AUTOINCREMENT'
    } else {
      if (singleInlinePk && c.pk) d += ' PRIMARY KEY'
      else if (!c.nullable) d += ' NOT NULL'
      if (hasDefault) d += ` DEFAULT ${c.default}`
      if (c.autoInc) {
        if (opts.dialect === 'mysql') d += ' AUTO_INCREMENT'
        else if (opts.dialect === 'postgres') d += ' GENERATED BY DEFAULT AS IDENTITY'
      }
    }
    if (c.fk?.refTable && c.fk.refColumn) {
      d += ` REFERENCES ${quote(c.fk.refTable)} (${quote(c.fk.refColumn)})`
      d += fkActionClause(c.fk.onUpdate, c.fk.onDelete)
    }
    return d
  })
  const parts = [...defs]
  if (pkCols.length > 0 && !singleInlinePk)
    parts.push(`PRIMARY KEY (${pkCols.map(quote).join(', ')})`)
  for (const c of spec.columns) {
    if (!c.fk?.refTable || !c.fk?.refColumn) continue
    let fk = `FOREIGN KEY (${quote(c.name)}) REFERENCES ${quote(c.fk.refTable)} (${quote(c.fk.refColumn)})`
    if (c.fk.onUpdate) fk += ` ON UPDATE ${c.fk.onUpdate}`
    if (c.fk.onDelete) fk += ` ON DELETE ${c.fk.onDelete}`
    parts.push(fk)
  }
  return `CREATE TABLE ${quote(spec.name)} (${parts.join(', ')})`
}

const FK_ACTIONS = new Set([
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT'
])

/** ON UPDATE / ON DELETE clause with whitelisted actions (defends injection). */
export function fkActionClause(onUpdate?: string, onDelete?: string): string {
  let s = ''
  const del = onDelete?.toUpperCase()
  const upd = onUpdate?.toUpperCase()
  if (del && FK_ACTIONS.has(del)) s += ` ON DELETE ${del}`
  if (upd && FK_ACTIONS.has(upd)) s += ` ON UPDATE ${upd}`
  return s
}

/** Build an ORDER BY clause (multi-column, directions whitelisted). */
export function buildOrderBy(
  orderBy: Sort[] | undefined,
  quote: (s: string) => string
): string {
  if (!orderBy?.length) return ''
  const parts = orderBy
    .filter((o) => o.column)
    .map((o) => `${quote(o.column)} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`)
  return parts.length ? ' ORDER BY ' + parts.join(', ') : ''
}

/** Build one parameterized INSERT. Skips columns with empty/undefined values. */
export function buildInsert(
  target: string,
  row: Record<string, unknown>,
  quote: (s: string) => string,
  placeholder: (i: number) => string
): { sql: string; params: unknown[] } | null {
  const cols = Object.keys(row).filter((c) => row[c] !== undefined)
  if (cols.length === 0) return null
  const params: unknown[] = []
  const colSql = cols.map((c) => quote(c)).join(', ')
  const valSql = cols
    .map((c) => {
      params.push(row[c])
      return placeholder(params.length - 1)
    })
    .join(', ')
  return { sql: `INSERT INTO ${target} (${colSql}) VALUES (${valSql})`, params }
}

/** Build one parameterized DELETE for a row identified by its primary key. */
export function buildDelete(
  target: string,
  pk: Record<string, unknown>,
  quote: (s: string) => string,
  placeholder: (i: number) => string
): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  const whereSql = Object.keys(pk)
    .map((c) => {
      params.push(pk[c])
      return `${quote(c)} = ${placeholder(params.length - 1)}`
    })
    .join(' AND ')
  return { sql: `DELETE FROM ${target} WHERE ${whereSql}`, params }
}

/** Build one parameterized UPDATE for a row's staged changes. */
export function buildUpdate(
  target: string,
  changes: Record<string, unknown>,
  pk: Record<string, unknown>,
  quote: (s: string) => string,
  placeholder: (i: number) => string
): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  const setSql = Object.keys(changes)
    .map((c) => {
      params.push(changes[c])
      return `${quote(c)} = ${placeholder(params.length - 1)}`
    })
    .join(', ')
  const whereSql = Object.keys(pk)
    .map((c) => {
      params.push(pk[c])
      return `${quote(c)} = ${placeholder(params.length - 1)}`
    })
    .join(' AND ')
  return {
    sql: `UPDATE ${target} SET ${setSql} WHERE ${whereSql}`,
    params
  }
}

const SQL_OP: Record<FilterOp, string> = {
  eq: '=',
  neq: '<>',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  like: 'LIKE',
  notlike: 'NOT LIKE',
  in: 'IN',
  between: 'BETWEEN',
  isnull: 'IS NULL',
  notnull: 'IS NOT NULL'
}

/**
 * Build a parameterized WHERE clause (AND-joined). Column names are quoted by
 * the engine's `quote`; values are bound via `placeholder(i)` so style differs
 * per engine (`?` for mysql/sqlite, `$n` for postgres).
 */
export function buildWhere(
  filters: Filter[] | undefined,
  quote: (s: string) => string,
  placeholder: (i: number) => string
): { clause: string; params: unknown[] } {
  if (!filters?.length) return { clause: '', params: [] }
  type Seg = {
    sql: string
    conj: 'AND' | 'OR'
    group: number
    groupConj: 'AND' | 'OR'
  }
  const segs: Seg[] = []
  const params: unknown[] = []
  let curFilter: Filter
  const push = (sql: string, conj?: 'and' | 'or'): void => {
    segs.push({
      sql,
      conj: conj === 'or' ? 'OR' : 'AND',
      group: curFilter.group ?? 0,
      groupConj: curFilter.groupConj === 'or' ? 'OR' : 'AND'
    })
  }
  for (const f of filters) {
    curFilter = f
    if (!f.column) continue
    const col = quote(f.column)
    if (f.op === 'isnull' || f.op === 'notnull') {
      push(`${col} ${SQL_OP[f.op]}`, f.conj)
      continue
    }
    if (f.op === 'in') {
      const vals = f.value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
      if (!vals.length) continue
      const phs = vals.map((v) => {
        params.push(v)
        return placeholder(params.length - 1)
      })
      push(`${col} IN (${phs.join(', ')})`, f.conj)
      continue
    }
    if (f.op === 'between') {
      const lo = placeholder(params.length)
      params.push(f.value)
      const hi = placeholder(params.length)
      params.push(f.value2 ?? '')
      push(`${col} BETWEEN ${lo} AND ${hi}`, f.conj)
      continue
    }
    push(`${col} ${SQL_OP[f.op]} ${placeholder(params.length)}`, f.conj)
    params.push(f.value)
  }
  if (!segs.length) return { clause: '', params: [] }
  // bucket contiguous segments by group, join intra by conj, wrap groups in
  // parens, join groups by the group's groupConj (single-level bracketing)
  const buckets: { groupConj: 'AND' | 'OR'; parts: Seg[] }[] = []
  for (const s of segs) {
    const last = buckets[buckets.length - 1]
    if (last && last.parts[0].group === s.group) last.parts.push(s)
    else buckets.push({ groupConj: s.groupConj, parts: [s] })
  }
  const clause = buckets
    .map((b, bi) => {
      const inner = b.parts
        .map((p, pi) => (pi === 0 ? p.sql : ` ${p.conj} ${p.sql}`))
        .join('')
      const wrapped = b.parts.length > 1 ? `(${inner})` : inner
      return bi === 0 ? wrapped : ` ${b.groupConj} ${wrapped}`
    })
    .join('')
  return { clause: ' WHERE ' + clause, params }
}

/**
 * Build a parameterized cross-column substring search (OR-joined). Every column
 * is cast to text and matched with LIKE/ILIKE against `%term%`. Identifiers are
 * engine-quoted; the term is bound once per column via `placeholder(i)`. See
 * ADR 0007. Returns empty when no term/columns (caller treats as "match all").
 */
export function buildSearch(
  columns: string[],
  term: string,
  quote: (s: string) => string,
  placeholder: (i: number) => string,
  cast: (col: string) => string,
  like: 'LIKE' | 'ILIKE' = 'LIKE'
): { clause: string; params: unknown[] } {
  if (!columns.length || !term) return { clause: '', params: [] }
  const params: unknown[] = []
  const parts = columns.map((c) => {
    params.push(`%${term}%`)
    return `${cast(quote(c))} ${like} ${placeholder(params.length - 1)}`
  })
  return { clause: ' WHERE (' + parts.join(' OR ') + ')', params }
}

/**
 * Format a value as a SQL literal — **display only**, for capturing DML into the
 * history log readably. Never used to build executed SQL (that stays
 * parameterized). Single quotes are escaped.
 */
export function formatLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (v instanceof Date) return `'${v.toISOString()}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

/** Inline params into a parameterized statement for a readable history record. */
export function renderSql(
  sql: string,
  params: unknown[],
  style: '?' | '$'
): string {
  if (style === '?') {
    let i = 0
    return sql.replace(/\?/g, () => formatLiteral(params[i++]))
  }
  return sql.replace(/\$(\d+)/g, (_, n) => formatLiteral(params[Number(n) - 1]))
}

/** clamp paging args to safe integers (defends the inlined LIMIT/OFFSET) */
export function safePaging(
  limit: number,
  offset: number
): { limit: number; offset: number } {
  return {
    limit: Math.max(1, Math.min(1000, Math.floor(limit) || 100)),
    offset: Math.max(0, Math.floor(offset) || 0)
  }
}

export interface DriverDeps {
  config: ConnectionConfig
  password?: string
}

/**
 * True when an error indicates the transport/connection itself is dead — not a
 * SQL error. Used by session.ts to decide whether to drop the driver and retry.
 *
 * Covers:
 *  - mysql2: `fatal: true` flag, or network POSIX codes
 *  - pg: SQLSTATE connection-failure codes (08xxx, 57P01), or socket errors
 */
export function isConnectionFatal(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const e = err as NodeJS.ErrnoException & { fatal?: boolean }
  if (e.fatal === true) return true
  const code = e.code ?? ''
  if (
    ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST'].includes(
      code
    )
  )
    return true
  // pg SQLSTATE codes for connection-level failures
  if (['08006', '08001', '08003', '57P01'].includes(code)) return true
  if (
    /connection terminated|connection refused|connection reset|broken pipe/i.test(err.message)
  )
    return true
  return false
}
