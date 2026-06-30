export type DriverType = 'mysql' | 'postgres' | 'sqlite' | 'redis'

export interface ConnectionConfig {
  id: string
  name: string
  driver: DriverType
  /** network drivers (mysql/postgres/redis) */
  host?: string
  port?: number
  database?: string
  user?: string
  ssl?: boolean
  /** sqlite */
  sqlitePath?: string
  /** redis: initial logical database index (0..N). Defaults to 0. */
  redisDb?: number
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

/** one node in a parsed query plan tree (ADR-0014). `scan` drives the badge:
 *  'full' = full table scan (the thing the user is hunting for). */
export interface PlanNode {
  /** engine operation, e.g. "Seq Scan", "Index Scan", "ALL", "SEARCH" */
  operation: string
  /** human-readable line: table, index, condition, extra */
  detail?: string
  /** scan classification for the badge: full-scan (red) vs index vs other */
  scan?: 'full' | 'index' | 'other'
  /** index chosen by the planner, or null/none */
  index?: string | null
  /** estimated rows for this node */
  rows?: number | null
  /** engine cost score (pg total cost; mysql rows×filtered; sqlite n/a) */
  cost?: number | null
  /** ANALYZE only: actual rows produced */
  actualRows?: number | null
  /** ANALYZE only: actual time (ms) at this node */
  actualMs?: number | null
  children: PlanNode[]
}

/** a parsed EXPLAIN / EXPLAIN ANALYZE result (ADR-0014). `nodes` is a forest —
 *  pg/sqlite produce a tree, mysql a flat list. `raw` backs the "raw" toggle. */
export interface QueryPlan {
  engine: DriverType
  analyze: boolean
  nodes: PlanNode[]
  raw: string
  /** pg planning/execution time (ms), when available */
  planningMs?: number | null
  executionMs?: number | null
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
export type HistoryStream =
  | 'data_mutation'
  | 'table_mutation'
  | 'data_retrieval'
  /** Redis key mutations — a distinct command class, never changeset-eligible */
  | 'redis_mutation'

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
  /** TRUNCATE / DROP / DELETE|UPDATE without WHERE — not auto-attached to changeset */
  destructive: boolean
  /** groups commands from one Redis staged commit (WATCH+MULTI/EXEC); null otherwise */
  commitGroup: string | null
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
  destructive?: boolean
  /** groups commands from one Redis staged commit */
  commitGroup?: string | null
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
  /** hard-delete specific entries by id (like bulk Clear but id-targeted) */
  deleteEntries: (ids: number[]) => Promise<void>
  /** global toggle: auto-attach destructive DDL (DROP) to the active changeset */
  getAutoAttachDestructive: () => Promise<boolean>
  setAutoAttachDestructive: (on: boolean) => Promise<void>
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
  /** FK constraint name; undefined on SQLite (no named FK constraints) */
  constraint?: string
}

/** Inbound FK: a table that references the current table (reverse of Relation). */
export interface ReferencingTable {
  /** the referencing (child) table */
  table: string
  /** schema of the referencing table (pg) */
  schema?: string
  /** the FK column in the referencing table */
  column: string
  /** the column in THIS table that it points at */
  refColumn: string
  /** the FK constraint name */
  constraint: string
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

/**
 * A reusable, local-only named set of columns to scaffold new tables (or insert
 * into existing ones). Never applied to the DB directly — only seeds a draft or
 * stages column-adds. Engine-locked so types never cross engines.
 */
export interface TableTemplate {
  id: string
  name: string
  engine: DriverType
  columns: NewColumnSpec[]
  /** epoch ms */
  createdAt: number
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
  /** tables that reference this one (inbound FKs / "Referenced by") */
  listReferencingTables: (
    id: string,
    entity: EntityRef
  ) => Promise<ReferencingTable[]>
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
    orderBy?: Sort[],
    /** Raw-WHERE escape hatch (ADR-0017); when set, replaces `filters`. */
    rawWhere?: string
  ) => Promise<RowsResult>
  countRows: (
    id: string,
    entity: EntityRef,
    filters?: Filter[],
    rawWhere?: string
  ) => Promise<number>
  /** fetch ALL rows matching the filters (paged internally, capped) for export */
  exportAllRows: (
    id: string,
    entity: EntityRef,
    filters?: Filter[],
    orderBy?: Sort[],
    rawWhere?: string
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
  /** Force close + reconnect fresh (manual reconnect from footer menu). */
  reconnect: (id: string) => Promise<void>
  /** SQL editor: run a script (split into statements), capturing each */
  runScript: (
    id: string,
    sql: string,
    autoLimit?: number
  ) => Promise<QueryResult[]>
  /** cancel the currently running query on a connection (pg/mysql) */
  cancelQuery: (id: string) => Promise<void>
  /** EXPLAIN (or EXPLAIN ANALYZE when `analyze`) → parsed query plan (ADR-0014).
   *  ANALYZE actually executes the statement. Not captured to history. */
  explainQuery: (id: string, sql: string, analyze: boolean) => Promise<QueryPlan>
}

export interface DialogApi {
  /** OS save dialog → writes text to the chosen path */
  saveText: (
    defaultName: string,
    content: string
  ) => Promise<{ saved: boolean; path?: string }>
  /** OS open dialog → reads a `.sql` file's text (utf-8). One-shot import: the
   *  path is returned for display only, not a persisted link (ADR — file-backed
   *  editing deferred). */
  openText: () => Promise<{ canceled: boolean; path?: string; content?: string }>
}

/** Serialized form of a tab — only the fields that survive a restart. */
export interface SerializedTab {
  id: string
  entity: EntityRef
  /** undefined = regular table tab */
  kind?: 'history' | 'connection-editor' | 'redis-key'
  connectionEditor?: { connectionId: string | null }
  /** redis-key tabs: the key identity (value/staged state is transient, not saved) */
  redisKey?: { dbIndex: number; key: string; type: RedisKeyType }
  view: 'data' | 'structure'
  /** which Structure sub-tab was open (survives restore) */
  structureSub?: 'columns' | 'indexes' | 'relations' | 'referencedBy' | 'ddl'
  filters: Filter[]
  /** active filter mode (ADR-0017); absent defaults to 'builder' (no migration) */
  filterMode?: 'builder' | 'raw'
  /** hand-written WHERE predicate for Raw mode; restored + re-run fail-soft */
  rawWhere?: string
  orderBy: Sort[]
  colWidths: Record<string, number>
  /** query tabs: the SQL text (presence marks this as a query tab) */
  sqlDraft?: string
  /** query tabs: the auto-LIMIT setting */
  autoLimit?: number
  /** new-table tabs: the column draft */
  draft?: { name: string; columns: NewColumnSpec[] } | null
  /** pinned tabs stay at the left edge and survive bulk-close */
  pinned?: boolean
}

export interface ConnectionWorkspace {
  activeTabId: string | null
  tabs: SerializedTab[]
}

export interface WorkspaceData {
  lastConnectionId: string | null
  connections: Record<string, ConnectionWorkspace>
}

export interface WorkspaceApi {
  load: () => Promise<WorkspaceData>
  save: (data: WorkspaceData) => Promise<void>
}

/** per-table backup choice: schema-only, schema+data, or skip the table */
export type BackupTableMode = 'schema' | 'schema+data' | 'skip'

export interface BackupTableSpec {
  name: string
  schema?: string
  type: EntityType
  mode: BackupTableMode
}

export interface BackupSpec {
  tables: BackupTableSpec[]
  /** emit `DROP TABLE IF EXISTS` before each CREATE */
  dropFirst: boolean
}

export interface BackupResult {
  saved: boolean
  path?: string
  tablesWritten: number
  rowsWritten: number
}

/** one parsed statement in a restore dry-run */
export interface RestoreStatement {
  statement: string
  /** leading keyword classification */
  kind: 'ddl' | 'dml' | 'read' | 'other'
  /** true for DROP / DELETE / TRUNCATE — surfaced as a warning before run */
  destructive: boolean
}

export interface RestorePreview {
  statements: RestoreStatement[]
  total: number
  destructiveCount: number
}

/** per-statement outcome of an executed restore */
export interface RestoreRunResult {
  ran: number
  failed: number
  /** index + message of the first error (when stop-on-error or any failure) */
  errors: { index: number; statement: string; error: string }[]
}

export interface BackupApi {
  /** export selected tables (schema/data per table) to a chosen .sql file */
  run: (id: string, spec: BackupSpec) => Promise<BackupResult>
  /** parse a .sql dump (chosen via open dialog) without executing — dry run */
  restorePreview: () => Promise<{ canceled: boolean; path?: string; preview?: RestorePreview }>
  /** execute a previously-previewed dump against the connection */
  restoreRun: (
    id: string,
    path: string,
    stopOnError: boolean
  ) => Promise<RestoreRunResult>
}

export interface WindowControlApi {
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  /** subscribe to maximize/unmaximize; returns an unsubscribe fn */
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void
  getVersion: () => Promise<string>
}

/** local table-template CRUD (templates.json in the data dir) */
export interface TemplatesApi {
  list: () => Promise<TableTemplate[]>
  /** upsert by id; returns the saved template */
  save: (template: TableTemplate) => Promise<TableTemplate>
  remove: (id: string) => Promise<void>
}

// ──────────────────────── Capabilities (ADR-0020) ────────────────────────

/** Structural capabilities of an engine — drives which UI the renderer mounts.
 *  Static per DriverType (see shared/capabilities.ts); a runtime probe refines
 *  Redis-specific facts (db count, ACL) but never these structural flags. */
export interface DriverCapabilities {
  /** arbitrary SQL editor + query execution */
  sql: boolean
  /** schema-object tree + tabular row reads */
  tabular: boolean
  /** DDL / schema mutation */
  schemaMut: boolean
  /** staged data-grid edits → DML */
  tabularMut: boolean
  /** stored procedures / functions (1.7 routines) */
  routines: boolean
  /** query plan (EXPLAIN) */
  plan: boolean
  /** Redis-style key/value workflow */
  keys: boolean
  /** can switch the active logical database */
  switchDatabase: boolean
}

// ───────────────────────────── Redis (ADR-0020) ──────────────────────────

export type RedisKeyType =
  | 'string'
  | 'hash'
  | 'list'
  | 'set'
  | 'zset'
  | 'stream'
  | 'none'
  | 'unknown'

/** one key row in the sidebar KeyList */
export interface RedisKeyInfo {
  /** key name; binary-safe (escaped for display by the renderer) */
  key: string
  type: RedisKeyType
  /** remaining ms TTL: -1 = no expiry, -2 = key missing, null = not yet fetched */
  ttl: number | null
  /** true when the key name held bytes that aren't valid UTF-8 */
  binary: boolean
}

export interface RedisScanResult {
  keys: RedisKeyInfo[]
  /** cursor to pass back for the next page; '0' means iteration complete */
  cursor: string
  /** running count of keys loaded for this db+filter (not a filtered total) */
  loaded: number
}

export interface ReadValueOpts {
  /** collection cursor (hash/set/zset) for the next page; '0' to start */
  cursor?: string
  /** list index range start (inclusive) */
  start?: number
  /** page size */
  count: number
  /** load a large string the size-gate flagged (explicit user action) */
  forceLoadLarge?: boolean
}

/** polymorphic value read, discriminated by key type (decision 5) */
export type RedisValuePage =
  | {
      type: 'string'
      /** best-effort UTF-8 decode — authoritative only when `binary` is false */
      text: string
      /** raw bytes, base64 — source for the hex/base64/JSON views and binary writes */
      base64: string
      encoding: 'utf8' | 'binary'
      bytes: number
      truncated: boolean
      /** true when the raw bytes are not valid UTF-8 (show hex/base64, not text) */
      binary: boolean
      /** true when the size-gate blocked the load (>1MB, not yet forced) */
      tooLarge?: boolean
    }
  | { type: 'hash'; fields: { field: string; value: string }[]; cursor: string }
  | { type: 'list'; items: string[]; start: number; end: number; length: number }
  | { type: 'set'; members: string[]; cursor: string }
  | { type: 'zset'; members: { member: string; score: number }[]; cursor: string }
  | {
      type: 'stream'
      entries: { id: string; fields: [string, string][] }[]
      lastId: string
    }
  | { type: 'none' }

/** metadata for one key (TYPE + PTTL + cheap size) */
export interface RedisKeyMeta {
  key: string
  type: RedisKeyType
  /** remaining ms TTL: -1 none, -2 missing */
  ttl: number
  /** STRLEN for strings; null for collections (they page instead) */
  bytes: number | null
  /** element count for collections (HLEN/SCARD/ZCARD/LLEN/XLEN); null for strings */
  cardinality: number | null
}

/** one Redis command argument: a UTF-8 string, or raw bytes (base64) for binary writes */
export type RedisArg = string | { b64: string }

/** one staged Redis command — rendered in the preview, run inside MULTI */
export interface RedisCommand {
  /** full command argv, e.g. ['HSET','user:1','name','Bob']; binary args as { b64 } */
  args: RedisArg[]
  /** human label for the preview row */
  label: string
  /** DEL/UNLINK/expiry-in-the-past — flagged destructive in history */
  destructive: boolean
}

/** a staged value-commit for one key (decision 16) */
export interface RedisCommitBatch {
  dbIndex: number
  key: string
  /** value type at read time — used for the WATCH conflict compatibility check */
  expectedType: RedisKeyType
  commands: RedisCommand[]
  /** skip WATCH and replay — compatibility-gated Force (decision 6) */
  force?: boolean
  /** caller acknowledged the staged removals will empty (and thus delete) the key */
  confirmEmptyDelete?: boolean
}

export interface RedisConflict {
  /** what changed under the WATCH */
  kind: 'changed' | 'type-changed' | 'deleted'
  /** the key's current type now */
  currentType: RedisKeyType
  /** true when Force is allowed (key still exists, same type) */
  forceAllowed: boolean
}

export type RedisCommitResult =
  | { ok: true; commitGroup: string }
  | { ok: false; conflict: RedisConflict }
  /** staged removals would empty (delete) the key — re-commit with confirmEmptyDelete */
  | { ok: false; emptyDelete: true; cardinality: number }

export interface RedisDbInfo {
  /** active logical database index */
  current: number
  /** configured db count when discoverable; null when CONFIG GET was denied */
  count: number | null
  /** server version string when probed */
  serverVersion?: string
}

export interface RedisApi {
  dbInfo: (id: string) => Promise<RedisDbInfo>
  selectDb: (id: string, index: number) => Promise<void>
  scan: (
    id: string,
    match: string,
    cursor: string,
    count: number
  ) => Promise<RedisScanResult>
  keyMeta: (id: string, key: string) => Promise<RedisKeyMeta>
  readValue: (
    id: string,
    key: string,
    opts: ReadValueOpts
  ) => Promise<RedisValuePage>
  /** run a staged value-commit (WATCH+MULTI/EXEC). Read-only blocked in main. */
  commit: (id: string, batch: RedisCommitBatch) => Promise<RedisCommitResult>
  /** rename a key (RENAMENX unless overwrite). Read-only blocked. */
  renameKey: (
    id: string,
    from: string,
    to: string,
    overwrite: boolean
  ) => Promise<RedisCommitResult>
  /** delete a key (UNLINK→DEL). Read-only blocked. Destructive. */
  deleteKey: (id: string, key: string) => Promise<RedisCommitResult>
}

export interface KrustApi {
  connections: ConnectionsApi
  sessions: SessionApi
  history: HistoryApi
  dialog: DialogApi
  workspace: WorkspaceApi
  backup: BackupApi
  templates: TemplatesApi
  window: WindowControlApi
  redis: RedisApi
}
