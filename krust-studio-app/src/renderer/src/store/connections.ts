import { create } from 'zustand'
import type { EditorColumn } from '@/components/ColumnsEditor'
import { filtersToWhere } from '@/lib/filterSql'
import type {
  ConnectionSummary,
  EntityInfo,
  EntityRef,
  EntityType,
  EnumType,
  Filter,
  IndexSpec,
  RowEdit,
  CreateTableSpec,
  NewColumnSpec,
  QueryPlan,
  QueryResult,
  ReferencingTable,
  RowsResult,
  SaveConnectionInput,
  SerializedTab,
  ConnectionWorkspace,
  WorkspaceData,
  Sort,
  TableStructure,
  TableTemplate
} from '../../../shared/types'

export interface QueryState {
  sql: string
  results: QueryResult[]
  running: boolean
  /** auto-LIMIT for SELECTs; 0 = off */
  autoLimit: number
  /** last EXPLAIN/ANALYZE plan (ADR-0014); null until run, cleared to dismiss */
  plan: QueryPlan | null
  /** an EXPLAIN/ANALYZE is in flight */
  planning: boolean
}

export type TabView = 'data' | 'structure'
export type StructureSub = 'columns' | 'indexes' | 'relations' | 'referencedBy' | 'ddl'

const PAGE_SIZE = 100

type SessionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface Tab {
  id: string
  entity: EntityRef
  /** undefined / absent = regular table/query/new-table tab */
  kind?: 'history' | 'connection-editor' | 'backup'
  /** pinned tabs stay at the left edge + survive bulk-close (persisted) */
  pinned?: boolean
  /** set on connection-editor tabs: which connection to edit (null = new) */
  connectionEditor?: { connectionId: string | null }
  data: RowsResult | null
  loading: boolean
  error: string | null
  pageIndex: number
  /** total rows for the current filter set; null until manually counted */
  total: number | null
  counting: boolean
  filters: Filter[]
  /** active filter mode (ADR-0017); 'builder' = structured, 'raw' = hand-written WHERE */
  filterMode: 'builder' | 'raw'
  /** Raw-mode WHERE predicate text (applied explicitly; persisted per tab) */
  rawWhere: string
  /** last raw-filter read error — shown inline; last good rows stay visible */
  filterError: string | null
  orderBy: Sort[]
  /** staged cell edits, keyed by `${rowIndex}|${column}`; value may be null */
  edits: Record<string, unknown>
  /** staged row deletions, by row index within the current page */
  deletes: number[]
  /** staged new rows (column→value), committed as INSERTs */
  inserts: Record<string, unknown>[]
  /** column widths in px, by column name */
  colWidths: Record<string, number>
  committing: boolean
  view: TabView
  /** which Structure sub-tab is active (lifted from StructureView local state
   *  so it survives restore + powers walkable relations) */
  structureSub: StructureSub
  structure: TableStructure | null
  structureLoading: boolean
  /** inbound FKs ("Referenced by"); null until first fetched */
  referencedBy: ReferencingTable[] | null
  referencedByLoading: boolean
  /** present => this tab is an unsaved "new table" draft (no entity yet) */
  draft: { name: string; columns: NewColumnSpec[] } | null
  /** present => this tab is a SQL editor */
  query: QueryState | null
  // ── staged structure (schema) edits — in-memory, survive tab switch, NOT
  //    persisted to disk (ADR 0012). undefined until the structure first loads.
  /** staged column draft (seeded from structure on first load); null = unseeded */
  structDraft?: EditorColumn[] | null
  /** staged index additions (committed with the column draft) */
  idxAdds?: IndexSpec[]
  /** staged index drops, by index name */
  idxDrops?: string[]
  /** staged FK constraint drops, by constraint name */
  fkDrops?: string[]
  /** last-computed "has uncommitted schema changes" flag (set by StructureView) */
  structDirty?: boolean
  /** per-tab pin overrides keyed by column name (ADR-0016). 'none' suppresses a
   *  settings-driven pin; 'left'/'right' force a pin for this tab session only.
   *  Session-only — intentionally NOT persisted in SerializedTab. */
  pinnedOverride?: Record<string, 'left' | 'right' | 'none'>
}

/** any uncommitted data-grid edit on this tab (cell edits / deletes / inserts) */
export function tabHasDataChanges(tab: Tab): boolean {
  return (
    Object.keys(tab.edits).length > 0 ||
    tab.deletes.length > 0 ||
    tab.inserts.some((r) => Object.keys(r).length > 0)
  )
}

/** a not-yet-created "new table" draft with real content entered */
function tabHasDraftContent(tab: Tab): boolean {
  if (!tab.draft) return false
  // default seed is a single column named "id" with no type — ignore that
  return (
    tab.draft.name.trim().length > 0 ||
    tab.draft.columns.length > 1 ||
    tab.draft.columns.some((c) => c.type.trim().length > 0)
  )
}

/** true when closing this tab would silently discard uncommitted work */
export function tabIsDirty(tab: Tab): boolean {
  return tabHasDataChanges(tab) || !!tab.structDirty || tabHasDraftContent(tab)
}

export function editKey(rowIndex: number, column: string): string {
  return `${rowIndex}|${column}`
}

function entityKey(e: EntityRef): string {
  return `${e.schema ?? ''}.${e.name}`
}

interface ConnectionsState {
  connections: ConnectionSummary[]
  loading: boolean
  load: () => Promise<void>
  // local table templates (engine-tagged, global)
  templates: TableTemplate[]
  loadTemplates: () => Promise<void>
  saveTemplate: (t: TableTemplate) => Promise<TableTemplate>
  removeTemplate: (id: string) => Promise<void>
  /** Load workspace.json from disk. Call once on app startup before any open(). */
  loadWorkspace: () => Promise<void>
  /** the connection that was active when the app last closed (from workspace) */
  lastConnectionId: string | null
  /** open the last-used connection on startup, if it still exists (idempotent) */
  autoOpenLast: () => void
  save: (input: SaveConnectionInput) => Promise<ConnectionSummary>
  remove: (id: string) => Promise<void>
  duplicate: (id: string) => Promise<ConnectionSummary>

