import type {
  Connection,
  FieldPacket,
  RowDataPacket,
  ResultSetHeader
} from 'mysql2/promise'
import {
  type DbDriver,
  type DriverDeps,
  safePaging,
  buildWhere,
  buildSearch,
  buildOrderBy,
  buildUpdate,
  buildDelete,
  buildInsert,
  buildCreateTable,
  fkActionClause,
  defaultIndexName,
  renderSql
} from '../driver'
import {
  extractColumnDef,
  spliceType,
  spliceNullable,
  spliceDefault,
  dropDefault as dropDefaultClause,
  positionClause
} from '../mysql-coldef'
import type {
  ApplyResult,
  ChangeSet,
  CreateTableSpec,
  EntityInfo,
  EntityRef,
  EntityType,
  EnumType,
  Filter,
  ForeignKey,
  IndexSpec,
  PlanNode,
  QueryPlan,
  RawQueryResult,
  ReferencingTable,
  RowsResult,
  SchemaOp,
  SearchResult,
  Sort,
  TableStructure
} from '../../../shared/types'

function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

const MYSQL_INDEX_METHODS = new Set(['BTREE', 'HASH'])

/** one row of tabular `EXPLAIN` → a flat PlanNode. */
function mysqlExplainRowNode(r: Record<string, unknown>): PlanNode {
  const type = (r.type as string | null) ?? null // ALL, index, range, ref, …
  const key = (r.key as string | null) || null
  const scan: PlanNode['scan'] =
    type === 'ALL' ? 'full' : key ? 'index' : type === 'index' ? 'full' : 'other'
  const est = r.rows != null ? Number(r.rows) : null
  const filtered = r.filtered != null ? Number(r.filtered) : 100
  const table = (r.table as string | null) ?? null
  const selectType = (r.select_type as string | null) ?? 'SIMPLE'
  const detail: string[] = []
  if (r.Extra) detail.push(String(r.Extra))
  if (r.possible_keys) detail.push(`possible: ${r.possible_keys}`)
  if (r.ref) detail.push(`ref ${r.ref}`)
  return {
    operation: `${selectType}: ${type ?? '?'}${table ? ` ${table}` : ''}`,
    detail: detail.join(' · ') || undefined,
    scan,
    index: key,
    rows: est != null ? Math.round((est * filtered) / 100) : null,
    cost: est,
    children: []
  }
}

/** Parse MySQL 8 `EXPLAIN ANALYZE` text (indented `->` tree) into PlanNodes. */
function parseMysqlAnalyzeTree(text: string): PlanNode[] {
  const roots: PlanNode[] = []
  const stack: { depth: number; node: PlanNode }[] = []
  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim()) continue
    const arrow = rawLine.indexOf('->')
    if (arrow < 0) continue
    const depth = Math.floor(arrow / 4)
    const body = rawLine.slice(arrow + 2).trim()
    const op = body.split(/\s{2,}\(/)[0].trim()
    const cost = body.match(/cost=([\d.]+)/)
    const estRows = body.match(/\(cost=[\d.]+ rows=([\d.]+)\)/)
    const actual = body.match(/actual time=[\d.]+\.\.([\d.]+) rows=([\d.]+)/)
    const scan: PlanNode['scan'] = /Table scan/i.test(op)
      ? 'full'
      : /index|covering/i.test(op)
        ? 'index'
        : 'other'
    const node: PlanNode = {
      operation: op,
      detail: undefined,
      scan,
      index: (op.match(/index \w+ on \w+ \((\w+)\)/i) ?? [])[1] ?? null,
      rows: estRows ? Number(estRows[1]) : null,
      cost: cost ? Number(cost[1]) : null,
      actualRows: actual ? Number(actual[2]) : null,
      actualMs: actual ? Number(actual[1]) : null,
      children: []
    }
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop()
    if (stack.length) stack[stack.length - 1].node.children.push(node)
    else roots.push(node)
    stack.push({ depth, node })
  }
  return roots
}

export class MysqlDriver implements DbDriver {
  private conn: Connection | null = null
  private connectionId: number | null = null
  // active database; survives reconnects (idle-drop) via `USE` in connect()
  private activeDb: string | null = null

