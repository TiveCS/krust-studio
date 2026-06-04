export type DriverType = 'mysql' | 'postgres' | 'sqlite'

export interface ConnectionConfig {
  id: string
  name: string
  driver: DriverType
  /** network drivers (mysql/postgres) */
  host?: string
  port?: number
  database?: string
  user?: string
  ssl?: boolean
  /** sqlite */
  sqlitePath?: string
  /** mark prod: blocks all mutation paths (enforced in main) */
  readOnly?: boolean
}

/** what the renderer receives — never includes the password */
export interface ConnectionSummary extends ConnectionConfig {
  hasPassword: boolean
}

/** payload to save a connection; password only present when set/changed */
export interface SaveConnectionInput {
  config: ConnectionConfig
  password?: string
}

/** payload to test; password optional (falls back to stored secret by id) */
export interface TestConnectionInput {
  config: ConnectionConfig
  password?: string
}

export interface TestConnectionResult {
  ok: boolean
  /** round-trip latency in ms when ok */
  latencyMs?: number
  /** server version string when ok */
  serverVersion?: string
  /** error message when not ok */
  error?: string
}

export interface ConnectionsApi {
  list: () => Promise<ConnectionSummary[]>
  save: (input: SaveConnectionInput) => Promise<ConnectionSummary>
  remove: (id: string) => Promise<void>
  test: (input: TestConnectionInput) => Promise<TestConnectionResult>
  /** decrypt + return the stored password for an existing connection (explicit reveal) */
  reveal: (id: string) => Promise<string>
  /** clone a connection (copies the stored password) */
  duplicate: (id: string) => Promise<ConnectionSummary>
}

export type EntityType = 'table' | 'view'

/** A named enum type (Postgres). MySQL enums are inline in the column type. */
export interface EnumType {
  schema?: string
  name: string
  values: string[]
}

export interface EntityInfo {
  name: string
  type: EntityType
  /** schema/namespace — set for Postgres, omitted for MySQL/SQLite */
  schema?: string
}

/** identifies one table/view to read */
export interface EntityRef {
  name: string
  schema?: string
}

export interface ColumnInfo {
  name: string
  type?: string
  nullable?: boolean
}

export interface ForeignKey {
  column: string
  refTable: string
  refColumn: string
  refSchema?: string
}

export interface Sort {
  column: string
  dir: 'asc' | 'desc'
}

export interface RowsResult {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  /** primary-key column names; empty if the table has no PK (editing disabled) */
  primaryKey: string[]
  foreignKeys: ForeignKey[]
}

/** lightweight result for the FK Picker cross-column search (no pk/fk meta) */
export interface SearchResult {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
}

/** one statement's outcome in the SQL editor */
export interface QueryResult {
  statement: string
  kind: 'rows' | 'affected' | 'error' | 'reconnected'
  columns?: ColumnInfo[]
  rows?: Record<string, unknown>[]
  affected?: number
  error?: string
  /** wall-clock ms for the statement */
  ms?: number
}

/** raw result a driver returns for one statement (kind decided by session) */
export interface RawQueryResult {
  columns?: ColumnInfo[]
  rows?: Record<string, unknown>[]
  affected?: number
}

/** one row's staged changes, identified by its primary-key values */
export interface RowEdit {
  pk: Record<string, unknown>
  changes: Record<string, unknown>
}

/** staged inserts + updates + deletes for one table, in a single transaction */
export interface ChangeSet {
  /** column→value maps for new rows (omitted columns use DB defaults) */
  inserts: Record<string, unknown>[]
  updates: RowEdit[]
  /** primary-key value maps of rows to delete */
  deletes: Record<string, unknown>[]
}

export interface ApplyResult {
  affected: number
  /** display-rendered DML statements that ran (for capture/history) */
  statements?: string[]
}

/** Query History streams (CONTEXT.md). Data Retrieval deferred until SQL editor. */
export type HistoryStream = 'data_mutation' | 'table_mutation' | 'data_retrieval'

export interface HistoryEntry {
  id: number
  /** epoch ms */
  ts: number
  connectionId: string
  stream: HistoryStream
  /** gui-generated vs hand-typed (all gui until the SQL editor lands) */
  source: 'gui' | 'manual'
  statement: string
  status: 'success' | 'error'
  /** affected-row count for DML; null for DDL */
  affected: number | null
  /** target object name when known */
  entity: string | null
  error: string | null
  /** changeset this Table-Mutation entry belongs to; null = Unassigned inbox */
  changesetId: number | null
}