  // live session / schema
  openConnectionId: string | null
  sessionStatus: SessionStatus
  sessionError: string | null
  entities: EntityInfo[]
  enums: EnumType[]
  databases: string[]
  currentDb: string | null
  open: (id: string) => Promise<void>
  refreshEntities: () => Promise<void>
  switchDatabase: (name: string) => Promise<void>
  createTable: (spec: CreateTableSpec) => Promise<string>
  dropEntity: (entity: EntityRef, type: EntityType) => Promise<string[]>
  renameTable: (entity: EntityRef, newName: string) => Promise<string[]>
  truncateTable: (entity: EntityRef) => Promise<string[]>
  closeSession: () => Promise<void>
  /** Close socket, keep tabs/workspace. Status → 'disconnected'. */
  disconnect: () => Promise<void>
  /** Force clean teardown + fresh connect. Reloads entities on success. */
  reconnect: () => Promise<void>

  // open table tabs
  tabs: Tab[]
  activeTabId: string | null
  pageSize: number
  /** Open/focus the History tab for the current connection (singleton). */
  openHistoryTab: () => void
  /** Open/focus the Backup & Restore tab for the current connection (singleton). */
  openBackupTab: () => void
  /** Open/focus a connection-editor tab. `connectionId` null = new connection. */
  openConnectionEditorTab: (connectionId: string | null) => void
  /** Update an editor tab's stored connectionId after saving a new connection. */
  patchEditorTabConnection: (tabId: string, connectionId: string) => void

  openTable: (
    entity: EntityRef,
    initialFilters?: Filter[],
    opts?: { view?: TabView; structureSub?: StructureSub }
  ) => Promise<void>
  openNewTable: (initial?: { name?: string; columns?: NewColumnSpec[] }) => void
  openQuery: () => void
  setQuerySql: (sql: string) => void
  setQueryAutoLimit: (n: number) => void
  runQuery: (sql: string) => Promise<void>
  /** EXPLAIN (analyze=false) / EXPLAIN ANALYZE (analyze=true) the editor SQL */
  explainQuery: (analyze: boolean) => Promise<void>
  /** dismiss the query plan panel */
  clearPlan: () => void
  cancelRunningQuery: () => Promise<void>
  patchDraft: (p: Partial<{ name: string; columns: NewColumnSpec[] }>) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  gotoPage: (index: number) => Promise<void>
  setPageSize: (size: number) => Promise<void>
  countRows: () => Promise<void>
  setFilters: (filters: Filter[]) => Promise<void>
  /** switch Builder ⇄ Raw filter mode (ADR-0017); Builder→Raw seeds the raw box */
  setFilterMode: (mode: 'builder' | 'raw') => Promise<void>
  /** store raw-WHERE text without running it (live typing) */
  setRawWhere: (text: string) => void
  /** apply (run) a raw-WHERE predicate explicitly (Apply / Enter / filter-by-cell) */
  applyRawWhere: (text: string) => Promise<void>
  setSort: (column: string, additive?: boolean) => Promise<void>
  setTabView: (view: TabView) => Promise<void>
  /** set the active Structure sub-tab (persisted; lazy-fetches referencedBy) */
  setStructureSub: (sub: StructureSub) => void
  /** fetch inbound FKs for the active tab (idempotent; caches on the tab) */
  fetchReferencedBy: () => Promise<void>
  refreshStructure: () => Promise<void>
  createIndex: (spec: IndexSpec) => Promise<string[]>
  dropIndex: (name: string) => Promise<string[]>
  setCellEdit: (rowIndex: number, column: string, value: unknown) => void
  stageDeletes: (rowIndices: number[]) => void
  addRow: () => void
  setInsertCell: (insertIndex: number, column: string, value: unknown) => void
  removeInsert: (insertIndex: number) => void
  setColWidth: (column: string, width: number) => void
  /** set/clear a per-tab pin override on the active tab (ADR-0016). `side: null`
   *  removes the override, falling back to the global settings rule. */
  setPinOverride: (column: string, side: 'left' | 'right' | 'none' | null) => void
  clearChanges: () => void
  commitChanges: () => Promise<void>
  // staged structure (schema) edits — live on the active tab
  setStructDraft: (cols: EditorColumn[]) => void
  setIdxAdds: (adds: IndexSpec[]) => void
  setIdxDrops: (drops: string[]) => void
  setFkDrops: (drops: string[]) => void
  setStructDirty: (dirty: boolean) => void
  // bulk tab close (raw — callers handle any dirty-confirm)
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  closeAllTabs: () => void
  /** toggle a tab's pinned state; pinned tabs move to the left block */
  togglePinTab: (tabId: string) => void
  /** drag-reorder: move `fromId` to `toId`'s slot (pinned stay left of unpinned) */
  moveTab: (fromId: string, toId: string) => void
}

