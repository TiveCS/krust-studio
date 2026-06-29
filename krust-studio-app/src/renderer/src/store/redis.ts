import { create } from 'zustand'
import type {
  RedisArg,
  RedisCommand,
  RedisCommitBatch,
  RedisConflict,
  RedisDbInfo,
  RedisKeyInfo,
  RedisKeyMeta,
  RedisKeyType,
  RedisValuePage
} from '../../../shared/types'

const PAGE = 200

/** one staged edit on a key tab; buildCommands turns these into Redis commands */
export type StagedEdit =
  | { kind: 'string-set'; value: string }
  /** binary string write — exact raw bytes (base64) from a hex/base64 editor */
  | { kind: 'string-set-bin'; b64: string; bytes: number }
  | { kind: 'hash-set'; field: string; value: string }
  | { kind: 'hash-del'; field: string }
  | { kind: 'set-add'; member: string }
  | { kind: 'set-del'; member: string }
  | { kind: 'zset-set'; member: string; score: number }
  | { kind: 'zset-del'; member: string }
  | { kind: 'list-set'; index: number; value: string }
  | { kind: 'list-push'; side: 'L' | 'R'; value: string }
  | { kind: 'list-pop'; side: 'L' | 'R' }
  | { kind: 'list-removeval'; count: number; value: string }
  | { kind: 'stream-add'; fields: [string, string][] }

/** sidebar key-list state for the active connection's current logical db */
interface KeyList {
  match: string
  keys: RedisKeyInfo[]
  cursor: string
  scanning: boolean
  done: boolean
  error: string | null
}

/** per Redis-Key tab: loaded value + staged edits + commit state */
interface KeyTab {
  page: RedisValuePage | null
  /** TYPE + PTTL + size/cardinality, fetched alongside the value */
  meta: RedisKeyMeta | null
  loading: boolean
  error: string | null
  staged: StagedEdit[]
  /** undefined = TTL unchanged; null = PERSIST (remove); number = PEXPIRE ms */
  ttlChange?: number | null
  conflict: RedisConflict | null
  /** set when a commit would empty (delete) the key — awaits explicit confirm */
  emptyDelete: { cardinality: number } | null
  committing: boolean
}

interface RedisState {
  connId: string | null
  dbInfo: RedisDbInfo | null
  list: KeyList
  tabs: Record<string, KeyTab>

  init: (connId: string) => Promise<void>
  setMatch: (match: string) => void
  rescan: () => Promise<void>
  scanMore: () => Promise<void>
  selectDb: (index: number) => Promise<void>

  loadValue: (tabId: string, key: string, opts?: { cursor?: string; start?: number; force?: boolean }) => Promise<void>
  stage: (tabId: string, edit: StagedEdit) => void
  unstage: (tabId: string, index: number) => void
  clearStaged: (tabId: string) => void
  setTtlChange: (tabId: string, ms: number | null | undefined) => void
  commit: (tabId: string, key: string, type: RedisKeyType) => Promise<boolean>
  forceCommit: (tabId: string, key: string, type: RedisKeyType) => Promise<boolean>
  /** re-run the commit after the user acknowledged the empty-delete warning */
  confirmEmptyCommit: (tabId: string, key: string, type: RedisKeyType) => Promise<boolean>
  cancelEmptyDelete: (tabId: string) => void
  deleteKey: (key: string) => Promise<void>
  renameKey: (from: string, to: string, overwrite: boolean) => Promise<void>
  disposeTab: (tabId: string) => void
}

const EMPTY_LIST: KeyList = {
  match: '',
  keys: [],
  cursor: '0',
  scanning: false,
  done: false,
  error: null
}

function emptyTab(): KeyTab {
  return {
    page: null,
    meta: null,
    loading: false,
    error: null,
    staged: [],
    conflict: null,
    emptyDelete: null,
    committing: false
  }
}

