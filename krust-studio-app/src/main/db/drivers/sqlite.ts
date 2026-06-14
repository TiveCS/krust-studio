import { existsSync } from 'fs'
import type { DatabaseSync } from 'node:sqlite'
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
  defaultIndexName,
  classifyStatement,
  renderSql
} from '../driver'
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
  return '"' + name.replace(/"/g, '""') + '"'
}

/** classify one `EXPLAIN QUERY PLAN` detail line into a PlanNode. */
function sqlitePlanNode(detail: string): PlanNode {
  const idx = detail.match(/USING (?:COVERING )?INDEX (\w+)/i)
  const usesIndex = /USING (?:COVERING )?INDEX/i.test(detail)
  const scan: PlanNode['scan'] =
    /^SCAN\b/i.test(detail) && !usesIndex
      ? 'full'
      : usesIndex || /^SEARCH\b/i.test(detail)
        ? 'index'
        : 'other'
  return {
    operation: detail.split(/\s+/)[0] || 'STEP',
    detail,
    scan,
    index: idx ? idx[1] : null,
    rows: null,
    cost: null,
    children: []
  }
}

export class SqliteDriver implements DbDriver {
  private db: DatabaseSync | null = null

  constructor(private deps: DriverDeps) {}

  async connect(): Promise<void> {
    const { config } = this.deps
    if (!config.sqlitePath) throw new Error('SQLite file path is required')
    if (!existsSync(config.sqlitePath))
      throw new Error(`SQLite file not found: ${config.sqlitePath}`)
    const { DatabaseSync } = await import('node:sqlite')
    this.db = new DatabaseSync(config.sqlitePath, {
      readOnly: config.readOnly ?? false
    })
  }

  currentDatabase(): string | null {
    // single-file DB — report the file's base name as the "database"
    const p = this.deps.config.sqlitePath
    return p ? p.replace(/^.*[\\/]/, '') : null
  }

  async listDatabases(): Promise<string[]> {
    const cur = this.currentDatabase()
    return cur ? [cur] : []
  }

  async useDatabase(): Promise<void> {
    throw new Error('SQLite is a single-file database; cannot switch database')
  }

  async listEntities(): Promise<EntityInfo[]> {
    if (!this.db) throw new Error('Not connected')
    const rows = this.db
      .prepare(
        `SELECT name, type FROM sqlite_master
          WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
          ORDER BY name`
      )
      .all() as Array<{ name: string; type: string }>
    return rows.map((r) => ({
      name: r.name,
      type: r.type === 'view' ? 'view' : 'table'
    }))
  }

  async listEnums(): Promise<EnumType[]> {
    return [] // SQLite has no enum types
  }