export interface HistoryQuery {
  connectionId?: string
  stream?: HistoryStream
  /** filter to one changeset's entries */
  changesetId?: number
  /** filter to entries with no changeset (the Unassigned inbox) */
  unassigned?: boolean
  limit?: number
  offset?: number
}

/** A named group of Captured DDL, raw chronological order (ADR 0002). */
export interface Changeset {
  id: number
  connectionId: string
  name: string
  ticket: string | null
  status: 'draft' | 'exported'
  createdAt: number
  exportedAt: number | null
  /** number of captured statements in this changeset */
  count: number
  /** whether this is the active (auto-attach) changeset for its connection */
  active: boolean
}

/** what `session.ts` records after a successful mutation */
export interface CaptureInput {
  connectionId: string
  stream: HistoryStream
  source: 'gui' | 'manual'
  statement: string
  status: 'success' | 'error'
  affected?: number | null
  entity?: string | null
  error?: string | null
}

export interface HistoryApi {
  list: (query: HistoryQuery) => Promise<HistoryEntry[]>
  clear: (connectionId: string, stream: HistoryStream) => Promise<void>
  // changesets
  listChangesets: (connectionId: string) => Promise<Changeset[]>
  createChangeset: (
    connectionId: string,
    name: string,
    ticket?: string
  ) => Promise<Changeset>
  renameChangeset: (id: number, name: string, ticket?: string) => Promise<void>
  deleteChangeset: (id: number) => Promise<void>
  /** set (or clear with null) the active auto-attach changeset for a connection */
  setActiveChangeset: (
    connectionId: string,
    changesetId: number | null
  ) => Promise<void>
  /** move entries to a changeset, or null for the Unassigned inbox */
  assignEntries: (
    entryIds: number[],
    changesetId: number | null
  ) => Promise<void>
  /** build the commented .sql and save it via the OS dialog; marks Exported */
  exportChangeset: (id: number) => Promise<{ saved: boolean; path?: string }>
}

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'like'
  | 'notlike'
  | 'in'
  | 'between'
  | 'isnull'
  | 'notnull'

export interface Filter {
  column: string
  op: FilterOp
  value: string
  /** second bound for BETWEEN */
  value2?: string
  /** how this filter joins to the previous filter in the SAME group. First in group ignored. */
  conj?: 'and' | 'or'
  /** which bracketed group this filter belongs to (contiguous; default 0) */
  group?: number
  /** how this filter's group joins the previous group — read only on the first filter of a group */
  groupConj?: 'and' | 'or'
}

export interface StructureColumn {
  name: string
  type?: string
  nullable: boolean
  default: string | null
  pk: boolean
  fk?: {
    refTable: string
    refColumn: string
    refSchema?: string
    onUpdate?: string
    onDelete?: string
    constraint?: string
  }
}

export interface IndexInfo {
  name: string
  unique: boolean
  columns: string[]
  /** index method (btree/hash/gin/…); undefined when the engine doesn't expose it */
  method?: string
}

export interface IndexSpec {
  /** optional; drivers generate `idx_<table>_<cols>` when blank */
  name?: string
  columns: string[]
  unique: boolean
  /** index method (USING ...). Engine-dependent, whitelisted per driver; blank = engine default. */
  method?: string
}

export interface Relation {
  column: string
  refTable: string
  refColumn: string
  refSchema?: string
  onUpdate?: string
  onDelete?: string
}

export interface TableStructure {
  columns: StructureColumn[]
  indexes: IndexInfo[]
  relations: Relation[]
  /** storage engine (MySQL: InnoDB/MEMORY/NDB/…); undefined for pg/sqlite */
  engine?: string
}

export interface NewColumnSpec {
  name: string
  type: string
  nullable: boolean
  pk: boolean
  /** raw DEFAULT expression (free text, engine-validated); blank = none */
  default?: string
  /** auto-increment / identity (create-time; engine-specific emission) */
  autoInc?: boolean
  fk?: {
    refTable: string
    refColumn: string
    onUpdate?: string
    onDelete?: string
    constraint?: string
  }
}

export interface CreateTableSpec {
  name: string
  columns: NewColumnSpec[]
}