export const useRedis = create<RedisState>((set, get) => ({
  connId: null,
  dbInfo: null,
  list: EMPTY_LIST,
  tabs: {},

  init: async (connId) => {
    set({ connId, list: EMPTY_LIST, dbInfo: null })
    try {
      const dbInfo = await window.api.redis.dbInfo(connId)
      set({ dbInfo })
    } catch {
      // dbInfo probe failed (ACL); leave null, manual db selection still works
    }
    await get().rescan()
  },

  setMatch: (match) => set((s) => ({ list: { ...s.list, match } })),

  rescan: async () => {
    const { connId, list } = get()
    if (!connId) return
    set({ list: { ...list, scanning: true, error: null, keys: [], cursor: '0', done: false } })
    try {
      const res = await window.api.redis.scan(connId, list.match, '0', PAGE)
      set((s) => ({
        list: {
          ...s.list,
          keys: res.keys,
          cursor: res.cursor,
          done: res.cursor === '0',
          scanning: false
        }
      }))
    } catch (err) {
      set((s) => ({ list: { ...s.list, scanning: false, error: msg(err) } }))
    }
  },

  scanMore: async () => {
    const { connId, list } = get()
    if (!connId || list.scanning || list.done) return
    set({ list: { ...list, scanning: true } })
    try {
      const res = await window.api.redis.scan(connId, list.match, list.cursor, PAGE)
      set((s) => ({
        list: {
          ...s.list,
          keys: dedupe([...s.list.keys, ...res.keys]),
          cursor: res.cursor,
          done: res.cursor === '0',
          scanning: false
        }
      }))
    } catch (err) {
      set((s) => ({ list: { ...s.list, scanning: false, error: msg(err) } }))
    }
  },

  selectDb: async (index) => {
    const { connId } = get()
    if (!connId) return
    await window.api.redis.selectDb(connId, index)
    const dbInfo = await window.api.redis.dbInfo(connId).catch(() => get().dbInfo)
    set({ dbInfo })
    await get().rescan()
  },

  loadValue: async (tabId, key, opts) => {
    const { connId } = get()
    if (!connId) return
    patchTab(set, tabId, { loading: true, error: null })
    try {
      const page = await window.api.redis.readValue(connId, key, {
        cursor: opts?.cursor,
        start: opts?.start,
        count: PAGE,
        forceLoadLarge: opts?.force
      })
      // refresh meta (TTL + cardinality) on a full (re)load, not on paging
      const isPaging = opts?.cursor !== undefined || opts?.start !== undefined
      const meta = isPaging
        ? get().tabs[tabId]?.meta ?? null
        : await window.api.redis.keyMeta(connId, key).catch(() => null)
      patchTab(set, tabId, { page, meta, loading: false })
    } catch (err) {
      patchTab(set, tabId, { loading: false, error: msg(err) })
    }
  },

  stage: (tabId, edit) =>
    set((s) => {
      const t = s.tabs[tabId] ?? emptyTab()
      return { tabs: { ...s.tabs, [tabId]: { ...t, staged: [...t.staged, edit], conflict: null } } }
    }),

  unstage: (tabId, index) =>
    set((s) => {
      const t = s.tabs[tabId] ?? emptyTab()
      return {
        tabs: { ...s.tabs, [tabId]: { ...t, staged: t.staged.filter((_, i) => i !== index) } }
      }
    }),

  clearStaged: (tabId) =>
    set((s) => {
      const t = s.tabs[tabId] ?? emptyTab()
      return { tabs: { ...s.tabs, [tabId]: { ...t, staged: [], ttlChange: undefined, conflict: null } } }
    }),

  setTtlChange: (tabId, ms) =>
    set((s) => {
      const t = s.tabs[tabId] ?? emptyTab()
      return { tabs: { ...s.tabs, [tabId]: { ...t, ttlChange: ms } } }
    }),

  commit: (tabId, key, type) => doCommit(get, set, tabId, key, type, { force: false }),
  forceCommit: (tabId, key, type) => doCommit(get, set, tabId, key, type, { force: true }),
  confirmEmptyCommit: (tabId, key, type) =>
    doCommit(get, set, tabId, key, type, { force: false, confirmEmptyDelete: true }),
  cancelEmptyDelete: (tabId) => patchTab(set, tabId, { emptyDelete: null }),

  deleteKey: async (key) => {
    const { connId } = get()
    if (!connId) return
    await window.api.redis.deleteKey(connId, key)
    await get().rescan()
  },

  renameKey: async (from, to, overwrite) => {
    const { connId } = get()
    if (!connId) return
    await window.api.redis.renameKey(connId, from, to, overwrite)
    await get().rescan()
  },

  disposeTab: (tabId) =>
    set((s) => {
      const next = { ...s.tabs }
      delete next[tabId]
      return { tabs: next }
    })
}))

