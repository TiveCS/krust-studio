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

type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface Tab {
  id: string
  entity: EntityRef
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
  selectedId: string | null
  loading: boolean
  creatingNew: boolean
  load: () => Promise<void>
  select: (id: string | null) => void
  startNew: () => void
  save: (input: SaveConnectionInput) => Promise<ConnectionSummary>
  remove: (id: string) => Promise<void>
  duplicate: (id: string) => Promise<ConnectionSummary>

  // live session / schema
  openConnectionId: string | null
  sessionStatus: SessionStatus
  sessionError: string | null
  entities: EntityInfo[]
  enums: EnumType[]
  open: (id: string) => Promise<void>
  refreshEntities: () => Promise<void>
  createTable: (spec: CreateTableSpec) => Promise<string>
  dropEntity: (entity: EntityRef, type: EntityType) => Promise<string[]>
  renameTable: (entity: EntityRef, newName: string) => Promise<string[]>
  truncateTable: (entity: EntityRef) => Promise<string[]>
  closeSession: () => Promise<void>

  // which full-area screen is showing
  screen: 'tables' | 'history'
  setScreen: (screen: 'tables' | 'history') => void

  // open table tabs
  tabs: Tab[]
  activeTabId: string | null
  pageSize: number
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

  return {
    connections: [],
    selectedId: null,
    loading: false,
    creatingNew: false,

    load: async () => {
      set({ loading: true })
      const connections = await window.api.connections.list()
      set({ loading: false, connections })
    },

    select: (id) => set({ selectedId: id, creatingNew: false }),

    startNew: () => set({ selectedId: null, creatingNew: true }),

    save: async (input) => {
      const saved = await window.api.connections.save(input)
      await get().load()
      set({ selectedId: saved.id, creatingNew: false })
      return saved
    },

    remove: async (id) => {
      await window.api.connections.remove(id)
      await get().load()
      if (get().selectedId === id) set({ selectedId: null })
    },

    duplicate: async (id) => {
      const copy = await window.api.connections.duplicate(id)
      await get().load()
      set({ selectedId: copy.id, creatingNew: false })
      return copy
    },

    openConnectionId: null,
    sessionStatus: 'idle',
    sessionError: null,
    entities: [],
    enums: [],

    open: async (id) => {
      set({
        openConnectionId: id,
        selectedId: null,
        creatingNew: false,
        sessionStatus: 'connecting',
        sessionError: null,
        entities: [],
        enums: [],
        tabs: [],
        activeTabId: null
      })
      try {
        await window.api.sessions.connect(id)
        const entities = await window.api.sessions.listEntities(id)
        const enums = await window.api.sessions.listEnums(id)
        set({ sessionStatus: 'connected', entities, enums })
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

    screen: 'tables',
    setScreen: (screen) => set({ screen }),

    tabs: [],
    activeTabId: null,
    pageSize: PAGE_SIZE,

    openTable: async (entity, initialFilters) => {
      const existing = get().tabs.find(
        (t) => entityKey(t.entity) === entityKey(entity)
      )
      if (existing) {
        set({ activeTabId: existing.id, screen: 'tables' })
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
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, screen: 'tables' }))
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
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, screen: 'tables' }))
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
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, screen: 'tables' }))
    },

    setQuerySql: (sql) => {
      const { activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (tab?.query) patchTab(tab.id, { query: { ...tab.query, sql } })
    },
    setQueryAutoLimit: (n) => {
      const { activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (tab?.query) patchTab(tab.id, { query: { ...tab.query, autoLimit: n } })
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
    },

    setActiveTab: (tabId) => set({ activeTabId: tabId }),

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
      await fetchTab(id)
    },

    setTabView: async (view) => {
      const { openConnectionId, activeTabId, tabs } = get()
      const tab = tabs.find((t) => t.id === activeTabId)
      if (!activeTabId || !tab) return
      patchTab(activeTabId, { view })
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