export type SchemaOp =
  // `after`: position the new column (MySQL only) — null = FIRST, string =
  // AFTER that column, undefined = append. pg/sqlite ignore it (always append).
  | { kind: 'addColumn'; column: NewColumnSpec; after?: string | null }
  | { kind: 'dropColumn'; name: string }
  | { kind: 'renameColumn'; from: string; to: string }
  | { kind: 'alterColumn'; name: string; type: string; nullable: boolean }
  | { kind: 'setDefault'; name: string; default: string }
  | { kind: 'dropDefault'; name: string }
  /** reposition an existing column. `after` = null → FIRST, else AFTER that
   *  column. MySQL/MariaDB only (pg/sqlite throw). Names are post-rename. */
  | { kind: 'moveColumn'; name: string; after: string | null }
  | {
      kind: 'addForeignKey'
      column: string
      refTable: string
      refColumn: string
      onUpdate?: string
      onDelete?: string
    }
  | { kind: 'dropForeignKey'; constraint: string }
  /** create/drop an index as part of a staged structure commit */
  | { kind: 'addIndex'; spec: IndexSpec }
  | { kind: 'dropIndex'; name: string }

export interface SessionApi {
  connect: (id: string) => Promise<void>
  listEntities: (id: string) => Promise<EntityInfo[]>
  /** databases/catalogs visible to the connection (sqlite: the file) */
  listDatabases: (id: string) => Promise<string[]>
  /** the active database name, or null when none selected */
  currentDatabase: (id: string) => Promise<string | null>
  /** switch active database (mysql USE; pg reconnects; sqlite throws) */
  useDatabase: (id: string, name: string) => Promise<void>
  /** named enum types (pg); empty for mysql/sqlite */
  listEnums: (id: string) => Promise<EnumType[]>
  describeTable: (id: string, entity: EntityRef) => Promise<TableStructure>
  /** the CREATE statement for a table/view (read-only; pg reconstructs) */
  getCreateSql: (id: string, entity: EntityRef) => Promise<string>
  createTable: (id: string, spec: CreateTableSpec) => Promise<{ ddl: string }>
  alterTable: (
    id: string,
    entity: EntityRef,
    ops: SchemaOp[]
  ) => Promise<{ statements: string[] }>
  /** build the DDL alterTable would run, without executing it (preview) */
  previewAlter: (
    id: string,
    entity: EntityRef,
    ops: SchemaOp[]
  ) => Promise<{ statements: string[] }>
  dropEntity: (
    id: string,
    entity: EntityRef,
    type: EntityType
  ) => Promise<{ statements: string[] }>
  renameTable: (
    id: string,
    entity: EntityRef,
    newName: string
  ) => Promise<{ statements: string[] }>
  truncateTable: (
    id: string,
    entity: EntityRef
  ) => Promise<{ statements: string[] }>
  createIndex: (
    id: string,
    entity: EntityRef,
    spec: IndexSpec
  ) => Promise<{ statements: string[] }>
  dropIndex: (
    id: string,
    entity: EntityRef,
    name: string
  ) => Promise<{ statements: string[] }>

  readRows: (
    id: string,
    entity: EntityRef,
    limit: number,
    offset: number,
    filters?: Filter[],
    orderBy?: Sort[]
  ) => Promise<RowsResult>
  countRows: (
    id: string,
    entity: EntityRef,
    filters?: Filter[]
  ) => Promise<number>
  /** fetch ALL rows matching the filters (paged internally, capped) for export */
  exportAllRows: (
    id: string,
    entity: EntityRef,
    filters?: Filter[],
    orderBy?: Sort[]
  ) => Promise<SearchResult>
  /** FK Picker: cross-column substring search over a (parent) table */
  searchRows: (
    id: string,
    entity: EntityRef,
    term: string,
    limit: number,
    offset: number
  ) => Promise<SearchResult>
  applyChanges: (
    id: string,
    entity: EntityRef,
    changes: ChangeSet
  ) => Promise<ApplyResult>
  disconnect: (id: string) => Promise<void>
  /** SQL editor: run a script (split into statements), capturing each */
  runScript: (
    id: string,
    sql: string,
    autoLimit?: number
  ) => Promise<QueryResult[]>
  /** cancel the currently running query on a connection (pg/mysql) */
  cancelQuery: (id: string) => Promise<void>
}

export interface DialogApi {
  /** OS save dialog → writes text to the chosen path */
  saveText: (
    defaultName: string,
    content: string
  ) => Promise<{ saved: boolean; path?: string }>
}

export interface KrustApi {
  connections: ConnectionsApi
  sessions: SessionApi
  history: HistoryApi
  dialog: DialogApi
}