export const useConnections = create<ConnectionsState>((set, get) => {
  function patchTab(tabId: string, partial: Partial<Tab>): void {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...partial } : t))
    }))
  }

  async function fetchTab(tabId: string): Promise<void> {
    const { openConnectionId, tabs, pageSize } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!openConnectionId || !tab) return
    const raw = tab.filterMode === 'raw' ? tab.rawWhere : undefined
    patchTab(tabId, { loading: true, error: null, filterError: null })
    try {
      const data = await window.api.sessions.readRows(
        openConnectionId,
        tab.entity,
        pageSize,
        tab.pageIndex * pageSize,
        tab.filters,
        tab.orderBy.length ? tab.orderBy : undefined,
        raw
      )
      patchTab(tabId, { data, loading: false, filterError: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Raw predicate failure: surface inline + keep the last good rows visible
      // (non-destructive, editor-style); a Builder error goes to the toast.
      if (tab.filterMode === 'raw') patchTab(tabId, { loading: false, filterError: msg })
      else patchTab(tabId, { loading: false, error: msg })
    }
  }

  // ── Workspace persistence ────────────────────────────────────────────────
  let _workspace: WorkspaceData = { lastConnectionId: null, connections: {} }
  let _saveTimer: ReturnType<typeof setTimeout> | null = null

  function buildConnectionWorkspace(tabs: Tab[], activeTabId: string | null): ConnectionWorkspace {
    return {
      activeTabId,
      tabs: tabs
        .map((tab): SerializedTab | null => {
          if (tab.kind === 'connection-editor' || tab.kind === 'backup') return null
          return {
            id: tab.id,
            entity: tab.entity,
            kind: tab.kind,
            connectionEditor: tab.connectionEditor,
            view: tab.view,
            structureSub: tab.structureSub,
            filters: tab.filters,
            ...(tab.filterMode === 'raw' ? { filterMode: 'raw' as const } : {}),
            ...(tab.rawWhere ? { rawWhere: tab.rawWhere } : {}),
            orderBy: tab.orderBy,
            colWidths: tab.colWidths,
            ...(tab.query !== null
              ? { sqlDraft: tab.query.sql, autoLimit: tab.query.autoLimit }
              : {}),
            ...(tab.draft !== null ? { draft: tab.draft } : {}),
            ...(tab.pinned ? { pinned: true } : {})
          }
        })
        .filter((t): t is SerializedTab => t !== null)
    }
  }

  function deserializeTab(t: SerializedTab): Tab {
    return {
      id: t.id,
      entity: t.entity,
      kind: t.kind,
      pinned: t.pinned,
      connectionEditor: t.connectionEditor,
      data: null,
      loading: false,
      error: null,
      pageIndex: 0,
      total: null,
      counting: false,
      filters: t.filters,
      filterMode: t.filterMode ?? 'builder',
      rawWhere: t.rawWhere ?? '',
      filterError: null,
      orderBy: t.orderBy,
      edits: {},
      deletes: [],
      inserts: [],
      colWidths: t.colWidths,
      committing: false,
      view: t.view,
      structureSub: t.structureSub ?? 'columns',
      structure: null,
      structureLoading: false,
      referencedBy: null,
      referencedByLoading: false,
      draft: t.draft ?? null,
      query:
        t.sqlDraft !== undefined
          ? {
              sql: t.sqlDraft,
              results: [],
              running: false,
              autoLimit: t.autoLimit ?? 500,
              plan: null,
              planning: false
            }
          : null
    }
  }

  /** Workspace key: `connectionId:dbName` (or just `connectionId` when no db). */
  function workspaceKey(connectionId: string, currentDb: string | null): string {
    return currentDb ? `${connectionId}:${currentDb}` : connectionId
  }

  /** Debounced (800ms) save of current connection+db workspace to disk. */
  function scheduleWorkspaceSave(): void {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      const { openConnectionId, currentDb, tabs, activeTabId } = get()
      if (!openConnectionId) return
      const key = workspaceKey(openConnectionId, currentDb)
      _workspace = {
        ..._workspace,
        lastConnectionId: openConnectionId,
        connections: { ..._workspace.connections, [key]: buildConnectionWorkspace(tabs, activeTabId) }
      }
      void window.api.workspace.save(_workspace)
    }, 800)
  }

  /** Flush the current connection+db workspace immediately (used before switching). */
  function flushWorkspace(
    connectionId: string,
    currentDb: string | null,
    tabs: Tab[],
    activeTabId: string | null
  ): void {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null }
    const key = workspaceKey(connectionId, currentDb)
    _workspace = {
      ..._workspace,
      lastConnectionId: connectionId,
      connections: { ..._workspace.connections, [key]: buildConnectionWorkspace(tabs, activeTabId) }
    }
    void window.api.workspace.save(_workspace)
  }

  /** Restore saved tabs for a connection+db after connecting. Fail-soft. */
  function restoreWorkspaceTabs(
    connectionId: string,
    currentDb: string | null,
    entities: EntityInfo[]
  ): void {
    const key = workspaceKey(connectionId, currentDb)
    const saved = _workspace.connections[key]
    if (!saved?.tabs.length) return
    const entitySet = new Set(entities.map((e) => `${e.schema ?? ''}\x00${e.name}`))
    const restoredTabs = saved.tabs
      .filter((t) => {
        if (t.kind === 'history') return true
        if (t.draft != null) return true
        if (t.sqlDraft !== undefined) return true
        return entitySet.has(`${t.entity.schema ?? ''}\x00${t.entity.name}`)
      })
      .map(deserializeTab)
    if (!restoredTabs.length) return
    const restoredActiveId = restoredTabs.some((t) => t.id === saved.activeTabId)
      ? saved.activeTabId
      : restoredTabs[0].id
    set({ tabs: restoredTabs, activeTabId: restoredActiveId })
    const activeRestored = restoredTabs.find((t) => t.id === restoredActiveId)
    if (activeRestored && !activeRestored.kind && !activeRestored.draft && !activeRestored.query) {
      void fetchTab(restoredActiveId!)
    }
  }
  // ── End workspace persistence ─────────────────────────────────────────────

  return {
    connections: [],
    loading: false,

    load: async () => {
      set({ loading: true })
      const connections = await window.api.connections.list()
      set({ loading: false, connections })
    },

    templates: [],
    loadTemplates: async () => {
      set({ templates: await window.api.templates.list() })
    },
    saveTemplate: async (t) => {
      const saved = await window.api.templates.save(t)
      set({ templates: await window.api.templates.list() })
      return saved
    },
    removeTemplate: async (id) => {
      await window.api.templates.remove(id)
      set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }))
    },

    lastConnectionId: null,

    loadWorkspace: async () => {
      _workspace = await window.api.workspace.load()
      set({ lastConnectionId: _workspace.lastConnectionId })
    },

    autoOpenLast: () => {
      const { lastConnectionId, connections, openConnectionId, open } = get()
      if (
        lastConnectionId &&
        !openConnectionId &&
        connections.some((c) => c.id === lastConnectionId)
      ) {
        void open(lastConnectionId)
      }
    },

    save: async (input) => {
      const saved = await window.api.connections.save(input)
      await get().load()
      return saved
    },

    remove: async (id) => {
      await window.api.connections.remove(id)
      await get().load()
    },

    duplicate: async (id) => {
      const copy = await window.api.connections.duplicate(id)
      await get().load()
      get().openConnectionEditorTab(copy.id)
      return copy
    },

    openConnectionId: null,
    sessionStatus: 'idle',
    sessionError: null,
    entities: [],
    enums: [],
    databases: [],
    currentDb: null,

    open: async (id) => {
      // Flush current connection's workspace before switching
      const prev = get()
      if (prev.openConnectionId && prev.tabs.length > 0) {
        flushWorkspace(prev.openConnectionId, prev.currentDb, prev.tabs, prev.activeTabId)
      }

      set({
        openConnectionId: id,
        sessionStatus: 'connecting',
        sessionError: null,
        entities: [],
        enums: [],
        databases: [],
        currentDb: null,
        tabs: [],
        activeTabId: null
      })
      try {
        await window.api.sessions.connect(id)
        const entities = await window.api.sessions.listEntities(id)
        const enums = await window.api.sessions.listEnums(id)
        // Fetch currentDatabase synchronously — fast cached call, needed for workspace key
        let currentDb: string | null = null
        try { currentDb = await window.api.sessions.currentDatabase(id) } catch { /* ignore */ }
        set({ sessionStatus: 'connected', entities, enums, currentDb })
        restoreWorkspaceTabs(id, currentDb, entities)

        // databases list loads lazily/non-blocking
        window.api.sessions.listDatabases(id)
          .then((databases) => { if (get().openConnectionId === id) set({ databases }) })
          .catch(() => { /* listing not supported / no perms */ })
      } catch (err) {
        set({
          sessionStatus: 'error',
          sessionError: err instanceof Error ? err.message : String(err)
        })
      }
    },

    refreshEntities: async () => {
      const id = get().openConnectionId
      if (!id) return
      const entities = await window.api.sessions.listEntities(id)
      const enums = await window.api.sessions.listEnums(id)
      set({ entities, enums })
    },

    switchDatabase: async (name) => {
      const id = get().openConnectionId
      if (!id || name === get().currentDb) return
      // Flush current db's tabs before switching
      const { currentDb: prevDb, tabs, activeTabId } = get()
      flushWorkspace(id, prevDb, tabs, activeTabId)
      set({ sessionStatus: 'connecting', sessionError: null })
      try {
        await window.api.sessions.useDatabase(id, name)
        const entities = await window.api.sessions.listEntities(id)
        const enums = await window.api.sessions.listEnums(id)
        set({
          currentDb: name,
          entities,
          enums,
          sessionStatus: 'connected',
          tabs: [],
          activeTabId: null
        })
        restoreWorkspaceTabs(id, name, entities)
      } catch (err) {
        set({
          sessionStatus: 'error',
          sessionError: err instanceof Error ? err.message : String(err)
        })
      }
    },

    createTable: async (spec) => {
      const id = get().openConnectionId
      if (!id) throw new Error('No active connection')
      const { ddl } = await window.api.sessions.createTable(id, spec)
      await get().refreshEntities()
      return ddl
    },

    dropEntity: async (entity, type) => {
      const id = get().openConnectionId
      if (!id) throw new Error('No active connection')
      const { statements } = await window.api.sessions.dropEntity(id, entity, type)
      // close any open tabs for the dropped entity
      set((s) => {
        const tabs = s.tabs.filter(
          (t) => entityKey(t.entity) !== entityKey(entity)
        )
        const activeTabId = tabs.some((t) => t.id === s.activeTabId)
          ? s.activeTabId
          : (tabs[tabs.length - 1]?.id ?? null)
        return { tabs, activeTabId }
      })
      await get().refreshEntities()
      return statements
    },

    renameTable: async (entity, newName) => {
      const id = get().openConnectionId
      if (!id) throw new Error('No active connection')
      const { statements } = await window.api.sessions.renameTable(
        id,
        entity,
        newName
      )
      // retarget any open tab for the renamed table
      set((s) => ({
        tabs: s.tabs.map((t) =>
          entityKey(t.entity) === entityKey(entity)
            ? { ...t, entity: { ...t.entity, name: newName } }
            : t
        )
      }))
      await get().refreshEntities()
      return statements
    },

    truncateTable: async (entity) => {
      const id = get().openConnectionId
      if (!id) throw new Error('No active connection')
      const { statements } = await window.api.sessions.truncateTable(id, entity)
      // refresh data + clear staged edits for any open tab on this table
      const tab = get().tabs.find(
        (t) => entityKey(t.entity) === entityKey(entity)
      )
      if (tab) {
        patchTab(tab.id, {
          pageIndex: 0,
          total: 0,
          edits: {},
          deletes: [],
          inserts: []
        })
        await fetchTab(tab.id)
      }
      return statements
    },

    closeSession: async () => {
      const id = get().openConnectionId
      if (id) await window.api.sessions.disconnect(id)
      set({
        openConnectionId: null,
        sessionStatus: 'idle',
        sessionError: null,
        entities: [],
        enums: [],
        tabs: [],
        activeTabId: null
      })
    },

    disconnect: async () => {
      const id = get().openConnectionId
      if (!id) return
      // Flush workspace to disk before clearing tabs
      const { currentDb, tabs, activeTabId } = get()
      flushWorkspace(id, currentDb, tabs, activeTabId)
      try {
        await window.api.sessions.disconnect(id)
      } catch {
        // socket already dead — ignore
      }
      // Clear tabs → landing; openConnectionId stays so sidebar/status still show
      set({ sessionStatus: 'disconnected', sessionError: null, tabs: [], activeTabId: null })
    },

    reconnect: async () => {
      const id = get().openConnectionId
      if (!id) return
      set({ sessionStatus: 'connecting', sessionError: null })
      try {
        await window.api.sessions.reconnect(id)
        const entities = await window.api.sessions.listEntities(id)
        const enums = await window.api.sessions.listEnums(id)
        let currentDb: string | null = null
        try { currentDb = await window.api.sessions.currentDatabase(id) } catch { /* ignore */ }
        set({ sessionStatus: 'connected', entities, enums, currentDb })
        restoreWorkspaceTabs(id, currentDb, entities)

        window.api.sessions.listDatabases(id)
          .then((databases) => { if (get().openConnectionId === id) set({ databases }) })
          .catch(() => {})
      } catch (err) {
        set({
          sessionStatus: 'error',
          sessionError: err instanceof Error ? err.message : String(err)
        })
      }
    },

    tabs: [],
    activeTabId: null,
    pageSize: PAGE_SIZE,

    openHistoryTab: () => {
      const existing = get().tabs.find((t) => t.kind === 'history')
      if (existing) {
        set({ activeTabId: existing.id })
        scheduleWorkspaceSave()
        return
      }
      const tab: Tab = {
        id: crypto.randomUUID(),
        kind: 'history',
        entity: { name: 'History' },
        data: null, loading: false, error: null, pageIndex: 0, total: null,
        counting: false, filters: [], filterMode: 'builder', rawWhere: '',
        filterError: null, orderBy: [], edits: {}, deletes: [],
        inserts: [], colWidths: {}, committing: false, view: 'data',
        structureSub: 'columns', referencedBy: null, referencedByLoading: false,
        structure: null, structureLoading: false, draft: null, query: null
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      scheduleWorkspaceSave()
    },

    openBackupTab: () => {
      const existing = get().tabs.find((t) => t.kind === 'backup')
      if (existing) {
        set({ activeTabId: existing.id })
        return
      }
      const tab: Tab = {
        id: crypto.randomUUID(),
        kind: 'backup',
        entity: { name: 'Backup & Restore' },
        data: null, loading: false, error: null, pageIndex: 0, total: null,
        counting: false, filters: [], filterMode: 'builder', rawWhere: '',
        filterError: null, orderBy: [], edits: {}, deletes: [],
        inserts: [], colWidths: {}, committing: false, view: 'data',
        structureSub: 'columns', referencedBy: null, referencedByLoading: false,
        structure: null, structureLoading: false, draft: null, query: null
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    },

    openConnectionEditorTab: (connectionId) => {
      const existing = get().tabs.find(
        (t) => t.kind === 'connection-editor' &&
               t.connectionEditor?.connectionId === connectionId
      )
      if (existing) {
        set({ activeTabId: existing.id })
        return
      }
      const conn = connectionId
        ? get().connections.find((c) => c.id === connectionId)
        : null
      const tab: Tab = {
        id: crypto.randomUUID(),
        kind: 'connection-editor',
        connectionEditor: { connectionId },
        entity: { name: conn?.name ?? (connectionId ? 'Connection' : 'New connection') },
        data: null, loading: false, error: null, pageIndex: 0, total: null,
        counting: false, filters: [], filterMode: 'builder', rawWhere: '',
        filterError: null, orderBy: [], edits: {}, deletes: [],
        inserts: [], colWidths: {}, committing: false, view: 'data',
        structureSub: 'columns', referencedBy: null, referencedByLoading: false,
        structure: null, structureLoading: false, draft: null, query: null
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    },

    patchEditorTabConnection: (tabId, connectionId) => {
      const conn = get().connections.find((c) => c.id === connectionId)
      patchTab(tabId, {
        entity: { name: conn?.name ?? 'Connection' },
        connectionEditor: { connectionId }
      })
    },

    openTable: async (entity, initialFilters, opts) => {
      const existing = get().tabs.find(
        (t) => entityKey(t.entity) === entityKey(entity)
      )
      if (existing) {
        set({ activeTabId: existing.id })
        // navigate to a requested view/sub-tab (walkable relations)
        if (opts?.view) patchTab(existing.id, { view: opts.view })
        if (opts?.structureSub) patchTab(existing.id, { structureSub: opts.structureSub })
        if (initialFilters) {
          patchTab(existing.id, {
            filters: initialFilters,
            pageIndex: 0,
            total: null,
            edits: {},
            deletes: [],
            inserts: []
          })
          await fetchTab(existing.id)
        } else if (existing.data === null && !existing.loading) {
          // restored tab with no data yet — fetch now
          await fetchTab(existing.id)
        }
        if (opts?.view === 'structure') {
          await get().setTabView('structure') // ensures structure is fetched
        }
        scheduleWorkspaceSave()
        return
      }
      const view: TabView = opts?.view ?? 'data'
      const tab: Tab = {
        id: crypto.randomUUID(),
        entity,
        data: null,
        loading: view === 'data',
        error: null,
        pageIndex: 0,
        total: null,
        counting: false,
        filters: initialFilters ?? [],
        filterMode: 'builder',
        rawWhere: '',
        filterError: null,
        orderBy: [],
        edits: {},
        deletes: [],
        inserts: [],
        colWidths: {},
        committing: false,
        view,
        structureSub: opts?.structureSub ?? 'columns',
        structure: null,
        structureLoading: false,
        referencedBy: null,
        referencedByLoading: false,
        draft: null,
        query: null
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      scheduleWorkspaceSave()
      if (view === 'data') await fetchTab(tab.id)
      else await get().setTabView('structure')
    },

    openNewTable: (initial) => {
      const tab: Tab = {
        id: crypto.randomUUID(),
        entity: { name: 'New table' },
        data: null,
        loading: false,
        error: null,
        pageIndex: 0,
        total: null,
        counting: false,
        filters: [],
        filterMode: 'builder',
        rawWhere: '',
        filterError: null,
        orderBy: [],
        edits: {},
        deletes: [],
        inserts: [],
        colWidths: {},
        committing: false,
        view: 'structure',
        structureSub: 'columns',
        structure: null,
        structureLoading: false,
        referencedBy: null,
        referencedByLoading: false,
        draft: {
          name: initial?.name ?? '',
          columns:
            initial?.columns && initial.columns.length > 0
              ? initial.columns
              : [{ name: 'id', type: '', nullable: false, pk: true }]
        },
        query: null
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      scheduleWorkspaceSave()
    },

    openQuery: () => {
      const tab: Tab = {
        id: crypto.randomUUID(),
        entity: { name: 'Query' },
        data: null,
        loading: false,
        error: null,
        pageIndex: 0,
        total: null,
        counting: false,
        filters: [],
        filterMode: 'builder',
        rawWhere: '',
        filterError: null,
        orderBy: [],
        edits: {},
        deletes: [],
        inserts: [],
        colWidths: {},
        committing: false,
        view: 'data',
        structureSub: 'columns',
        structure: null,
        structureLoading: false,
        referencedBy: null,
        referencedByLoading: false,
        draft: null,
        query: {
          sql: '',
          results: [],
          running: false,
          autoLimit: 500,
          plan: null,
          planning: false
        }
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      scheduleWorkspaceSave()
    },

    setQuerySql: (sql) => {
      const { activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (tab?.query) { patchTab(tab.id, { query: { ...tab.query, sql } }); scheduleWorkspaceSave() }
    },
    setQueryAutoLimit: (n) => {
      const { activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (tab?.query) { patchTab(tab.id, { query: { ...tab.query, autoLimit: n } }); scheduleWorkspaceSave() }
    },
    runQuery: async (sql) => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!openConnectionId || !tab?.query || !sql.trim()) return
      // running a normal query dismisses any open plan panel
      patchTab(tab.id, { query: { ...tab.query, running: true, plan: null } })
      try {
        const results = await window.api.sessions.runScript(
          openConnectionId,
          sql,
          tab.query.autoLimit || undefined
        )
        const cur = get().tabs.find((t) => t.id === tab.id)
        if (cur?.query)
          patchTab(tab.id, { query: { ...cur.query, results, running: false } })
      } catch (err) {
        const cur = get().tabs.find((t) => t.id === tab.id)
        if (cur?.query)
          patchTab(tab.id, {
            query: {
              ...cur.query,
              running: false,
              results: [
                {
                  statement: sql,
                  kind: 'error',
                  error: err instanceof Error ? err.message : String(err)
                }
              ]
            }
          })
      }
    },
    explainQuery: async (analyze) => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      const sql = tab?.query?.sql ?? ''
      if (!openConnectionId || !tab?.query || !sql.trim()) return
      patchTab(tab.id, { query: { ...tab.query, planning: true } })
      try {
        const plan = await window.api.sessions.explainQuery(
          openConnectionId,
          sql,
          analyze
        )
        const cur = get().tabs.find((t) => t.id === tab.id)
        if (cur?.query)
          patchTab(tab.id, { query: { ...cur.query, plan, planning: false } })
      } catch (err) {
        const cur = get().tabs.find((t) => t.id === tab.id)
        if (cur?.query)
          patchTab(tab.id, {
            query: {
              ...cur.query,
              planning: false,
              results: [
                {
                  statement: sql,
                  kind: 'error',
                  error: err instanceof Error ? err.message : String(err)
                }
              ]
            }
          })
      }
    },
    clearPlan: () => {
      const { activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (tab?.query) patchTab(tab.id, { query: { ...tab.query, plan: null } })
    },
    cancelRunningQuery: async () => {
      const id = get().openConnectionId
      if (id) await window.api.sessions.cancelQuery(id)
    },

    patchDraft: (p) => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab?.draft) return
      patchTab(id, { draft: { ...tab.draft, ...p } })
    },

    closeTab: (tabId) => {
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === tabId)
        const tabs = s.tabs.filter((t) => t.id !== tabId)
        let activeTabId = s.activeTabId
        if (s.activeTabId === tabId) {
          const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null
          activeTabId = neighbor?.id ?? null
        }
        return { tabs, activeTabId }
      })
      scheduleWorkspaceSave()
    },

    setActiveTab: (tabId) => {
      set({ activeTabId: tabId })
      scheduleWorkspaceSave()
      // auto-fetch on view: if a restored tab has no data, load it now
      const tab = get().tabs.find((t) => t.id === tabId)
      if (tab && !tab.kind && !tab.draft && !tab.query && tab.data === null && !tab.loading) {
        void fetchTab(tabId)
      }
    },

    gotoPage: async (index) => {
      const id = get().activeTabId
      if (!id) return
      patchTab(id, { pageIndex: index, edits: {}, deletes: [], inserts: [] })
      await fetchTab(id)
    },

    setFilters: async (filters) => {
      const id = get().activeTabId
      if (!id) return
      patchTab(id, {
        filters,
        pageIndex: 0,
        total: null,
        edits: {},
        deletes: [],
        inserts: []
      })
      scheduleWorkspaceSave()
      await fetchTab(id)
    },

    setFilterMode: async (mode) => {
      const { activeTabId, tabs, openConnectionId, connections } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!activeTabId || !tab || tab.filterMode === mode) return
      let rawWhere = tab.rawWhere
      // Builder → Raw: one-way seed the raw box with the SQL the builder produced
      if (mode === 'raw' && !rawWhere.trim()) {
        const dialect =
          connections.find((c) => c.id === openConnectionId)?.driver ?? 'postgres'
        rawWhere = filtersToWhere(tab.filters, dialect)
      }
      patchTab(activeTabId, {
        filterMode: mode,
        rawWhere,
        filterError: null,
        pageIndex: 0,
        total: null,
        edits: {},
        deletes: [],
        inserts: []
      })
      scheduleWorkspaceSave()
      await fetchTab(activeTabId)
    },

    setRawWhere: (text) => {
      const id = get().activeTabId
      if (!id) return
      patchTab(id, { rawWhere: text })
      scheduleWorkspaceSave()
    },

    applyRawWhere: async (text) => {
      const id = get().activeTabId
      if (!id) return
      patchTab(id, {
        rawWhere: text,
        filterMode: 'raw',
        pageIndex: 0,
        total: null,
        edits: {},
        deletes: [],
        inserts: []
      })
      scheduleWorkspaceSave()
      await fetchTab(id)
    },

    setPageSize: async (size) => {
      const id = get().activeTabId
      if (!id) return
      set({ pageSize: size })
      patchTab(id, { pageIndex: 0, edits: {}, deletes: [], inserts: [] })
      await fetchTab(id)
    },

    countRows: async () => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!openConnectionId || !tab) return
      patchTab(tab.id, { counting: true })
      try {
        const total = await window.api.sessions.countRows(
          openConnectionId,
          tab.entity,
          tab.filters,
          tab.filterMode === 'raw' ? tab.rawWhere : undefined
        )
        patchTab(tab.id, { total, counting: false })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (tab.filterMode === 'raw') patchTab(tab.id, { counting: false, filterError: msg })
        else patchTab(tab.id, { counting: false, error: msg })
      }
    },

    setSort: async (column, additive = false) => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab) return
      const cur = tab.orderBy
      const idx = cur.findIndex((o) => o.column === column)
      let next: Sort[]
      if (additive) {
        // shift-click: add column / cycle its dir / drop it, keeping the rest
        if (idx < 0) next = [...cur, { column, dir: 'asc' }]
        else if (cur[idx].dir === 'asc')
          next = cur.map((o, i) => (i === idx ? { column, dir: 'desc' } : o))
        else next = cur.filter((_, i) => i !== idx)
      } else {
        // plain click: sort by this column only, cycle asc → desc → none
        if (cur.length === 1 && idx === 0)
          next = cur[0].dir === 'asc' ? [{ column, dir: 'desc' }] : []
        else next = [{ column, dir: 'asc' }]
      }
      patchTab(id, {
        orderBy: next,
        pageIndex: 0,
        edits: {},
        deletes: [],
        inserts: []
      })
      scheduleWorkspaceSave()
      await fetchTab(id)
    },

    setTabView: async (view) => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!activeTabId || !tab) return
      patchTab(activeTabId, { view })
      scheduleWorkspaceSave()
      // switching to data on a tab whose rows were never fetched (e.g. opened
      // straight into structure via walkable relations) → load them now
      if (
        view === 'data' &&
        tab.data === null &&
        !tab.loading &&
        !tab.draft &&
        !tab.query &&
        !tab.kind &&
        openConnectionId
      ) {
        await fetchTab(activeTabId)
      }
      if (view === 'structure' && !tab.structure && openConnectionId) {
        patchTab(activeTabId, { structureLoading: true })
        try {
          const structure = await window.api.sessions.describeTable(
            openConnectionId,
            tab.entity
          )
          patchTab(activeTabId, {
            structure,
            structureLoading: false,
            // fresh structure → reseed draft + clear staged schema edits
            structDraft: null,
            idxAdds: [],
            idxDrops: [],
            fkDrops: [],
            structDirty: false
          })
        } catch (err) {
          patchTab(activeTabId, {
            structureLoading: false,
            error: err instanceof Error ? err.message : String(err)
          })
        }
      }
    },

    setStructureSub: (sub) => {
      const { activeTabId } = get()
      if (!activeTabId) return
      patchTab(activeTabId, { structureSub: sub })
      scheduleWorkspaceSave()
      if (sub === 'referencedBy') void get().fetchReferencedBy()
    },

    fetchReferencedBy: async () => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!openConnectionId || !tab || tab.draft) return
      if (tab.referencedBy !== null || tab.referencedByLoading) return // cached / in-flight
      patchTab(tab.id, { referencedByLoading: true })
      try {
        const referencedBy = await window.api.sessions.listReferencingTables(
          openConnectionId,
          tab.entity
        )
        patchTab(tab.id, { referencedBy, referencedByLoading: false })
      } catch (err) {
        patchTab(tab.id, {
          referencedByLoading: false,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    },

    refreshStructure: async () => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!activeTabId || !tab || !openConnectionId) return
      // invalidate referencedBy cache so it re-fetches on next view
      patchTab(activeTabId, { structureLoading: true, referencedBy: null })
      try {
        const structure = await window.api.sessions.describeTable(
          openConnectionId,
          tab.entity
        )
        patchTab(activeTabId, {
          structure,
          structureLoading: false,
          // fresh structure → reseed draft + clear staged schema edits
          structDraft: null,
          idxAdds: [],
          idxDrops: [],
          fkDrops: [],
          structDirty: false
        })
        if (get().tabs.find((t) => t.id === activeTabId)?.structureSub === 'referencedBy') {
          void get().fetchReferencedBy()
        }
      } catch (err) {
        patchTab(activeTabId, {
          structureLoading: false,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    },

    createIndex: async (spec) => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!openConnectionId || !tab) throw new Error('No active table')
      const { statements } = await window.api.sessions.createIndex(
        openConnectionId,
        tab.entity,
        spec
      )
      await get().refreshStructure()
      return statements
    },

    dropIndex: async (name) => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!openConnectionId || !tab) throw new Error('No active table')
      const { statements } = await window.api.sessions.dropIndex(
        openConnectionId,
        tab.entity,
        name
      )
      await get().refreshStructure()
      return statements
    },

    setCellEdit: (rowIndex, column, value) => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab) return
      patchTab(id, {
        edits: { ...tab.edits, [editKey(rowIndex, column)]: value }
      })
    },

    stageDeletes: (rowIndices) => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab) return
      patchTab(id, { deletes: [...new Set([...tab.deletes, ...rowIndices])] })
    },

    addRow: () => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab) return
      patchTab(id, { inserts: [...tab.inserts, {}] })
    },

    setInsertCell: (insertIndex, column, value) => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab) return
      const inserts = tab.inserts.map((row, i) =>
        i === insertIndex ? { ...row, [column]: value } : row
      )
      patchTab(id, { inserts })
    },

    removeInsert: (insertIndex) => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab) return
      patchTab(id, {
        inserts: tab.inserts.filter((_, i) => i !== insertIndex)
      })
    },

    setColWidth: (column, width) => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab) return
      patchTab(id, {
        colWidths: { ...tab.colWidths, [column]: Math.max(60, width) }
      })
      scheduleWorkspaceSave()
    },

    setPinOverride: (column, side) => {
      const id = get().activeTabId
      const tab = get().tabs.find((t) => t.id === id)
      if (!id || !tab) return
      const next = { ...(tab.pinnedOverride ?? {}) }
      if (side === null) delete next[column]
      else next[column] = side
      patchTab(id, { pinnedOverride: next })
      // session-only (ADR-0016): no scheduleWorkspaceSave()
    },

    clearChanges: () => {
      const id = get().activeTabId
      if (id) patchTab(id, { edits: {}, deletes: [], inserts: [] })
    },

    commitChanges: async () => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!openConnectionId || !tab || !tab.data) return
      const pkCols = tab.data.primaryKey
      const hasRowChanges =
        Object.keys(tab.edits).length > 0 || tab.deletes.length > 0
      if (pkCols.length === 0 && hasRowChanges) {
        patchTab(tab.id, {
          error: 'Cannot edit/delete: table has no primary key'
        })
        return
      }
      const pkOf = (ri: number): Record<string, unknown> => {
        const row = tab.data!.rows[ri]
        const pk: Record<string, unknown> = {}
        for (const c of pkCols) pk[c] = row[c]
        return pk
      }
      const deleteSet = new Set(tab.deletes)
      const byRow = new Map<number, Record<string, unknown>>()
      for (const [k, v] of Object.entries(tab.edits)) {
        const sep = k.indexOf('|')
        const ri = Number(k.slice(0, sep))
        if (deleteSet.has(ri)) continue // delete supersedes edit
        const m = byRow.get(ri) ?? {}
        m[k.slice(sep + 1)] = v
        byRow.set(ri, m)
      }
      const updates: RowEdit[] = [...byRow].map(([ri, changes]) => ({
        pk: pkOf(ri),
        changes
      }))
      const deletes = [...deleteSet].map(pkOf)
      const inserts = tab.inserts.filter((r) => Object.keys(r).length > 0)
      patchTab(tab.id, { committing: true, error: null })
      try {
        await window.api.sessions.applyChanges(openConnectionId, tab.entity, {
          inserts,
          updates,
          deletes
        })
        patchTab(tab.id, {
          edits: {},
          deletes: [],
          inserts: [],
          committing: false
        })
        await fetchTab(tab.id)
      } catch (err) {
        patchTab(tab.id, {
          committing: false,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    },

    setStructDraft: (cols) => {
      const id = get().activeTabId
      if (id) patchTab(id, { structDraft: cols })
    },
    setIdxAdds: (adds) => {
      const id = get().activeTabId
      if (id) patchTab(id, { idxAdds: adds })
    },
    setIdxDrops: (drops) => {
      const id = get().activeTabId
      if (id) patchTab(id, { idxDrops: drops })
    },
    setFkDrops: (drops) => {
      const id = get().activeTabId
      if (id) patchTab(id, { fkDrops: drops })
    },
    setStructDirty: (dirty) => {
      const { activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (tab && !!tab.structDirty !== dirty) patchTab(tab.id, { structDirty: dirty })
    },

    closeOtherTabs: (tabId) => {
      // keep the target tab and any pinned tabs
      set((s) => ({
        tabs: s.tabs.filter((t) => t.id === tabId || t.pinned),
        activeTabId: tabId
      }))
      scheduleWorkspaceSave()
    },
    closeTabsToRight: (tabId) => {
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === tabId)
        if (idx < 0) return s
        // keep everything up to & including the target, plus any pinned tabs
        const tabs = s.tabs.filter((t, j) => j <= idx || t.pinned)
        const activeTabId = tabs.some((t) => t.id === s.activeTabId)
          ? s.activeTabId
          : tabId
        return { tabs, activeTabId }
      })
      scheduleWorkspaceSave()
    },
    closeAllTabs: () => {
      // pinned tabs survive a "close all"
      set((s) => {
        const tabs = s.tabs.filter((t) => t.pinned)
        const activeTabId = tabs.some((t) => t.id === s.activeTabId)
          ? s.activeTabId
          : (tabs[0]?.id ?? null)
        return { tabs, activeTabId }
      })
      scheduleWorkspaceSave()
    },
    togglePinTab: (tabId) => {
      set((s) => {
        const toggled = s.tabs.map((t) =>
          t.id === tabId ? { ...t, pinned: !t.pinned } : t
        )
        // re-assert invariant: pinned block first, then unpinned (stable)
        const tabs = [
          ...toggled.filter((t) => t.pinned),
          ...toggled.filter((t) => !t.pinned)
        ]
        return { tabs }
      })
      scheduleWorkspaceSave()
    },
    moveTab: (fromId, toId) => {
      if (fromId === toId) return
      set((s) => {
        const tabs = [...s.tabs]
        const from = tabs.findIndex((t) => t.id === fromId)
        const to = tabs.findIndex((t) => t.id === toId)
        if (from < 0 || to < 0) return s
        const [moved] = tabs.splice(from, 1)
        tabs.splice(to, 0, moved)
        // keep pinned tabs left of unpinned, preserving the new relative order
        const reordered = [
          ...tabs.filter((t) => t.pinned),
          ...tabs.filter((t) => !t.pinned)
        ]
        return { tabs: reordered }
      })
      scheduleWorkspaceSave()
    }
  }
})