  async readRows(
    entity: EntityRef,
    limit: number,
    offset: number,
    filters?: Filter[],
    orderBy?: Sort[]
  ): Promise<RowsResult> {
    if (!this.db) throw new Error('Not connected')
    const { limit: l, offset: o } = safePaging(limit, offset)
    const where = buildWhere(filters, quoteIdent, () => '?')
    const order = buildOrderBy(orderBy, quoteIdent)
    const rows = this.db
      .prepare(
        `SELECT * FROM ${quoteIdent(entity.name)}${where.clause}${order} LIMIT ${l} OFFSET ${o}`
      )
      .all(...(where.params as never[])) as Record<string, unknown>[]
    const info = this.db
      .prepare('SELECT name, type, pk, "notnull" AS nn FROM pragma_table_info(?)')
      .all(entity.name) as Array<{
      name: string
      type: string
      pk: number
      nn: number
    }>
    const metaMap = new Map(info.map((i) => [i.name, i]))
    const names =
      rows.length > 0 ? Object.keys(rows[0]) : info.map((i) => i.name)
    const columns = names.map((name) => {
      const m = metaMap.get(name)
      return {
        name,
        type: m?.type?.toLowerCase() || undefined,
        nullable: m ? m.nn === 0 : undefined
      }
    })
    const pk = info
      .filter((i) => i.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((i) => ({ name: i.name }))
    const fks = this.db
      .prepare(
        'SELECT "from" AS col, "table" AS refTable, "to" AS refColumn FROM pragma_foreign_key_list(?)'
      )
      .all(entity.name) as Array<{ col: string; refTable: string; refColumn: string }>
    const foreignKeys: ForeignKey[] = fks.map((f) => ({
      column: f.col,
      refTable: f.refTable,
      refColumn: f.refColumn
    }))
    return { columns, rows, primaryKey: pk.map((p) => p.name), foreignKeys }
  }

  async countRows(entity: EntityRef, filters?: Filter[]): Promise<number> {
    if (!this.db) throw new Error('Not connected')
    const where = buildWhere(filters, quoteIdent, () => '?')
    const row = this.db
      .prepare(`SELECT count(*) AS c FROM ${quoteIdent(entity.name)}${where.clause}`)
      .get(...(where.params as never[])) as { c: number | bigint }
    return Number(row.c)
  }

  async searchRows(
    entity: EntityRef,
    term: string,
    limit: number,
    offset: number
  ): Promise<SearchResult> {
    if (!this.db) throw new Error('Not connected')
    const { limit: l, offset: o } = safePaging(limit, offset)
    const info = this.db
      .prepare('SELECT name, type FROM pragma_table_info(?)')
      .all(entity.name) as Array<{ name: string; type: string }>
    const names = info.map((i) => i.name)
    const search = buildSearch(
      names,
      term,
      quoteIdent,
      () => '?',
      (col) => `CAST(${col} AS TEXT)`
    )
    const order = names.length ? ` ORDER BY ${quoteIdent(names[0])}` : ''
    const rows = this.db
      .prepare(
        `SELECT * FROM ${quoteIdent(entity.name)}${search.clause}${order} LIMIT ${l} OFFSET ${o}`
      )
      .all(...(search.params as never[])) as Record<string, unknown>[]
    const columns = info.map((i) => ({
      name: i.name,
      type: i.type?.toLowerCase() || undefined
    }))
    return { columns, rows }
  }

  async applyChanges(
    entity: EntityRef,
    changes: ChangeSet
  ): Promise<ApplyResult> {
    if (!this.db) throw new Error('Not connected')
    const target = quoteIdent(entity.name)
    const statements: string[] = []
    this.db.exec('BEGIN')
    try {
      let affected = 0
      for (const row of changes.inserts) {
        const built = buildInsert(target, row, quoteIdent, () => '?')
        if (built) {
          affected += Number(
            this.db.prepare(built.sql).run(...(built.params as never[])).changes ?? 0
          )
          statements.push(renderSql(built.sql, built.params, '?'))
        }
      }
      for (const e of changes.updates) {
        const { sql, params } = buildUpdate(
          target,
          e.changes,
          e.pk,
          quoteIdent,
          () => '?'
        )
        affected += Number(this.db.prepare(sql).run(...(params as never[])).changes ?? 0)
        statements.push(renderSql(sql, params, '?'))
      }
      for (const pk of changes.deletes) {
        const { sql, params } = buildDelete(target, pk, quoteIdent, () => '?')
        affected += Number(this.db.prepare(sql).run(...(params as never[])).changes ?? 0)
        statements.push(renderSql(sql, params, '?'))
      }
      this.db.exec('COMMIT')
      return { affected, statements }
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  async describeTable(entity: EntityRef): Promise<TableStructure> {
    if (!this.db) throw new Error('Not connected')
    const info = this.db
      .prepare(
        'SELECT name, type, "notnull" AS nn, dflt_value, pk FROM pragma_table_info(?)'
      )
      .all(entity.name) as Array<{
      name: string
      type: string
      nn: number
      dflt_value: string | null
      pk: number
    }>
    const fks = this.db
      .prepare(
        'SELECT "from" AS col, "table" AS refTable, "to" AS refColumn, on_update AS onUpdate, on_delete AS onDelete FROM pragma_foreign_key_list(?)'
      )
      .all(entity.name) as Array<{
      col: string
      refTable: string
      refColumn: string
      onUpdate: string
      onDelete: string
    }>
    const fkMap = new Map(
      fks.map((f) => [
        f.col,
        {
          refTable: f.refTable,
          refColumn: f.refColumn,
          onUpdate: f.onUpdate,
          onDelete: f.onDelete
        }
      ])
    )
    const relations = fks.map((f) => ({
      column: f.col,
      refTable: f.refTable,
      refColumn: f.refColumn,
      onUpdate: f.onUpdate,
      onDelete: f.onDelete
    }))
    const columns = info.map((i) => ({
      name: i.name,
      type: i.type?.toLowerCase() || undefined,
      nullable: i.nn === 0,
      default: i.dflt_value ?? null,
      pk: i.pk > 0,
      fk: fkMap.get(i.name)
    }))
    const idxList = this.db
      .prepare('SELECT name, "unique" AS uniq FROM pragma_index_list(?)')
      .all(entity.name) as Array<{ name: string; uniq: number }>
    const indexes = idxList.map((ix) => {
      const colRows = this.db!
        .prepare('SELECT name FROM pragma_index_info(?)')
        .all(ix.name) as Array<{ name: string }>
      return {
        name: ix.name,
        unique: ix.uniq === 1,
        columns: colRows.map((c) => c.name),
        method: 'btree'
      }
    })
    return { columns, indexes, relations }
  }

  async listReferencingTables(entity: EntityRef): Promise<ReferencingTable[]> {
    if (!this.db) throw new Error('Not connected')
    // SQLite has no reverse-FK catalog — scan every table's foreign-key list
    const tables = this.db
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
      )
      .all() as Array<{ name: string }>
    const out: ReferencingTable[] = []
    for (const t of tables) {
      // includes self-references (a table whose FK points at itself)
      const fks = this.db
        .prepare(
          'SELECT id, "table" AS refTable, "from" AS col, "to" AS refColumn, on_update AS onUpdate, on_delete AS onDelete FROM pragma_foreign_key_list(?)'
        )
        .all(t.name) as Array<{
        id: number
        refTable: string
        col: string
        refColumn: string | null
        onUpdate: string
        onDelete: string
      }>
      for (const fk of fks) {
        if (fk.refTable !== entity.name) continue
        out.push({
          table: t.name,
          column: fk.col,
          // sqlite omits "to" when the FK targets the parent's PK — resolve it
          refColumn: fk.refColumn ?? this.primaryKeyColumn(entity.name) ?? '',
          constraint: `fk_${t.name}_${fk.id}`,
          onUpdate: fk.onUpdate,
          onDelete: fk.onDelete
        })
      }
    }
    return out.sort((a, b) => a.table.localeCompare(b.table))
  }

  /** the (first) primary-key column of a table, for resolving implicit FK targets */
  private primaryKeyColumn(table: string): string | null {
    if (!this.db) return null
    const info = this.db
      .prepare('SELECT name, pk FROM pragma_table_info(?)')
      .all(table) as Array<{ name: string; pk: number }>
    const pk = info.filter((i) => i.pk > 0).sort((a, b) => a.pk - b.pk)
    return pk[0]?.name ?? null
  }

  async getCreateSql(entity: EntityRef): Promise<string> {
    if (!this.db) throw new Error('Not connected')
    const row = this.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE name = ? AND type IN ('table','view')"
      )
      .get(entity.name) as { sql: string | null } | undefined
    if (!row?.sql) return `-- no DDL found for ${entity.name}`
    const main = row.sql.trim().replace(/;?\s*$/, ';')
    // include any secondary indexes
    const idx = this.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY name"
      )
      .all(entity.name) as Array<{ sql: string }>
    const idxSql = idx.map((i) => i.sql.trim().replace(/;?\s*$/, ';'))
    return [main, ...idxSql].join('\n')
  }

