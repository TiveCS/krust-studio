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
  RawQueryResult,
  RowsResult,
  SchemaOp,
  SearchResult,
  Sort,
  TableStructure
} from '../../../shared/types'

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
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
    ops: SchemaOp[]
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
      }
    })
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

  async createIndex(
    entity: EntityRef,
    spec: IndexSpec
  ): Promise<{ statements: string[] }> {
    if (!this.db) throw new Error('Not connected')
    const name = spec.name?.trim() || defaultIndexName(entity.name, spec.columns)
    const cols = spec.columns.map(quoteIdent).join(', ')
    const sql = `CREATE ${spec.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(name)} ON ${quoteIdent(entity.name)} (${cols})`
    this.db.exec(sql)
    return { statements: [sql] }
  }

  async dropIndex(
    _entity: EntityRef,
    name: string
  ): Promise<{ statements: string[] }> {
    if (!this.db) throw new Error('Not connected')
    const sql = `DROP INDEX ${quoteIdent(name)}`
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

  async cancel(): Promise<void> {
    throw new Error('SQLite runs synchronously and cannot cancel a query')
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = null
  }
}