async function doCommit(
  get: () => RedisState,
  set: (fn: (s: RedisState) => Partial<RedisState>) => void,
  tabId: string,
  key: string,
  type: RedisKeyType,
  opts: { force: boolean; confirmEmptyDelete?: boolean }
): Promise<boolean> {
  const { connId, tabs } = get()
  const t = tabs[tabId]
  if (!connId || !t) return false
  const commands = buildCommands(key, t.staged, t.ttlChange)
  if (commands.length === 0) return true
  patchTab(set, tabId, { committing: true, conflict: null, emptyDelete: null })
  const batch: RedisCommitBatch = {
    dbIndex: get().dbInfo?.current ?? 0,
    key,
    expectedType: type,
    commands,
    force: opts.force,
    confirmEmptyDelete: opts.confirmEmptyDelete
  }
  try {
    const res = await window.api.redis.commit(connId, batch)
    if (res.ok) {
      patchTab(set, tabId, { committing: false, staged: [], ttlChange: undefined, conflict: null })
      return true
    }
    if ('emptyDelete' in res) {
      patchTab(set, tabId, { committing: false, emptyDelete: { cardinality: res.cardinality } })
      return false
    }
    patchTab(set, tabId, { committing: false, conflict: res.conflict })
    return false
  } catch (err) {
    patchTab(set, tabId, { committing: false, error: msg(err) })
    return false
  }
}

/** turn staged edits + a TTL change into the ordered Redis commands (decisions
 *  14/15/16): value/member edits then the expiry change, all in one MULTI. */
export function buildCommands(
  key: string,
  staged: StagedEdit[],
  ttlChange: number | null | undefined
): RedisCommand[] {
  const cmds: RedisCommand[] = []
  for (const e of staged) {
    switch (e.kind) {
      case 'string-set':
        cmds.push(cmd(['SET', key, e.value, 'KEEPTTL'], `SET ${key}`, false))
        break
      case 'string-set-bin':
        cmds.push(
          cmd(['SET', key, { b64: e.b64 }, 'KEEPTTL'], `SET ${key} <binary ${e.bytes}B>`, false)
        )
        break
      case 'hash-set':
        cmds.push(cmd(['HSET', key, e.field, e.value], `HSET ${key} ${e.field}`, false))
        break
      case 'hash-del':
        cmds.push(cmd(['HDEL', key, e.field], `HDEL ${key} ${e.field}`, true))
        break
      case 'set-add':
        cmds.push(cmd(['SADD', key, e.member], `SADD ${key}`, false))
        break
      case 'set-del':
        cmds.push(cmd(['SREM', key, e.member], `SREM ${key}`, true))
        break
      case 'zset-set':
        cmds.push(cmd(['ZADD', key, String(e.score), e.member], `ZADD ${key} ${e.member}`, false))
        break
      case 'zset-del':
        cmds.push(cmd(['ZREM', key, e.member], `ZREM ${key} ${e.member}`, true))
        break
      case 'list-set':
        cmds.push(cmd(['LSET', key, String(e.index), e.value], `LSET ${key} ${e.index}`, false))
        break
      case 'list-push':
        cmds.push(
          cmd(
            [e.side === 'L' ? 'LPUSH' : 'RPUSH', key, e.value],
            `${e.side === 'L' ? 'LPUSH' : 'RPUSH'} ${key}`,
            false
          )
        )
        break
      case 'list-pop':
        cmds.push(
          cmd([e.side === 'L' ? 'LPOP' : 'RPOP', key], `${e.side === 'L' ? 'LPOP' : 'RPOP'} ${key}`, true)
        )
        break
      case 'list-removeval':
        cmds.push(cmd(['LREM', key, String(e.count), e.value], `LREM ${key}`, true))
        break
      case 'stream-add':
        cmds.push(
          cmd(['XADD', key, '*', ...e.fields.flat()], `XADD ${key}`, false)
        )
        break
    }
  }
  if (ttlChange === null) cmds.push(cmd(['PERSIST', key], `PERSIST ${key}`, false))
  else if (typeof ttlChange === 'number') {
    const destructive = ttlChange <= 0 // expiry in the past = delete
    cmds.push(cmd(['PEXPIRE', key, String(ttlChange)], `PEXPIRE ${key} ${ttlChange}`, destructive))
  }
  return cmds
}

function cmd(args: RedisArg[], label: string, destructive: boolean): RedisCommand {
  return { args, label, destructive }
}

function patchTab(
  set: (fn: (s: RedisState) => Partial<RedisState>) => void,
  tabId: string,
  partial: Partial<KeyTab>
): void {
  set((s) => {
    const t = s.tabs[tabId] ?? emptyTab()
    return { tabs: { ...s.tabs, [tabId]: { ...t, ...partial } } }
  })
}

function dedupe(keys: RedisKeyInfo[]): RedisKeyInfo[] {
  const seen = new Set<string>()
  return keys.filter((k) => (seen.has(k.key) ? false : (seen.add(k.key), true)))
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
