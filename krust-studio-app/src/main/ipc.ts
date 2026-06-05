import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import {
  listConnections,
  saveConnection,
  removeConnection,
  getStoredPassword,
  duplicateConnection,
  getConnectionConfig
} from './store/connections'
import { loadWorkspace, saveWorkspace } from './store/workspace'
import { runBackup, restorePreview, restoreRun } from './db/backup'
import { testConnection } from './db/test-connection'
import {
  connectSession,
  listEntities,
  listDatabases,
  currentDatabase,
  useDatabase,
  listEnums,
  describeTable,
  listReferencingTables,
  getCreateSql,
  createTable,
  alterTable,
  previewAlter,
  readRows,
  countRows,
  searchRows,
  exportAllRows,
  applyChanges,
  dropEntity,
  renameTable,
  truncateTable,
  createIndex,
  dropIndex,
  runScript,
  cancelQuery,
  disconnectSession,
  reconnectSession
} from './db/session'
import {
  listHistory,
  clearHistory,
  listChangesets,
  createChangeset,
  renameChangeset,
  deleteChangeset,
  setActiveChangeset,
  assignEntries,
  buildChangesetSql,
  markExported
} from './store/history'
import type {
  EntityRef,
  EntityType,
  Filter,
  ChangeSet,
  Sort,
  CreateTableSpec,
  SchemaOp,
  IndexSpec,
  HistoryQuery,
  HistoryStream,
  WorkspaceData,
  BackupSpec
} from '../shared/types'
import type {
  SaveConnectionInput,
  TestConnectionInput
} from '../shared/types'

