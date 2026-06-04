import { create } from 'zustand'
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
  QueryResult,
  RowsResult,
  SaveConnectionInput,
  SerializedTab,
  ConnectionWorkspace,
  WorkspaceData,
  Sort,
  TableStructure
} from '../../../shared/types'

export interface QueryState {
  sql: string
  results: QueryResult[]
  running: boolean
  /** auto-LIMIT for SELECTs; 0 = off */
  autoLimit: number
}

export type TabView = 'data' | 'structure'

const PAGE_SIZE = 100

type SessionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface Tab {
  id: string
  entity: EntityRef
  /** undefined / absent = regular table/query/new-table tab */
  kind?: 'history' | 'connection-editor'
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
  structure: TableStructure | null
  structureLoading: boolean
  /** present => this tab is an unsaved "new table" draft (no entity yet) */
  draft: { name: string; columns: NewColumnSpec[] } | null
  /** present => this tab is a SQL editor */
  query: QueryState | null
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
  /** Load workspace.json from disk. Call once on app startup before any open(). */
  loadWorkspace: () => Promise<void>
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
  /** Open/focus a connection-editor tab. `connectionId` null = new connection. */
  openConnectionEditorTab: (connectionId: string | null) => void
  /** Update an editor tab's stored connectionId after saving a new connection. */
  patchEditorTabConnection: (tabId: string, connectionId: string) => void

  openTable: (entity: EntityRef, initialFilters?: Filter[]) => Promise<void>
  openNewTable: () => void
  openQuery: () => void
  setQuerySql: (sql: string) => void
  setQueryAutoLimit: (n: number) => void
  runQuery: (sql: string) => Promise<void>
  cancelRunningQuery: () => Promise<void>
  patchDraft: (p: Partial<{ name: string; columns: NewColumnSpec[] }>) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  gotoPage: (index: number) => Promise<void>
  setPageSize: (size: number) => Promise<void>
  countRows: () => Promise<void>
  setFilters: (filters: Filter[]) => Promise<void>
  setSort: (column: string, additive?: boolean) => Promise<void>
  setTabView: (view: TabView) => Promise<void>
  refreshStructure: () => Promise<void>
  createIndex: (spec: IndexSpec) => Promise<string[]>
  dropIndex: (name: string) => Promise<string[]>
  setCellEdit: (rowIndex: number, column: string, value: unknown) => void
  stageDeletes: (rowIndices: number[]) => void
  addRow: () => void
  setInsertCell: (insertIndex: number, column: string, value: unknown) => void
  removeInsert: (insertIndex: number) => void
  setColWidth: (column: string, width: number) => void
  clearChanges: () => void
  commitChanges: () => Promise<void>
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
    patchTab(tabId, { loading: true, error: null })
    try {
      const data = await window.api.sessions.readRows(
        openConnectionId,
        tab.entity,
        pageSize,
        tab.pageIndex * pageSize,
        tab.filters,
        tab.orderBy.length ? tab.orderBy : undefined
      )
      patchTab(tabId, { data, loading: false })
    } catch (err) {
      patchTab(tabId, {
        loading: false,
        error: err instanceof Error ? err.message : String(err)
      })
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
          if (tab.kind === 'connection-editor') return null // don't persist editor tabs
          return {
            id: tab.id,
            entity: tab.entity,
            kind: tab.kind,
            connectionEditor: tab.connectionEditor,
            view: tab.view,
            filters: tab.filters,
            orderBy: tab.orderBy,
            colWidths: tab.colWidths,
            ...(tab.query !== null
              ? { sqlDraft: tab.query.sql, autoLimit: tab.query.autoLimit }
              : {}),
            ...(tab.draft !== null ? { draft: tab.draft } : {})
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
      connectionEditor: t.connectionEditor,
      data: null,
      loading: false,
      error: null,
      pageIndex: 0,
      total: null,
      counting: false,
      filters: t.filters,
      orderBy: t.orderBy,
      edits: {},
      deletes: [],
      inserts: [],
      colWidths: t.colWidths,
      committing: false,
      view: t.view,
      structure: null,
      structureLoading: false,
      draft: t.draft ?? null,
      query:
        t.sqlDraft !== undefined
          ? { sql: t.sqlDraft, results: [], running: false, autoLimit: t.autoLimit ?? 500 }
          : null
    }
  }

  /** Debounced (800ms) save of current connection's workspace to disk. */
  function scheduleWorkspaceSave(): void {
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      const { openConnectionId, tabs, activeTabId } = get()
      if (!openConnectionId) return
      _workspace = {
        ..._workspace,
        lastConnectionId: openConnectionId,
        connections: {
          ..._workspace.connections,
          [openConnectionId]: buildConnectionWorkspace(tabs, activeTabId)
        }
      }
      void window.api.workspace.save(_workspace)
    }, 800)
  }

  /** Flush the current connection's workspace immediately (used before switching). */
  function flushWorkspace(connectionId: string, tabs: Tab[], activeTabId: string | null): void {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null }
    _workspace = {
      ..._workspace,
      lastConnectionId: connectionId,
      connections: {
        ..._workspace.connections,
        [connectionId]: buildConnectionWorkspace(tabs, activeTabId)
      }
    }
    void window.api.workspace.save(_workspace)
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

    loadWorkspace: async () => {
      _workspace = await window.api.workspace.load()
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
        flushWorkspace(prev.openConnectionId, prev.tabs, prev.activeTabId)
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
        set({ sessionStatus: 'connected', entities, enums })

        // Restore saved workspace for this connection (fail soft)
        const saved = _workspace.connections[id]
        if (saved?.tabs.length) {
          const entitySet = new Set(
            entities.map((e) => `${e.schema ?? ''}\x00${e.name}`)
          )
          const restoredTabs = saved.tabs
            .filter((t) => {
              // special tabs always restore
              if (t.kind === 'history') return true
              if (t.draft != null) return true       // new-table draft
              if (t.sqlDraft !== undefined) return true // query tab
              // regular table tab — only if entity still exists
              return entitySet.has(`${t.entity.schema ?? ''}\x00${t.entity.name}`)
            })
            .map(deserializeTab)
          if (restoredTabs.length > 0) {
            const restoredActiveId = restoredTabs.some((t) => t.id === saved.activeTabId)
              ? saved.activeTabId
              : restoredTabs[0].id
            set({ tabs: restoredTabs, activeTabId: restoredActiveId })
            // auto-fetch the initially active tab (setActiveTab path not called on restore)
            const activeRestored = restoredTabs.find((t) => t.id === restoredActiveId)
            if (activeRestored && !activeRestored.kind && !activeRestored.draft && !activeRestored.query) {
              void fetchTab(restoredActiveId!)
            }
          }
        }

        // databases load lazily/non-blocking — don't gate connect on it
        Promise.all([
          window.api.sessions.listDatabases(id),
          window.api.sessions.currentDatabase(id)
        ])
          .then(([databases, currentDb]) => {
            if (get().openConnectionId === id) set({ databases, currentDb })
          })
          .catch(() => { /* listing not supported / no perms — leave empty */ })
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
      set({ sessionStatus: 'connecting', sessionError: null })
      try {
        await window.api.sessions.useDatabase(id, name)
        const entities = await window.api.sessions.listEntities(id)
        const enums = await window.api.sessions.listEnums(id)
        // tabs belong to the old database — close them all
        set({
          currentDb: name,
          entities,
          enums,
          sessionStatus: 'connected',
          tabs: [],
          activeTabId: null
        })
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
      const { tabs, activeTabId } = get()
      flushWorkspace(id, tabs, activeTabId)
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
        set({ sessionStatus: 'connected', entities, enums })

        // Restore workspace tabs (same logic as open())
        const saved = _workspace.connections[id]
        if (saved?.tabs.length) {
          const entitySet = new Set(entities.map((e) => `${e.schema ?? ''}\x00${e.name}`))
          const restoredTabs = saved.tabs
            .filter((t) => {
              if (t.kind === 'history') return true
              if (t.draft != null) return true
              if (t.sqlDraft !== undefined) return true
              return entitySet.has(`${t.entity.schema ?? ''}\x00${t.entity.name}`)
            })
            .map(deserializeTab)
          if (restoredTabs.length > 0) {
            const restoredActiveId = restoredTabs.some((t) => t.id === saved.activeTabId)
              ? saved.activeTabId
              : restoredTabs[0].id
            set({ tabs: restoredTabs, activeTabId: restoredActiveId })
            const activeRestored = restoredTabs.find((t) => t.id === restoredActiveId)
            if (activeRestored && !activeRestored.kind && !activeRestored.draft && !activeRestored.query) {
              void fetchTab(restoredActiveId!)
            }
          }
        }

        Promise.all([
          window.api.sessions.listDatabases(id),
          window.api.sessions.currentDatabase(id)
        ])
          .then(([databases, currentDb]) => {
            if (get().openConnectionId === id) set({ databases, currentDb })
          })
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
        counting: false, filters: [], orderBy: [], edits: {}, deletes: [],
        inserts: [], colWidths: {}, committing: false, view: 'data',
        structure: null, structureLoading: false, draft: null, query: null
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      scheduleWorkspaceSave()
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
        counting: false, filters: [], orderBy: [], edits: {}, deletes: [],
        inserts: [], colWidths: {}, committing: false, view: 'data',
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

    openTable: async (entity, initialFilters) => {
      const existing = get().tabs.find(
        (t) => entityKey(t.entity) === entityKey(entity)
      )
      if (existing) {
        set({ activeTabId: existing.id })
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
        }
        return
      }
      const tab: Tab = {
        id: crypto.randomUUID(),
        entity,
        data: null,
        loading: true,
        error: null,
        pageIndex: 0,
        total: null,
        counting: false,
        filters: initialFilters ?? [],
        orderBy: [],
        edits: {},
        deletes: [],
        inserts: [],
        colWidths: {},
        committing: false,
        view: 'data',
        structure: null,
        structureLoading: false,
        draft: null,
        query: null
      }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      scheduleWorkspaceSave()
      await fetchTab(tab.id)
    },

    openNewTable: () => {
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
        orderBy: [],
        edits: {},
        deletes: [],
        inserts: [],
        colWidths: {},
        committing: false,
        view: 'structure',
        structure: null,
        structureLoading: false,
        draft: {
          name: '',
          columns: [{ name: 'id', type: '', nullable: false, pk: true }]
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
        orderBy: [],
        edits: {},
        deletes: [],
        inserts: [],
        colWidths: {},
        committing: false,
        view: 'data',
        structure: null,
        structureLoading: false,
        draft: null,
        query: { sql: '', results: [], running: false, autoLimit: 500 }
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
      patchTab(tab.id, { query: { ...tab.query, running: true } })
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
          tab.filters
        )
        patchTab(tab.id, { total, counting: false })
      } catch (err) {
        patchTab(tab.id, {
          counting: false,
          error: err instanceof Error ? err.message : String(err)
        })
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
      if (view === 'structure' && !tab.structure && openConnectionId) {
        patchTab(activeTabId, { structureLoading: true })
        try {
          const structure = await window.api.sessions.describeTable(
            openConnectionId,
            tab.entity
          )
          patchTab(activeTabId, { structure, structureLoading: false })
        } catch (err) {
          patchTab(activeTabId, {
            structureLoading: false,
            error: err instanceof Error ? err.message : String(err)
          })
        }
      }
    },

    refreshStructure: async () => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!activeTabId || !tab || !openConnectionId) return
      patchTab(activeTabId, { structureLoading: true })
      try {
        const structure = await window.api.sessions.describeTable(
          openConnectionId,
          tab.entity
        )
        patchTab(activeTabId, { structure, structureLoading: false })
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
    }
  }
})