  async createTable(spec: CreateTableSpec): Promise<{ ddl: string }> {
    if (!this.db) throw new Error('Not connected')
    const ddl = buildCreateTable(spec, quoteIdent, {
      singleIntPkInline: true,
      dialect: 'sqlite'
    })
    this.db.exec(ddl)
    return { ddl }
  }

  async alterTable(
    entity: EntityRef,
    ops: SchemaOp[],
    dryRun = false
  ): Promise<{ statements: string[] }> {
    if (!this.db) throw new Error('Not connected')
    const t = quoteIdent(entity.name)
    const statements = ops.map((op) => {
      switch (op.kind) {
        case 'addColumn': {
          const c = op.column
          const def =
            c.default && c.default.trim() ? ` DEFAULT ${c.default}` : ''
          return `ALTER TABLE ${t} ADD COLUMN ${quoteIdent(c.name)} ${c.type}${def}${c.nullable ? '' : ' NOT NULL'}`
        }
        case 'dropColumn':
          return `ALTER TABLE ${t} DROP COLUMN ${quoteIdent(op.name)}`
        case 'renameColumn':
          return `ALTER TABLE ${t} RENAME COLUMN ${quoteIdent(op.from)} TO ${quoteIdent(op.to)}`
        case 'alterColumn':
          throw new Error(
            'SQLite cannot change a column’s type or nullability via ALTER'
          )
        case 'setDefault':
        case 'dropDefault':
          throw new Error('SQLite cannot change a column default via ALTER')
        case 'addForeignKey':
        case 'dropForeignKey':
          throw new Error('SQLite cannot add or drop foreign keys via ALTER')
        case 'moveColumn':
          throw new Error('SQLite cannot reorder table columns via ALTER')
        case 'addIndex':
          return this.createIndexSql(entity, op.spec)
        case 'dropIndex':
          return this.dropIndexSql(op.name)
      }
    })
    if (dryRun) return { statements }
    this.db.exec('BEGIN')
    try {
      for (const s of statements) this.db.exec(s)
      this.db.exec('COMMIT')
      return { statements }
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  async dropEntity(
    entity: EntityRef,
    type: EntityType
  ): Promise<{ statements: string[] }> {
    if (!this.db) throw new Error('Not connected')
    const sql = `DROP ${type === 'view' ? 'VIEW' : 'TABLE'} ${quoteIdent(entity.name)}`
    this.db.exec(sql)
    return { statements: [sql] }
  }

  async renameTable(
    entity: EntityRef,
    newName: string
  ): Promise<{ statements: string[] }> {
    if (!this.db) throw new Error('Not connected')
    const sql = `ALTER TABLE ${quoteIdent(entity.name)} RENAME TO ${quoteIdent(newName)}`
    this.db.exec(sql)
    return { statements: [sql] }
  }

  async truncateTable(entity: EntityRef): Promise<{ statements: string[] }> {
    if (!this.db) throw new Error('Not connected')
    // SQLite has no TRUNCATE; DELETE without WHERE empties the table
    const sql = `DELETE FROM ${quoteIdent(entity.name)}`
    this.db.exec(sql)
    return { statements: [sql] }
  }

  private createIndexSql(entity: EntityRef, spec: IndexSpec): string {
    const name = spec.name?.trim() || defaultIndexName(entity.name, spec.columns)
    const cols = spec.columns.map(quoteIdent).join(', ')
    return `CREATE ${spec.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(name)} ON ${quoteIdent(entity.name)} (${cols})`
  }

  private dropIndexSql(name: string): string {
    return `DROP INDEX ${quoteIdent(name)}`
  }

  async createIndex(
    entity: EntityRef,
    spec: IndexSpec
  ): Promise<{ statements: string[] }> {
    if (!this.db) throw new Error('Not connected')
    const sql = this.createIndexSql(entity, spec)
    this.db.exec(sql)
    return { statements: [sql] }
  }

  async dropIndex(
    _entity: EntityRef,
    name: string
  ): Promise<{ statements: string[] }> {
    if (!this.db) throw new Error('Not connected')
    const sql = this.dropIndexSql(name)
    this.db.exec(sql)
    return { statements: [sql] }
  }

  async query(sql: string): Promise<RawQueryResult> {
    if (!this.db) throw new Error('Not connected')
    if (classifyStatement(sql).reads) {
      const rows = this.db.prepare(sql).all() as Record<string, unknown>[]
      const names = rows.length > 0 ? Object.keys(rows[0]) : []
      return { columns: names.map((name) => ({ name })), rows }
    }
    const info = this.db.prepare(sql).run()
    return { affected: Number(info.changes ?? 0) }
  }

  async explainQuery(sql: string, analyze: boolean): Promise<QueryPlan> {
    if (!this.db) throw new Error('Not connected')
    // EXPLAIN QUERY PLAN never executes the statement, so there are no actual
    // timings — the `analyze` flag is echoed but adds nothing on sqlite.
    const rows = this.db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all() as { id: number; parent: number; detail: string }[]
    const byId = new Map<number, PlanNode>()
    const roots: PlanNode[] = []
    for (const r of rows) byId.set(r.id, sqlitePlanNode(r.detail))
    for (const r of rows) {
      const node = byId.get(r.id)!
      const parent = byId.get(r.parent)
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    return {
      engine: 'sqlite',
      analyze,
      nodes: roots,
      raw: rows.map((r) => `${r.id}|${r.parent}|${r.detail}`).join('\n')
    }
  }

  async cancel(): Promise<void> {
    throw new Error('SQLite runs synchronously and cannot cancel a query')
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = null
  }
}