export function registerIpc(): void {
  // ── window controls (custom title bar) ──────────────────────────────────
  ipcMain.on('window:minimize', (e) =>
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  )
  ipcMain.on('window:toggleMaximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('window:close', (e) =>
    BrowserWindow.fromWebContents(e.sender)?.close()
  )
  ipcMain.handle(
    'window:isMaximized',
    (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  )

  ipcMain.handle('connections:list', () => listConnections())

  ipcMain.handle('connections:save', (_e, input: SaveConnectionInput) =>
    saveConnection(input)
  )

  ipcMain.handle('connections:remove', (_e, id: string) =>
    removeConnection(id)
  )

  ipcMain.handle('connections:test', (_e, input: TestConnectionInput) => {
    const password =
      input.password ??
      (input.config.id ? getStoredPassword(input.config.id) : undefined)
    return testConnection(input.config, password)
  })

  ipcMain.handle('connections:reveal', (_e, id: string) =>
    getStoredPassword(id) ?? ''
  )

  ipcMain.handle('connections:duplicate', (_e, id: string) =>
    duplicateConnection(id)
  )

  ipcMain.handle('session:connect', (_e, id: string) => connectSession(id))
  ipcMain.handle('session:listEntities', (_e, id: string) => listEntities(id))
  ipcMain.handle('session:listDatabases', (_e, id: string) => listDatabases(id))
  ipcMain.handle('session:currentDatabase', (_e, id: string) => currentDatabase(id))
  ipcMain.handle('session:useDatabase', (_e, id: string, name: string) =>
    useDatabase(id, name)
  )
  ipcMain.handle('session:listEnums', (_e, id: string) => listEnums(id))
  ipcMain.handle('session:describeTable', (_e, id: string, entity: EntityRef) =>
    describeTable(id, entity)
  )
  ipcMain.handle(
    'session:listReferencingTables',
    (_e, id: string, entity: EntityRef) => listReferencingTables(id, entity)
  )
  ipcMain.handle('session:getCreateSql', (_e, id: string, entity: EntityRef) =>
    getCreateSql(id, entity)
  )
  ipcMain.handle('session:createTable', (_e, id: string, spec: CreateTableSpec) =>
    createTable(id, spec)
  )
  ipcMain.handle(
    'session:alterTable',
    (_e, id: string, entity: EntityRef, ops: SchemaOp[]) =>
      alterTable(id, entity, ops)
  )
  ipcMain.handle(
    'session:previewAlter',
    (_e, id: string, entity: EntityRef, ops: SchemaOp[]) =>
      previewAlter(id, entity, ops)
  )
  ipcMain.handle(
    'session:readRows',
    (
      _e,
      id: string,
      entity: EntityRef,
      limit: number,
      offset: number,
      filters?: Filter[],
      orderBy?: Sort[]
    ) => readRows(id, entity, limit, offset, filters, orderBy)
  )
  ipcMain.handle(
    'session:countRows',
    (_e, id: string, entity: EntityRef, filters?: Filter[]) =>
      countRows(id, entity, filters)
  )
  ipcMain.handle(
    'session:searchRows',
    (
      _e,
      id: string,
      entity: EntityRef,
      term: string,
      limit: number,
      offset: number
    ) => searchRows(id, entity, term, limit, offset)
  )
  ipcMain.handle(
    'session:exportAllRows',
    (_e, id: string, entity: EntityRef, filters?: Filter[], orderBy?: Sort[]) =>
      exportAllRows(id, entity, filters, orderBy)
  )
  ipcMain.handle(
    'dialog:saveText',
    async (
      e,
      defaultName: string,
      content: string
    ): Promise<{ saved: boolean; path?: string }> => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const ext = defaultName.split('.').pop() ?? 'txt'
      const res = await dialog.showSaveDialog(win!, {
        defaultPath: defaultName,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      })
      if (res.canceled || !res.filePath) return { saved: false }
      writeFileSync(res.filePath, content, 'utf-8')
      return { saved: true, path: res.filePath }
    }
  )
  ipcMain.handle(
    'session:applyChanges',
    (_e, id: string, entity: EntityRef, changes: ChangeSet) =>
      applyChanges(id, entity, changes)
  )
  ipcMain.handle(
    'session:dropEntity',
    (_e, id: string, entity: EntityRef, type: EntityType) =>
      dropEntity(id, entity, type)
  )
  ipcMain.handle(
    'session:renameTable',
    (_e, id: string, entity: EntityRef, newName: string) =>
      renameTable(id, entity, newName)
  )
  ipcMain.handle(
    'session:truncateTable',
    (_e, id: string, entity: EntityRef) => truncateTable(id, entity)
  )
  ipcMain.handle(
    'session:createIndex',
    (_e, id: string, entity: EntityRef, spec: IndexSpec) =>
      createIndex(id, entity, spec)
  )
  ipcMain.handle(
    'session:dropIndex',
    (_e, id: string, entity: EntityRef, name: string) =>
      dropIndex(id, entity, name)
  )
  ipcMain.handle(
    'session:runScript',
    (_e, id: string, sql: string, autoLimit?: number) =>
      runScript(id, sql, autoLimit)
  )
  ipcMain.handle('session:cancelQuery', (_e, id: string) => cancelQuery(id))
  ipcMain.handle('session:disconnect', (_e, id: string) =>
    disconnectSession(id)
  )
  ipcMain.handle('session:reconnect', (_e, id: string) => reconnectSession(id))

  ipcMain.handle('workspace:load', () => loadWorkspace())
  ipcMain.handle('workspace:save', (_e, data: WorkspaceData) => saveWorkspace(data))

  ipcMain.handle(
    'backup:run',
    async (e, id: string, spec: BackupSpec) => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const safeName =
        (getConnectionConfig(id)?.name ?? 'backup').replace(/[^\w.-]+/g, '_').slice(0, 60) ||
        'backup'
      const res = await dialog.showSaveDialog(win!, {
        title: 'Save backup',
        defaultPath: `${safeName}.sql`,
        filters: [{ name: 'SQL', extensions: ['sql'] }]
      })
      if (res.canceled || !res.filePath)
        return { saved: false, tablesWritten: 0, rowsWritten: 0 }
      return runBackup(id, spec, res.filePath, (p) =>
        e.sender.send('backup:progress', p)
      )
    }
  )
  ipcMain.handle('backup:restorePreview', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose a backup to restore',
      properties: ['openFile'],
      filters: [{ name: 'SQL', extensions: ['sql'] }]
    })
    if (res.canceled || !res.filePaths[0]) return { canceled: true }
    const path = res.filePaths[0]
    const preview = await restorePreview(path)
    return { canceled: false, path, preview }
  })
  ipcMain.handle(
    'backup:restoreRun',
    (_e, id: string, path: string, stopOnError: boolean) =>
      restoreRun(id, path, stopOnError)
  )

  ipcMain.handle('history:list', (_e, query: HistoryQuery) => listHistory(query))
  ipcMain.handle(
    'history:clear',
    (_e, connectionId: string, stream: HistoryStream) =>
      clearHistory(connectionId, stream)
  )

  ipcMain.handle('history:listChangesets', (_e, connectionId: string) =>
    listChangesets(connectionId)
  )
  ipcMain.handle(
    'history:createChangeset',
    (_e, connectionId: string, name: string, ticket?: string) =>
      createChangeset(connectionId, name, ticket)
  )
  ipcMain.handle(
    'history:renameChangeset',
    (_e, id: number, name: string, ticket?: string) =>
      renameChangeset(id, name, ticket)
  )
  ipcMain.handle('history:deleteChangeset', (_e, id: number) =>
    deleteChangeset(id)
  )
  ipcMain.handle(
    'history:setActiveChangeset',
    (_e, connectionId: string, changesetId: number | null) =>
      setActiveChangeset(connectionId, changesetId)
  )
  ipcMain.handle(
    'history:assignEntries',
    (_e, entryIds: number[], changesetId: number | null) =>
      assignEntries(entryIds, changesetId)
  )
  ipcMain.handle(
    'history:exportChangeset',
    async (e, id: number): Promise<{ saved: boolean; path?: string }> => {
      const built = await buildChangesetSql(id)
      if (!built) return { saved: false }
      const safe = built.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'changeset'
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export changeset',
        defaultPath: `${safe}.sql`,
        filters: [{ name: 'SQL', extensions: ['sql'] }]
      })
      if (result.canceled || !result.filePath) return { saved: false }
      writeFileSync(result.filePath, built.sql, 'utf-8')
      await markExported(id)
      return { saved: true, path: result.filePath }
    }
  )
}
