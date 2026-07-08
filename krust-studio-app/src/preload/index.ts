import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  KrustApi,
  SaveConnectionInput,
  TestConnectionInput,
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
  ChangesetKind,
  WorkspaceData,
  BackupSpec,
  TableTemplate,
  ReadValueOpts,
  RedisCommitBatch,
  RoutineRef,
  RoutineArg,
  McpGrant,
  SchemaSyncProposal
} from '../shared/types'

const api: KrustApi = {
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    save: (input: SaveConnectionInput) =>
      ipcRenderer.invoke('connections:save', input),
    remove: (id: string) => ipcRenderer.invoke('connections:remove', id),
    test: (input: TestConnectionInput) =>
      ipcRenderer.invoke('connections:test', input),
    reveal: (id: string) => ipcRenderer.invoke('connections:reveal', id),
    duplicate: (id: string) => ipcRenderer.invoke('connections:duplicate', id)
  },
  sessions: {
    connect: (id: string) => ipcRenderer.invoke('session:connect', id),
    listEntities: (id: string) => ipcRenderer.invoke('session:listEntities', id),
    listDatabases: (id: string) => ipcRenderer.invoke('session:listDatabases', id),
    currentDatabase: (id: string) => ipcRenderer.invoke('session:currentDatabase', id),
    useDatabase: (id: string, name: string) =>
      ipcRenderer.invoke('session:useDatabase', id, name),
    listEnums: (id: string) => ipcRenderer.invoke('session:listEnums', id),
    describeTable: (id: string, entity: EntityRef) =>
      ipcRenderer.invoke('session:describeTable', id, entity),
    listReferencingTables: (id: string, entity: EntityRef) =>
      ipcRenderer.invoke('session:listReferencingTables', id, entity),
    getCreateSql: (id: string, entity: EntityRef) =>
      ipcRenderer.invoke('session:getCreateSql', id, entity),
    createTable: (id: string, spec: CreateTableSpec) =>
      ipcRenderer.invoke('session:createTable', id, spec),
    alterTable: (id: string, entity: EntityRef, ops: SchemaOp[]) =>
      ipcRenderer.invoke('session:alterTable', id, entity, ops),
    previewAlter: (id: string, entity: EntityRef, ops: SchemaOp[]) =>
      ipcRenderer.invoke('session:previewAlter', id, entity, ops),
    dropEntity: (id: string, entity: EntityRef, type: EntityType) =>
      ipcRenderer.invoke('session:dropEntity', id, entity, type),
    renameTable: (id: string, entity: EntityRef, newName: string, dryRun?: boolean) =>
      ipcRenderer.invoke('session:renameTable', id, entity, newName, dryRun),
    truncateTable: (id: string, entity: EntityRef) =>
      ipcRenderer.invoke('session:truncateTable', id, entity),
    createIndex: (id: string, entity: EntityRef, spec: IndexSpec) =>
      ipcRenderer.invoke('session:createIndex', id, entity, spec),
    dropIndex: (id: string, entity: EntityRef, name: string) =>
      ipcRenderer.invoke('session:dropIndex', id, entity, name),
    readRows: (
      id: string,
      entity: EntityRef,
      limit: number,
      offset: number,
      filters?: Filter[],
      orderBy?: Sort[],
      rawWhere?: string
    ) =>
      ipcRenderer.invoke(
        'session:readRows',
        id,
        entity,
        limit,
        offset,
        filters,
        orderBy,
        rawWhere
      ),
    countRows: (id: string, entity: EntityRef, filters?: Filter[], rawWhere?: string) =>
      ipcRenderer.invoke('session:countRows', id, entity, filters, rawWhere),
    exportAllRows: (
      id: string,
      entity: EntityRef,
      filters?: Filter[],
      orderBy?: Sort[],
      rawWhere?: string
    ) => ipcRenderer.invoke('session:exportAllRows', id, entity, filters, orderBy, rawWhere),
    searchRows: (
      id: string,
      entity: EntityRef,
      term: string,
      limit: number,
      offset: number
    ) => ipcRenderer.invoke('session:searchRows', id, entity, term, limit, offset),
    applyChanges: (id: string, entity: EntityRef, changes: ChangeSet) =>
      ipcRenderer.invoke('session:applyChanges', id, entity, changes),
    disconnect: (id: string) => ipcRenderer.invoke('session:disconnect', id),
    reconnect: (id: string) => ipcRenderer.invoke('session:reconnect', id),
    runScript: (id: string, sql: string, autoLimit?: number) =>
      ipcRenderer.invoke('session:runScript', id, sql, autoLimit),
    cancelQuery: (id: string) => ipcRenderer.invoke('session:cancelQuery', id),
    explainQuery: (id: string, sql: string, analyze: boolean) =>
      ipcRenderer.invoke('session:explainQuery', id, sql, analyze)
  },
  redis: {
    dbInfo: (id: string) => ipcRenderer.invoke('redis:dbInfo', id),
    selectDb: (id: string, index: number) =>
      ipcRenderer.invoke('redis:selectDb', id, index),
    scan: (id: string, match: string, cursor: string, count: number) =>
      ipcRenderer.invoke('redis:scan', id, match, cursor, count),
    keyMeta: (id: string, key: string, keyB64?: string) =>
      ipcRenderer.invoke('redis:keyMeta', id, key, keyB64),
    readValue: (id: string, key: string, opts: ReadValueOpts, keyB64?: string) =>
      ipcRenderer.invoke('redis:readValue', id, key, opts, keyB64),
    keyTtls: (id: string, keysB64: string[]) =>
      ipcRenderer.invoke('redis:keyTtls', id, keysB64),
    commit: (id: string, batch: RedisCommitBatch) =>
      ipcRenderer.invoke('redis:commit', id, batch),
    renameKey: (id: string, from: string, to: string, overwrite: boolean) =>
      ipcRenderer.invoke('redis:renameKey', id, from, to, overwrite),
    deleteKey: (id: string, key: string, keyB64?: string) =>
      ipcRenderer.invoke('redis:deleteKey', id, key, keyB64)
  },
  routines: {
    list: (id: string) => ipcRenderer.invoke('routine:list', id),
    get: (id: string, ref: RoutineRef) => ipcRenderer.invoke('routine:get', id, ref),
    previewCall: (id: string, ref: RoutineRef, args: RoutineArg[]) =>
      ipcRenderer.invoke('routine:previewCall', id, ref, args),
    execute: (id: string, ref: RoutineRef, args: RoutineArg[]) =>
      ipcRenderer.invoke('routine:execute', id, ref, args),
    create: (id: string, definition: string) =>
      ipcRenderer.invoke('routine:create', id, definition),
    drop: (id: string, ref: RoutineRef) => ipcRenderer.invoke('routine:drop', id, ref)
  },
  mcp: {
    status: () => ipcRenderer.invoke('mcp:status'),
    getConfig: () => ipcRenderer.invoke('mcp:getConfig'),
    setEnabled: (on: boolean) => ipcRenderer.invoke('mcp:setEnabled', on),
    setPort: (port: number) => ipcRenderer.invoke('mcp:setPort', port),
    regenerateToken: () => ipcRenderer.invoke('mcp:regenerateToken'),
    setNotifyOnProposal: (on: boolean) => ipcRenderer.invoke('mcp:setNotifyOnProposal', on),
    getGrant: (connectionId: string) => ipcRenderer.invoke('mcp:getGrant', connectionId),
    setGrant: (connectionId: string, grant: McpGrant) =>
      ipcRenderer.invoke('mcp:setGrant', connectionId, grant),
    audit: (limit?: number) => ipcRenderer.invoke('mcp:audit', limit),
    bridgePath: () => ipcRenderer.invoke('mcp:bridgePath')
  },
  schemaSync: {
    list: () => ipcRenderer.invoke('schemaSync:list'),
    commit: (id: string, opts: { changesetName?: string; excludeKeys?: string[] }) =>
      ipcRenderer.invoke('schemaSync:commit', id, opts),
    exportSql: (id: string) => ipcRenderer.invoke('schemaSync:export', id),
    dismiss: (id: string) => ipcRenderer.invoke('schemaSync:dismiss', id),
    onProposal: (cb: (p: SchemaSyncProposal) => void) => {
      const handler = (_: unknown, p: SchemaSyncProposal): void => cb(p)
      ipcRenderer.on('mcp:proposal', handler)
      return () => ipcRenderer.removeListener('mcp:proposal', handler)
    }
  },
  workspace: {
    load: () => ipcRenderer.invoke('workspace:load'),
    save: (data: WorkspaceData) => ipcRenderer.invoke('workspace:save', data)
  },
  backup: {
    run: (id: string, spec: BackupSpec) =>
      ipcRenderer.invoke('backup:run', id, spec),
    restorePreview: () => ipcRenderer.invoke('backup:restorePreview'),
    restoreRun: (id: string, path: string, stopOnError: boolean) =>
      ipcRenderer.invoke('backup:restoreRun', id, path, stopOnError)
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    save: (template: TableTemplate) => ipcRenderer.invoke('templates:save', template),
    remove: (id: string) => ipcRenderer.invoke('templates:remove', id)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    getVersion: () => ipcRenderer.invoke('window:getVersion'),
    onMaximizedChange: (cb: (maximized: boolean) => void) => {
      const handler = (_: unknown, v: boolean): void => cb(v)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)
    }
  },
  dialog: {
    saveText: (defaultName: string, content: string) =>
      ipcRenderer.invoke('dialog:saveText', defaultName, content),
    openText: () => ipcRenderer.invoke('dialog:openText')
  },
  history: {
    list: (query: HistoryQuery) => ipcRenderer.invoke('history:list', query),
    clear: (connectionId: string, stream: HistoryStream) =>
      ipcRenderer.invoke('history:clear', connectionId, stream),
    listChangesets: (connectionId: string) =>
      ipcRenderer.invoke('history:listChangesets', connectionId),
    createChangeset: (
      connectionId: string,
      name: string,
      ticket?: string,
      kind?: ChangesetKind
    ) => ipcRenderer.invoke('history:createChangeset', connectionId, name, ticket, kind),
    renameChangeset: (id: number, name: string, ticket?: string) =>
      ipcRenderer.invoke('history:renameChangeset', id, name, ticket),
    deleteChangeset: (id: number) =>
      ipcRenderer.invoke('history:deleteChangeset', id),
    setActiveChangeset: (connectionId: string, changesetId: number | null) =>
      ipcRenderer.invoke('history:setActiveChangeset', connectionId, changesetId),
    assignEntries: (entryIds: number[], changesetId: number | null) =>
      ipcRenderer.invoke('history:assignEntries', entryIds, changesetId),
    exportChangeset: (id: number) =>
      ipcRenderer.invoke('history:exportChangeset', id),
    exportChangesetsTogether: (ids: number[]) =>
      ipcRenderer.invoke('history:exportChangesetsTogether', ids),
    deleteEntries: (ids: number[]) =>
      ipcRenderer.invoke('history:deleteEntries', ids),
    getAutoAttachDestructive: () =>
      ipcRenderer.invoke('history:getAutoAttachDestructive'),
    setAutoAttachDestructive: (on: boolean) =>
      ipcRenderer.invoke('history:setAutoAttachDestructive', on)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
