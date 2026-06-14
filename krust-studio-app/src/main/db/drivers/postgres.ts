import type { Client } from 'pg'
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

/** parse one node of a Postgres `EXPLAIN (FORMAT JSON)` plan into a PlanNode. */
function pgPlanNode(p: Record<string, unknown>): PlanNode {
  const nodeType = String(p['Node Type'] ?? 'Node')
  const indexName = (p['Index Name'] as string | undefined) ?? null
  const scan: PlanNode['scan'] = /Seq Scan/i.test(nodeType)
    ? 'full'
    : /Index|Bitmap/i.test(nodeType)
      ? 'index'
      : 'other'
  const rel = p['Relation Name'] as string | undefined
  const alias = p['Alias'] as string | undefined
  const detail: string[] = []
  if (rel) detail.push(`on ${rel}${alias && alias !== rel ? ` ${alias}` : ''}`)
  if (indexName) detail.push(`using ${indexName}`)
  if (p['Index Cond']) detail.push(`cond ${p['Index Cond']}`)
  if (p['Filter']) detail.push(`filter ${p['Filter']}`)
  const kids = (p['Plans'] as Record<string, unknown>[] | undefined) ?? []
  return {
    operation: nodeType,
    detail: detail.join(' · ') || undefined,
    scan,
    index: indexName,
    rows: (p['Plan Rows'] as number | undefined) ?? null,
    cost: (p['Total Cost'] as number | undefined) ?? null,
    actualRows: (p['Actual Rows'] as number | undefined) ?? null,
    actualMs: (p['Actual Total Time'] as number | undefined) ?? null,
    children: kids.map(pgPlanNode)
  }
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

const PG_INDEX_METHODS = new Set([
  'btree',
  'hash',
  'gist',
  'gin',
  'spgist',
  'brin'
])

export class PostgresDriver implements DbDriver {
  private client: Client | null = null
  private backendPid: number | null = null
  // a pg connection is bound to one db; switching reconnects with this override.
  // Empty config.database → fall back to the `postgres` maintenance db.
  private activeDb: string

  constructor(private deps: DriverDeps) {
    this.activeDb = deps.config.database || 'postgres'
  }

  async connect(): Promise<void> {
    const { Client } = await import('pg')
    const { config, password } = this.deps
    this.client = new Client({
      host: config.host,
      port: config.port ?? 5432,
      user: config.user,
      password,
      database: this.activeDb,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      // serverless pg (Neon, etc.) can cold-start slowly; give it room
      connectionTimeoutMillis: 20000
    })
    // Idle serverless DBs (Neon, etc.) terminate the connection; pg emits an
    // async 'error' event. Without a listener it becomes an uncaught exception
    // and crashes the main process. Swallow it and mark the client dead so the
    // next query reconnects.
    this.client.on('error', () => {
      this.client = null
    })
    await this.client.connect()
    try {
      const r = await this.client.query('SELECT pg_backend_pid() AS pid')
      this.backendPid = (r.rows[0] as { pid: number } | undefined)?.pid ?? null
    } catch {
      this.backendPid = null
    }
  }

  /** Reconnect if the connection was dropped (idle timeout, admin kill). */
  private async ensure(): Promise<Client> {
    if (!this.client) await this.connect()
    return this.client!
  }

  currentDatabase(): string | null {
    return this.activeDb
  }

  async listDatabases(): Promise<string[]> {
    const res = await (await this.ensure()).query(
      `SELECT datname FROM pg_database
        WHERE datistemplate = false AND datallowconn = true
        ORDER BY datname`
    )
    return (res.rows as Array<{ datname: string }>).map((r) => r.datname)
  }

  async useDatabase(name: string): Promise<void> {
    if (name === this.activeDb && this.client) return
    // pg binds a connection to one db — must reconnect on switch
    await this.close()
    this.activeDb = name
    await this.connect()
  }

  async listEntities(): Promise<EntityInfo[]> {
    const res = await (await this.ensure()).query(
      `SELECT table_schema AS schema, table_name AS name, table_type AS type
         FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name`
    )
    return res.rows.map((r: { schema: string; name: string; type: string }) => ({
      name: r.name,
      schema: r.schema,
      type: r.type === 'VIEW' ? 'view' : 'table'
    }))
  }

  async listEnums(): Promise<EnumType[]> {
    const res = await (await this.ensure()).query(
      `SELECT n.nspname AS schema, t.typname AS name, e.enumlabel AS value
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY n.nspname, t.typname, e.enumsortorder`
    )
    const map = new Map<string, EnumType>()
    for (const r of res.rows as Array<{
      schema: string
      name: string
      value: string
    }>) {
      const key = `${r.schema}.${r.name}`
      const e = map.get(key) ?? { schema: r.schema, name: r.name, values: [] }
      e.values.push(r.value)
      map.set(key, e)
    }
    return [...map.values()]
  }

  async readRows(
    entity: EntityRef,
    limit: number,
    offset: number,
    filters?: Filter[],
    orderBy?: Sort[]
  ): Promise<RowsResult> {
    const { limit: l, offset: o } = safePaging(limit, offset)
    const target = entity.schema
      ? `${quoteIdent(entity.schema)}.${quoteIdent(entity.name)}`
      : quoteIdent(entity.name)
    const where = buildWhere(filters, quoteIdent, (i) => `$${i + 1}`)
    const order = buildOrderBy(orderBy, quoteIdent)
    const res = await (await this.ensure()).query(
      `SELECT * FROM ${target}${where.clause}${order} LIMIT ${l} OFFSET ${o}`,
      where.params
    )
    const pkRes = await (await this.ensure()).query(
      `SELECT kcu.column_name AS name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1
          AND tc.table_schema = $2
        ORDER BY kcu.ordinal_position`,
      [entity.name, entity.schema ?? 'public']
    )
    // canonical types via pg_catalog so enum columns report their type name
    // (information_schema would give 'USER-DEFINED' / 'ARRAY')
    const typeRes = await (await this.ensure()).query(
      `SELECT a.attname AS name,
              format_type(a.atttypid, a.atttypmod) AS type,
              (NOT a.attnotnull) AS nullable
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1 AND n.nspname = $2
          AND a.attnum > 0 AND NOT a.attisdropped`,
      [entity.name, entity.schema ?? 'public']
    )
    const metaMap = new Map(
      typeRes.rows.map(
        (t: { name: string; type: string; nullable: boolean }) => [t.name, t]
      )
    )
    const fkRes = await (await this.ensure()).query(
      `SELECT kcu.column_name AS col, ccu.table_name AS "refTable",
              ccu.column_name AS "refColumn", ccu.table_schema AS "refSchema"
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1 AND tc.table_schema = $2`,
      [entity.name, entity.schema ?? 'public']
    )
    const foreignKeys: ForeignKey[] = fkRes.rows.map(
      (f: { col: string; refTable: string; refColumn: string; refSchema: string }) => ({
        column: f.col,
        refTable: f.refTable,
        refColumn: f.refColumn,
        refSchema: f.refSchema
      })
    )
    return {
      columns: res.fields.map((f: { name: string }) => {
        const m = metaMap.get(f.name) as
          | { type: string; nullable: boolean }
          | undefined
        return { name: f.name, type: m?.type, nullable: m?.nullable }
      }),
      rows: res.rows as Record<string, unknown>[],
      primaryKey: pkRes.rows.map((r: { name: string }) => r.name),
      foreignKeys
    }
  }

  async countRows(entity: EntityRef, filters?: Filter[]): Promise<number> {
    const target = entity.schema
      ? `${quoteIdent(entity.schema)}.${quoteIdent(entity.name)}`
      : quoteIdent(entity.name)
    const where = buildWhere(filters, quoteIdent, (i) => `$${i + 1}`)
    const res = await (await this.ensure()).query(
      `SELECT count(*) AS c FROM ${target}${where.clause}`,
      where.params
    )
    // pg returns bigint count as a string
    return Number((res.rows[0] as { c: string }).c)
  }

  async searchRows(
    entity: EntityRef,
    term: string,
    limit: number,
    offset: number
  ): Promise<SearchResult> {
    const { limit: l, offset: o } = safePaging(limit, offset)
    const schema = entity.schema ?? 'public'
    const target = entity.schema
      ? `${quoteIdent(entity.schema)}.${quoteIdent(entity.name)}`
      : quoteIdent(entity.name)
    const colRes = await (await this.ensure()).query(
      `SELECT column_name AS name, data_type AS type
         FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = $2
        ORDER BY ordinal_position`,
      [entity.name, schema]
    )
    const cols = colRes.rows as Array<{ name: string; type: string }>
    const names = cols.map((c) => c.name)
    const search = buildSearch(
      names,
      term,
      quoteIdent,
      (i) => `$${i + 1}`,
      (col) => `CAST(${col} AS text)`,
      'ILIKE'
    )
    const order = names.length ? ` ORDER BY ${quoteIdent(names[0])}` : ''
    const res = await (await this.ensure()).query(
      `SELECT * FROM ${target}${search.clause}${order} LIMIT ${l} OFFSET ${o}`,
      search.params
    )
    return {
      columns: cols.map((c) => ({ name: c.name, type: c.type })),
      rows: res.rows as Record<string, unknown>[]
    }
  }

  async applyChanges(
    entity: EntityRef,
    changes: ChangeSet
  ): Promise<ApplyResult> {
    const target = entity.schema
      ? `${quoteIdent(entity.schema)}.${quoteIdent(entity.name)}`
      : quoteIdent(entity.name)
    const statements: string[] = []
    await (await this.ensure()).query('BEGIN')
    try {
      let affected = 0
      for (const row of changes.inserts) {
        const built = buildInsert(target, row, quoteIdent, (i) => `$${i + 1}`)
        if (built) {
          affected += (await (await this.ensure()).query(built.sql, built.params)).rowCount ?? 0
          statements.push(renderSql(built.sql, built.params, '$'))
        }
      }
      for (const e of changes.updates) {
        const { sql, params } = buildUpdate(
          target,
          e.changes,
          e.pk,
          quoteIdent,
          (i) => `$${i + 1}`
        )
        affected += (await (await this.ensure()).query(sql, params)).rowCount ?? 0
        statements.push(renderSql(sql, params, '$'))
      }
      for (const pk of changes.deletes) {
        const { sql, params } = buildDelete(
          target,
          pk,
          quoteIdent,
          (i) => `$${i + 1}`
        )
        affected += (await (await this.ensure()).query(sql, params)).rowCount ?? 0
        statements.push(renderSql(sql, params, '$'))
      }
      await (await this.ensure()).query('COMMIT')
      return { affected, statements }
    } catch (err) {
      await (await this.ensure()).query('ROLLBACK')
      throw err
    }
  }

  async describeTable(entity: EntityRef): Promise<TableStructure> {
    const schema = entity.schema ?? 'public'
    // Use pg_catalog format_type so types are canonical + ALTER-usable:
    // enums resolve to their type name, arrays to `elem[]` (information_schema
    // would give the unusable 'USER-DEFINED' / 'ARRAY' labels).
    const colRes = await (await this.ensure()).query(
      `SELECT a.attname AS name,
              format_type(a.atttypid, a.atttypmod) AS type,
              (NOT a.attnotnull) AS nullable,
              pg_get_expr(ad.adbin, ad.adrelid) AS dflt
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef ad
           ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE c.relname = $1 AND n.nspname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      [entity.name, schema]
    )
    const pkRes = await (await this.ensure()).query(
      `SELECT kcu.column_name AS name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1 AND tc.table_schema = $2`,
      [entity.name, schema]
    )
    const pkSet = new Set(pkRes.rows.map((r: { name: string }) => r.name))
    const fkRes = await (await this.ensure()).query(
      `SELECT kcu.column_name AS col, ccu.table_name AS "refTable",
              ccu.column_name AS "refColumn", tc.constraint_name AS conname,
              rc.update_rule AS "onUpdate", rc.delete_rule AS "onDelete"
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = tc.constraint_name
          AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1 AND tc.table_schema = $2`,
      [entity.name, schema]
    )
    const fkList = fkRes.rows as Array<{
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
    const columns = colRes.rows.map(
      (c: { name: string; type: string; nullable: boolean; dflt: string | null }) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable,
        default: c.dflt,
        pk: pkSet.has(c.name),
        fk: fkMap.get(c.name) as
          | { refTable: string; refColumn: string }
          | undefined
      })
    )
    const idxRes = await (await this.ensure()).query(
      `SELECT i.relname AS name, ix.indisunique AS uniq, a.attname AS col,
              am.amname AS method, array_position(ix.indkey, a.attnum) AS seq
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_am am ON am.oid = i.relam
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = $1 AND n.nspname = $2
        ORDER BY i.relname, seq`,
      [entity.name, schema]
    )
    const idxMap = new Map<
      string,
      { unique: boolean; columns: string[]; method: string }
    >()
    for (const r of idxRes.rows as Array<{
      name: string
      uniq: boolean
      col: string
      method: string
    }>) {
      const e = idxMap.get(r.name) ?? {
        unique: r.uniq,
        columns: [],
        method: r.method
      }
      e.columns.push(r.col)
      idxMap.set(r.name, e)
    }
    const indexes = [...idxMap].map(([name, v]) => ({ name, ...v }))
    return { columns, indexes, relations }
  }

  async listReferencingTables(entity: EntityRef): Promise<ReferencingTable[]> {
    const schema = entity.schema ?? 'public'
    // pg_constraint: confrelid = the referenced (parent) table's oid;
    // conrelid = the referencing (child) table. conkey/confkey are column
    // attnum arrays (single-column FKs in v1 → take [1]).
    const res = await (await this.ensure()).query(
      `SELECT child.relname AS tbl, ns.nspname AS schema,
              att.attname AS col, ratt.attname AS "refColumn",
              c.conname AS conname,
              c.confupdtype AS upd, c.confdeltype AS del
         FROM pg_constraint c
         JOIN pg_class parent ON parent.oid = c.confrelid
         JOIN pg_namespace pns ON pns.oid = parent.relnamespace
         JOIN pg_class child ON child.oid = c.conrelid
         JOIN pg_namespace ns ON ns.oid = child.relnamespace
         JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
         JOIN pg_attribute ratt ON ratt.attrelid = c.confrelid AND ratt.attnum = c.confkey[1]
        WHERE c.contype = 'f'
          AND parent.relname = $1 AND pns.nspname = $2
        ORDER BY child.relname, att.attname`,
      [entity.name, schema]
    )
    const ACTION: Record<string, string> = {
      a: 'NO ACTION',
      r: 'RESTRICT',
      c: 'CASCADE',
      n: 'SET NULL',
      d: 'SET DEFAULT'
    }
    return (
      res.rows as Array<{
        tbl: string
        schema: string
        col: string
        refColumn: string
        conname: string
        upd: string
        del: string
      }>
    ).map((r) => ({
      table: r.tbl,
      schema: r.schema,
      column: r.col,
      refColumn: r.refColumn,
      constraint: r.conname,
      onUpdate: ACTION[r.upd] ?? undefined,
      onDelete: ACTION[r.del] ?? undefined
    }))
  }

  async getCreateSql(entity: EntityRef): Promise<string> {
    const schema = entity.schema ?? 'public'
    const target = this.target(entity)
    const kRes = await (await this.ensure()).query(
      `SELECT c.relkind FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1 AND n.nspname = $2`,
      [entity.name, schema]
    )
    const relkind = (kRes.rows[0] as { relkind: string } | undefined)?.relkind
    if (relkind === 'v' || relkind === 'm') {
      const v = await (await this.ensure()).query(
        'SELECT pg_get_viewdef($1::regclass, true) AS def',
        [target]
      )
      const def = (v.rows[0] as { def: string } | undefined)?.def ?? ''
      return `CREATE ${relkind === 'm' ? 'MATERIALIZED ' : ''}VIEW ${target} AS\n${def.trim().replace(/;?\s*$/, '')};`
    }
    // table: reconstruct from catalog (approximate)
    const st = await this.describeTable(entity)
    const pk = st.columns.filter((c) => c.pk).map((c) => c.name)
    const lines = st.columns.map((c) => {
      let s = `  ${quoteIdent(c.name)} ${c.type}`
      if (c.default != null) s += ` DEFAULT ${c.default}`
      if (!c.nullable) s += ' NOT NULL'
      return s
    })
    const cons: string[] = []
    if (pk.length)
      cons.push(`  PRIMARY KEY (${pk.map(quoteIdent).join(', ')})`)
    for (const r of st.relations) {
      cons.push(
        `  FOREIGN KEY (${quoteIdent(r.column)}) REFERENCES ${quoteIdent(r.refTable)} (${quoteIdent(r.refColumn)})${fkActionClause(r.onUpdate, r.onDelete)}`
      )
    }
    let sql =
      `-- Reconstructed by Krust Studio (approximate)\n` +
      `CREATE TABLE ${target} (\n${[...lines, ...cons].join(',\n')}\n);`
    for (const ix of st.indexes) {
      const cset = new Set(ix.columns)
      const backsPk =
        ix.unique &&
        ix.columns.length === pk.length &&
        pk.every((c) => cset.has(c))
      if (backsPk) continue
      const using = ix.method && ix.method !== 'btree' ? ` USING ${ix.method}` : ''
      sql += `\nCREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(ix.name)} ON ${target}${using} (${ix.columns.map(quoteIdent).join(', ')});`
    }
    return sql
  }

  async createTable(spec: CreateTableSpec): Promise<{ ddl: string }> {
    const ddl = buildCreateTable(spec, quoteIdent, { dialect: 'postgres' })
    await (await this.ensure()).query(ddl)
    return { ddl }
  }

  async alterTable(
    entity: EntityRef,
    ops: SchemaOp[],
    dryRun = false
  ): Promise<{ statements: string[] }> {
    const t = entity.schema
      ? `${quoteIdent(entity.schema)}.${quoteIdent(entity.name)}`
      : quoteIdent(entity.name)
    const statements: string[] = []
    for (const op of ops) {
      switch (op.kind) {
        case 'addColumn': {
          const def =
            op.column.default && op.column.default.trim()
              ? ` DEFAULT ${op.column.default}`
              : ''
          statements.push(
            `ALTER TABLE ${t} ADD COLUMN ${quoteIdent(op.column.name)} ${op.column.type}${def}${op.column.nullable ? '' : ' NOT NULL'}`
          )
          break
        }
        case 'dropColumn':
          statements.push(`ALTER TABLE ${t} DROP COLUMN ${quoteIdent(op.name)}`)
          break
        case 'setDefault':
          statements.push(
            `ALTER TABLE ${t} ALTER COLUMN ${quoteIdent(op.name)} SET DEFAULT ${op.default}`
          )
          break
        case 'dropDefault':
          statements.push(
            `ALTER TABLE ${t} ALTER COLUMN ${quoteIdent(op.name)} DROP DEFAULT`
          )
          break
        case 'renameColumn':
          statements.push(
            `ALTER TABLE ${t} RENAME COLUMN ${quoteIdent(op.from)} TO ${quoteIdent(op.to)}`
          )
          break
        case 'alterColumn':
          statements.push(
            `ALTER TABLE ${t} ALTER COLUMN ${quoteIdent(op.name)} TYPE ${op.type}`
          )
          statements.push(
            `ALTER TABLE ${t} ALTER COLUMN ${quoteIdent(op.name)} ${op.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`
          )
          break
        case 'addForeignKey':
          statements.push(
            `ALTER TABLE ${t} ADD FOREIGN KEY (${quoteIdent(op.column)}) REFERENCES ${quoteIdent(op.refTable)} (${quoteIdent(op.refColumn)})${fkActionClause(op.onUpdate, op.onDelete)}`
          )
          break
        case 'dropForeignKey':
          statements.push(
            `ALTER TABLE ${t} DROP CONSTRAINT ${quoteIdent(op.constraint)}`
          )
          break
        case 'moveColumn':
          throw new Error(
            'PostgreSQL cannot reorder table columns (no ALTER syntax; would need a table rebuild)'
          )
        case 'addIndex':
          statements.push(this.createIndexSql(entity, op.spec))
          break
        case 'dropIndex':
          statements.push(this.dropIndexSql(entity, op.name))
          break
      }
    }
    if (dryRun) return { statements }
    await (await this.ensure()).query('BEGIN')
    try {
      for (const s of statements) await (await this.ensure()).query(s)
      await (await this.ensure()).query('COMMIT')
      return { statements }
    } catch (err) {
      await (await this.ensure()).query('ROLLBACK')
      throw err
    }
  }

  private target(entity: EntityRef): string {
    return entity.schema
      ? `${quoteIdent(entity.schema)}.${quoteIdent(entity.name)}`
      : quoteIdent(entity.name)
  }

  async dropEntity(
    entity: EntityRef,
    type: EntityType
  ): Promise<{ statements: string[] }> {
    const sql = `DROP ${type === 'view' ? 'VIEW' : 'TABLE'} ${this.target(entity)}`
    await (await this.ensure()).query(sql)
    return { statements: [sql] }
  }

  async renameTable(
    entity: EntityRef,
    newName: string
  ): Promise<{ statements: string[] }> {
    const sql = `ALTER TABLE ${this.target(entity)} RENAME TO ${quoteIdent(newName)}`
    await (await this.ensure()).query(sql)
    return { statements: [sql] }
  }

  async truncateTable(entity: EntityRef): Promise<{ statements: string[] }> {
    const sql = `TRUNCATE TABLE ${this.target(entity)}`
    await (await this.ensure()).query(sql)
    return { statements: [sql] }
  }

  private createIndexSql(entity: EntityRef, spec: IndexSpec): string {
    const name = spec.name?.trim() || defaultIndexName(entity.name, spec.columns)
    const cols = spec.columns.map(quoteIdent).join(', ')
    const m = spec.method?.toLowerCase()
    const using = m && PG_INDEX_METHODS.has(m) ? ` USING ${m}` : ''
    return `CREATE ${spec.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(name)} ON ${this.target(entity)}${using} (${cols})`
  }

  private dropIndexSql(entity: EntityRef, name: string): string {
    const qname = entity.schema
      ? `${quoteIdent(entity.schema)}.${quoteIdent(name)}`
      : quoteIdent(name)
    return `DROP INDEX ${qname}`
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
    const res = await (await this.ensure()).query(sql)
    if (Array.isArray(res.fields) && res.fields.length > 0)
      return {
        columns: res.fields.map((f: { name: string }) => ({ name: f.name })),
        rows: res.rows as Record<string, unknown>[]
      }
    return { affected: res.rowCount ?? 0 }
  }

  async explainQuery(sql: string, analyze: boolean): Promise<QueryPlan> {
    const opts = analyze ? 'ANALYZE, BUFFERS, FORMAT JSON' : 'FORMAT JSON'
    const res = await (await this.ensure()).query(`EXPLAIN (${opts}) ${sql}`)
    const raw = (res.rows[0] as Record<string, unknown>)['QUERY PLAN']
    const arr = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<
      string,
      unknown
    >[]
    const top = arr[0]
    return {
      engine: 'postgres',
      analyze,
      nodes: [pgPlanNode(top['Plan'] as Record<string, unknown>)],
      raw: JSON.stringify(arr, null, 2),
      planningMs: (top['Planning Time'] as number | undefined) ?? null,
      executionMs: (top['Execution Time'] as number | undefined) ?? null
    }
  }

  async cancel(): Promise<void> {
    if (this.backendPid == null) return
    const { Client } = await import('pg')
    const { config, password } = this.deps
    const c = new Client({
      host: config.host,
      port: config.port ?? 5432,
      user: config.user,
      password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000
    })
    await c.connect()
    try {
      await c.query('SELECT pg_cancel_backend($1)', [this.backendPid])
    } finally {
      await c.end()
    }
  }

  async close(): Promise<void> {
    await this.client?.end()
    this.client = null
  }
}