  constructor(private deps: DriverDeps) {
    this.activeDb = deps.config.database || null
  }

  async connect(): Promise<void> {
    const mysql = await import('mysql2/promise')
    const { config, password } = this.deps
    this.conn = await mysql.createConnection({
      host: config.host,
      port: config.port ?? 3306,
      user: config.user,
      password,
      database: this.activeDb || undefined,
      ssl: config.ssl ? {} : undefined,
      connectTimeout: 8000
    })
    // Idle connections can be dropped by the server; mysql2 emits an async
    // 'error' that would crash the main process. Swallow + mark dead so the
    // next query reconnects.
    this.conn.on('error', () => {
      this.conn = null
    })
    try {
      const [r] = (await this.conn.query('SELECT CONNECTION_ID() AS id')) as [
        RowDataPacket[],
        FieldPacket[]
      ]
      this.connectionId = Number((r[0] as { id: number }).id)
    } catch {
      this.connectionId = null
    }
  }

  /** Reconnect if the connection was dropped (idle timeout, server kill). */
  private async ensure(): Promise<Connection> {
    if (!this.conn) await this.connect()
    return this.conn!
  }

  currentDatabase(): string | null {
    return this.activeDb
  }

  async listDatabases(): Promise<string[]> {
    const [rows] = await (await this.ensure()).query(
      'SHOW DATABASES'
    )
    // mysql2 returns a single-column result keyed `Database`
    return (rows as Array<Record<string, string>>)
      .map((r) => Object.values(r)[0])
      .filter(Boolean)
  }

  async useDatabase(name: string): Promise<void> {
    await (await this.ensure()).query(`USE ${quoteIdent(name)}`)
    this.activeDb = name
  }

  async listEntities(): Promise<EntityInfo[]> {
    // No database selected → nothing to list (user picks one from the switcher)
    if (!this.activeDb) return []
    const [rows] = await (await this.ensure()).query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME`
    )
    return (rows as Array<{ name: string; type: string }>).map((r) => ({
      name: r.name,
      type: r.type === 'VIEW' ? 'view' : 'table'
    }))
  }

  async listEnums(): Promise<EnumType[]> {
    return [] // MySQL enums are inline in the column type, not named types
  }

  async readRows(
    entity: EntityRef,
    limit: number,
    offset: number,
    filters?: Filter[],
    orderBy?: Sort[]
  ): Promise<RowsResult> {
    const { limit: l, offset: o } = safePaging(limit, offset)
    const where = buildWhere(filters, quoteIdent, () => '?')
    const order = buildOrderBy(orderBy, quoteIdent)
    const [rows, fields] = (await (await this.ensure()).query(
      `SELECT * FROM ${quoteIdent(entity.name)}${where.clause}${order} LIMIT ${l} OFFSET ${o}`,
      where.params
    )) as [RowDataPacket[], FieldPacket[]]
    const [pkRows] = (await (await this.ensure()).query(
      `SELECT COLUMN_NAME AS name
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          AND CONSTRAINT_NAME = 'PRIMARY'
        ORDER BY ORDINAL_POSITION`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const [typeRows] = (await (await this.ensure()).query(
      `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const metaMap = new Map(
      (typeRows as Array<{ name: string; type: string; nullable: string }>).map(
        (t) => [t.name, t]
      )
    )
    const [fkRows] = (await (await this.ensure()).query(
      `SELECT COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS refTable,
              REFERENCED_COLUMN_NAME AS refColumn
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const foreignKeys: ForeignKey[] = (
      fkRows as Array<{ col: string; refTable: string; refColumn: string }>
    ).map((f) => ({
      column: f.col,
      refTable: f.refTable,
      refColumn: f.refColumn
    }))
    return {
      columns: fields.map((f) => {
        const m = metaMap.get(f.name)
        return { name: f.name, type: m?.type, nullable: m?.nullable === 'YES' }
      }),
      rows: rows as Record<string, unknown>[],
      primaryKey: (pkRows as Array<{ name: string }>).map((r) => r.name),
      foreignKeys
    }
  }

  async searchRows(
    entity: EntityRef,
    term: string,
    limit: number,
    offset: number
  ): Promise<SearchResult> {
    const { limit: l, offset: o } = safePaging(limit, offset)
    const [colRows] = (await (await this.ensure()).query(
      `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const cols = colRows as Array<{ name: string; type: string }>
    const names = cols.map((c) => c.name)
    const search = buildSearch(
      names,
      term,
      quoteIdent,
      () => '?',
      (col) => `CAST(${col} AS CHAR)`
    )
    const order = names.length ? ` ORDER BY ${quoteIdent(names[0])}` : ''
    const [rows] = (await (await this.ensure()).query(
      `SELECT * FROM ${quoteIdent(entity.name)}${search.clause}${order} LIMIT ${l} OFFSET ${o}`,
      search.params
    )) as [RowDataPacket[], FieldPacket[]]
    return {
      columns: cols.map((c) => ({ name: c.name, type: c.type })),
      rows: rows as Record<string, unknown>[]
    }
  }

  async countRows(entity: EntityRef, filters?: Filter[]): Promise<number> {
    const where = buildWhere(filters, quoteIdent, () => '?')
    const [rows] = (await (await this.ensure()).query(
      `SELECT count(*) AS c FROM ${quoteIdent(entity.name)}${where.clause}`,
      where.params
    )) as [RowDataPacket[], FieldPacket[]]
    return Number((rows[0] as { c: number | bigint }).c)
  }

  async applyChanges(
    entity: EntityRef,
    changes: ChangeSet
  ): Promise<ApplyResult> {
    const target = quoteIdent(entity.name)
    const statements: string[] = []
    await (await this.ensure()).beginTransaction()
    try {
      let affected = 0
      const run = async (sql: string, params: unknown[]): Promise<void> => {
        const [res] = (await this.conn!.query(sql, params)) as [
          ResultSetHeader,
          FieldPacket[]
        ]
        affected += res.affectedRows ?? 0
        statements.push(renderSql(sql, params, '?'))
      }
      for (const row of changes.inserts) {
        const built = buildInsert(target, row, quoteIdent, () => '?')
        if (built) await run(built.sql, built.params)
      }
      for (const e of changes.updates) {
        const { sql, params } = buildUpdate(
          target,
          e.changes,
          e.pk,
          quoteIdent,
          () => '?'
        )
        await run(sql, params)
      }
      for (const pk of changes.deletes) {
        const { sql, params } = buildDelete(target, pk, quoteIdent, () => '?')
        await run(sql, params)
      }
      await this.conn?.commit()
      return { affected, statements }
    } catch (err) {
      await this.conn?.rollback()
      throw err
    }
  }

  async describeTable(entity: EntityRef): Promise<TableStructure> {
    const [colRows] = (await (await this.ensure()).query(
      `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
              COLUMN_DEFAULT AS dflt, COLUMN_KEY AS ckey
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const [fkRows] = (await (await this.ensure()).query(
      `SELECT kcu.COLUMN_NAME AS col, kcu.REFERENCED_TABLE_NAME AS refTable,
              kcu.REFERENCED_COLUMN_NAME AS refColumn, kcu.CONSTRAINT_NAME AS conname,
              rc.UPDATE_RULE AS onUpdate, rc.DELETE_RULE AS onDelete
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
        WHERE kcu.TABLE_SCHEMA = DATABASE() AND kcu.TABLE_NAME = ?
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const fkList = fkRows as Array<{
      col: string
      refTable: string
      refColumn: string
      conname: string
      onUpdate: string
      onDelete: string
    }>
    const fkMap = new Map(
      fkList.map((f) => [
        f.col,
        {
          refTable: f.refTable,
          refColumn: f.refColumn,
          onUpdate: f.onUpdate,
          onDelete: f.onDelete,
          constraint: f.conname
        }
      ])
    )
    const relations = fkList.map((f) => ({
      column: f.col,
      refTable: f.refTable,
      refColumn: f.refColumn,
      onUpdate: f.onUpdate,
      onDelete: f.onDelete,
      constraint: f.conname
    }))
    const columns = (
      colRows as Array<{
        name: string
        type: string
        nullable: string
        dflt: string | null
        ckey: string
      }>
    ).map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable === 'YES',
      default: c.dflt,
      pk: c.ckey === 'PRI',
      fk: fkMap.get(c.name)
    }))
    const [idxRows] = (await (await this.ensure()).query(
      `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonuniq, COLUMN_NAME AS col,
              INDEX_TYPE AS method, SEQ_IN_INDEX AS seq
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const idxMap = new Map<
      string,
      { unique: boolean; columns: string[]; method: string }
    >()
    for (const r of idxRows as Array<{
      name: string
      nonuniq: number
      col: string
      method: string
    }>) {
      const e = idxMap.get(r.name) ?? {
        unique: r.nonuniq === 0,
        columns: [],
        method: (r.method ?? '').toLowerCase()
      }
      e.columns.push(r.col)
      idxMap.set(r.name, e)
    }
    const indexes = [...idxMap].map(([name, v]) => ({ name, ...v }))
    const [engRows] = (await (await this.ensure()).query(
      `SELECT ENGINE AS engine FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const engine = (engRows[0] as { engine?: string } | undefined)?.engine
    return { columns, indexes, relations, engine: engine ?? undefined }
  }

  async listReferencingTables(entity: EntityRef): Promise<ReferencingTable[]> {
    const [rows] = (await (await this.ensure()).query(
      `SELECT kcu.TABLE_NAME AS tbl, kcu.COLUMN_NAME AS col,
              kcu.REFERENCED_COLUMN_NAME AS refColumn,
              kcu.CONSTRAINT_NAME AS conname,
              rc.UPDATE_RULE AS onUpdate, rc.DELETE_RULE AS onDelete
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
        WHERE kcu.REFERENCED_TABLE_SCHEMA = DATABASE()
          AND kcu.REFERENCED_TABLE_NAME = ?
        ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    return (
      rows as Array<{
        tbl: string
        col: string
        refColumn: string
        conname: string
        onUpdate: string
        onDelete: string
      }>
    ).map((r) => ({
      table: r.tbl,
      column: r.col,
      refColumn: r.refColumn,
      constraint: r.conname,
      onUpdate: r.onUpdate,
      onDelete: r.onDelete
    }))
  }

  async getCreateSql(entity: EntityRef): Promise<string> {
    const [tt] = (await (await this.ensure()).query(
      `SELECT TABLE_TYPE AS t FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [entity.name]
    )) as [RowDataPacket[], FieldPacket[]]
    const isView = (tt[0] as { t?: string } | undefined)?.t === 'VIEW'
    const [rows] = (await (await this.ensure()).query(
      `SHOW CREATE ${isView ? 'VIEW' : 'TABLE'} ${quoteIdent(entity.name)}`
    )) as [RowDataPacket[], FieldPacket[]]
    const r = rows[0] as Record<string, string> | undefined
    const ddl = r?.['Create Table'] ?? r?.['Create View'] ?? ''
    return ddl ? ddl.trim() + ';' : `-- no DDL found for ${entity.name}`
  }

  async createTable(spec: CreateTableSpec): Promise<{ ddl: string }> {
    const ddl = buildCreateTable(spec, quoteIdent, { dialect: 'mysql' })
    await (await this.ensure()).query(ddl)
    return { ddl }
  }

  async alterTable(
    entity: EntityRef,
    ops: SchemaOp[],
    dryRun = false
  ): Promise<{ statements: string[] }> {
    const t = quoteIdent(entity.name)

    // Column-level changes (type/null/default/position) are coalesced into ONE
    // verbatim-spliced MODIFY per column (ADR-0011) so they never fight and
    // unmodeled attributes (auto_increment, collation, comment…) are preserved.
    type Acc = {
      type?: string
      nullable?: boolean
      setDef?: string
      dropDef?: boolean
      hasMove?: boolean
      after?: string | null
    }
    const perCol = new Map<string, Acc>()
    const moveOrder: string[] = []
    const renameReverse = new Map<string, string>() // newName -> oldName
    const acc = (n: string): Acc => {
      let a = perCol.get(n)
      if (!a) {
        a = {}
        perCol.set(n, a)
      }
      return a
    }

    // structural statements, bucketed for safe ordering
    const dropFk: string[] = []
    const dropIdx: string[] = []
    const structural: string[] = [] // drop/add/rename columns
    const addFk: string[] = []
    const addIdx: string[] = []

    for (const op of ops) {
      switch (op.kind) {
        case 'addColumn': {
          const c = op.column
          const def = c.default && c.default.trim() ? ` DEFAULT ${c.default}` : ''
          const pos = positionClause(op.after, quoteIdent)
          structural.push(
            `ALTER TABLE ${t} ADD COLUMN ${quoteIdent(c.name)} ${c.type}${def}${c.nullable ? '' : ' NOT NULL'}${pos}`
          )
          break
        }
        case 'dropColumn':
          structural.push(`ALTER TABLE ${t} DROP COLUMN ${quoteIdent(op.name)}`)
          break
        case 'renameColumn':
          renameReverse.set(op.to, op.from)
          structural.push(
            `ALTER TABLE ${t} RENAME COLUMN ${quoteIdent(op.from)} TO ${quoteIdent(op.to)}`
          )
          break
        case 'alterColumn': {
          const a = acc(op.name)
          a.type = op.type
          a.nullable = op.nullable
          break
        }
        case 'setDefault':
          acc(op.name).setDef = op.default
          break
        case 'dropDefault':
          acc(op.name).dropDef = true
          break
        case 'moveColumn': {
          const a = acc(op.name)
          a.hasMove = true
          a.after = op.after
          moveOrder.push(op.name)
          break
        }
        case 'addForeignKey':
          addFk.push(
            `ALTER TABLE ${t} ADD FOREIGN KEY (${quoteIdent(op.column)}) REFERENCES ${quoteIdent(op.refTable)} (${quoteIdent(op.refColumn)})${fkActionClause(op.onUpdate, op.onDelete)}`
          )
          break
        case 'dropForeignKey':
          dropFk.push(`ALTER TABLE ${t} DROP FOREIGN KEY ${quoteIdent(op.constraint)}`)
          break
        case 'addIndex':
          addIdx.push(this.createIndexSql(entity, op.spec))
          break
        case 'dropIndex':
          dropIdx.push(this.dropIndexSql(entity, op.name))
          break
      }
    }

    // Build coalesced MODIFYs from the verbatim SHOW CREATE TABLE definition.
    const coalesced: string[] = []
    if (perCol.size > 0) {
      const createSql = await this.getCreateSql(entity)
      const buildModify = (newName: string, a: Acc): string => {
        const oldName = renameReverse.get(newName) ?? newName
        const verbatim = extractColumnDef(createSql, oldName)
        if (verbatim == null)
          throw new Error(
            `Could not read the definition for column "${oldName}" from SHOW CREATE TABLE`
          )
        let def = verbatim
        if (a.type !== undefined) def = spliceType(def, a.type)
        if (a.nullable !== undefined) def = spliceNullable(def, a.nullable)
        if (a.setDef !== undefined) def = spliceDefault(def, a.setDef)
        if (a.dropDef) def = dropDefaultClause(def)
        const pos = a.hasMove ? positionClause(a.after, quoteIdent) : ''
        return `ALTER TABLE ${t} MODIFY ${quoteIdent(newName)} ${def.trim()}${pos}`
      }
      // def-only columns first (no reposition), then moved columns in target order
      for (const [name, a] of perCol) if (!a.hasMove) coalesced.push(buildModify(name, a))
      for (const name of moveOrder) coalesced.push(buildModify(name, perCol.get(name)!))
    }

    const statements = [
      ...dropFk,
      ...dropIdx,
      ...structural,
      ...coalesced,
      ...addFk,
      ...addIdx
    ]
    if (dryRun) return { statements }
    await (await this.ensure()).beginTransaction()
    try {
      for (const s of statements) await (await this.ensure()).query(s)
      await this.conn?.commit()
      return { statements }
    } catch (err) {
      await this.conn?.rollback()
      throw err
    }
  }

  async dropEntity(
    entity: EntityRef,
    type: EntityType
  ): Promise<{ statements: string[] }> {
    const sql = `DROP ${type === 'view' ? 'VIEW' : 'TABLE'} ${quoteIdent(entity.name)}`
    await (await this.ensure()).query(sql)
    return { statements: [sql] }
  }

  async renameTable(
    entity: EntityRef,
    newName: string
  ): Promise<{ statements: string[] }> {
    const sql = `RENAME TABLE ${quoteIdent(entity.name)} TO ${quoteIdent(newName)}`
    await (await this.ensure()).query(sql)
    return { statements: [sql] }
  }

  async truncateTable(entity: EntityRef): Promise<{ statements: string[] }> {
    const sql = `TRUNCATE TABLE ${quoteIdent(entity.name)}`
    await (await this.ensure()).query(sql)
    return { statements: [sql] }
  }

  private createIndexSql(entity: EntityRef, spec: IndexSpec): string {
    const name = spec.name?.trim() || defaultIndexName(entity.name, spec.columns)
    const cols = spec.columns.map(quoteIdent).join(', ')
    const m = spec.method?.toUpperCase()
    const using = m && MYSQL_INDEX_METHODS.has(m) ? ` USING ${m}` : ''
    return `CREATE ${spec.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(name)} ON ${quoteIdent(entity.name)} (${cols})${using}`
  }

  private dropIndexSql(entity: EntityRef, name: string): string {
    return `DROP INDEX ${quoteIdent(name)} ON ${quoteIdent(entity.name)}`
  }

  async createIndex(
    entity: EntityRef,
    spec: IndexSpec
  ): Promise<{ statements: string[] }> {
    const sql = this.createIndexSql(entity, spec)
    await (await this.ensure()).query(sql)
    return { statements: [sql] }
  }

  async dropIndex(
    entity: EntityRef,
    name: string
  ): Promise<{ statements: string[] }> {
    const sql = this.dropIndexSql(entity, name)
    await (await this.ensure()).query(sql)
    return { statements: [sql] }
  }

  async query(sql: string): Promise<RawQueryResult> {
    const [result, fields] = await (await this.ensure()).query(sql)
    if (Array.isArray(result))
      return {
        columns: (fields as FieldPacket[]).map((f) => ({ name: f.name })),
        rows: result as unknown as Record<string, unknown>[]
      }
    return { affected: (result as ResultSetHeader).affectedRows ?? 0 }
  }

  async explainQuery(sql: string, analyze: boolean): Promise<QueryPlan> {
    const conn = await this.ensure()
    if (analyze) {
      const [rows] = await conn.query(`EXPLAIN ANALYZE ${sql}`)
      const text = (rows as Record<string, unknown>[])
        .map((r) => String(Object.values(r)[0] ?? ''))
        .join('\n')
      return {
        engine: 'mysql',
        analyze: true,
        nodes: parseMysqlAnalyzeTree(text),
        raw: text
      }
    }
    const [rows] = await conn.query(`EXPLAIN ${sql}`)
    const list = rows as Record<string, unknown>[]
    return {
      engine: 'mysql',
      analyze: false,
      nodes: list.map(mysqlExplainRowNode),
      raw: JSON.stringify(list, null, 2)
    }
  }

  async cancel(): Promise<void> {
    if (this.connectionId == null) return
    const mysql = await import('mysql2/promise')
    const { config, password } = this.deps
    const c = await mysql.createConnection({
      host: config.host,
      port: config.port ?? 3306,
      user: config.user,
      password,
      database: config.database,
      ssl: config.ssl ? {} : undefined,
      connectTimeout: 8000
    })
    try {
      await c.query(`KILL QUERY ${this.connectionId}`)
    } finally {
      await c.end()
    }
  }

  async close(): Promise<void> {
    await this.conn?.end()
    this.conn = null
  }
}
