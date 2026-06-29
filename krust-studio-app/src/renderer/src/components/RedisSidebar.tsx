import React, { useEffect } from 'react'
import { Loader2, RefreshCw, History as HistoryIcon, Database } from 'lucide-react'
import { useRedis } from '@/store/redis'
import { useConnections } from '@/store/connections'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RedisKeyType } from '../../../shared/types'

/** short type badge for a key row */
const TYPE_BADGE: Record<RedisKeyType, { label: string; cls: string }> = {
  string: { label: 'str', cls: 'text-sky-400' },
  hash: { label: 'hash', cls: 'text-violet-400' },
  list: { label: 'list', cls: 'text-amber-400' },
  set: { label: 'set', cls: 'text-emerald-400' },
  zset: { label: 'zset', cls: 'text-pink-400' },
  stream: { label: 'strm', cls: 'text-orange-400' },
  none: { label: '—', cls: 'text-muted-foreground' },
  unknown: { label: '?', cls: 'text-muted-foreground' }
}

export function RedisSidebar(): React.JSX.Element {
  const openConnectionId = useConnections((s) => s.openConnectionId)
  const openRedisKey = useConnections((s) => s.openRedisKey)
  const openHistoryTab = useConnections((s) => s.openHistoryTab)
  const activeTabId = useConnections((s) => s.activeTabId)
  const tabs = useConnections((s) => s.tabs)

  const { connId, dbInfo, list, init, setMatch, rescan, scanMore, selectDb } = useRedis()

  // (re)initialise when the active Redis connection changes
  useEffect(() => {
    if (openConnectionId && openConnectionId !== connId) void init(openConnectionId)
  }, [openConnectionId, connId, init])

  const activeKey = tabs.find((t) => t.id === activeTabId)?.redisKey?.key
  const dbCount = dbInfo?.count ?? 16
  const current = dbInfo?.current ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* logical-db switcher + actions */}
      <div className="flex items-center gap-1 px-2 pt-2">
        <div className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-xs">
          <Database className="size-3.5 text-muted-foreground" />
          <select
            value={current}
            onChange={(e) => void selectDb(Number(e.target.value))}
            className="bg-transparent text-xs outline-none"
            title="Logical database"
          >
            {Array.from({ length: dbCount }, (_, i) => (
              <option key={i} value={i}>
                DB {i}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => void rescan()}
          title="Rescan keys"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          onClick={() => openHistoryTab()}
          title="Query history"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <HistoryIcon className="size-3.5" />
        </button>
      </div>

      {/* MATCH glob filter (server-side SCAN MATCH; applies on Enter) */}
      <div className="px-2 pt-1.5">
        <input
          value={list.match}
          onChange={(e) => setMatch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void rescan()
          }}
          placeholder="MATCH glob (e.g. user:*) — Enter"
          className="h-7 w-full rounded border border-border bg-transparent px-2 text-xs outline-none focus:border-ring"
        />
      </div>

      {list.error && (
        <div className="mx-2 mt-2 rounded border border-destructive/40 p-2 text-xs text-destructive">
          {list.error}
        </div>
      )}

      {/* key list (flat, paged — not a tree) */}
      <div className="mt-1 min-h-0 flex-1 overflow-auto px-1">
        {list.keys.map((k) => {
          const badge = TYPE_BADGE[k.type]
          return (
            <button
              key={k.key}
              onClick={() => openRedisKey(k.key, k.type, current)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent',
                activeKey === k.key && 'bg-accent'
              )}
              title={k.key}
            >
              <span className={cn('w-9 shrink-0 font-mono', badge.cls)}>{badge.label}</span>
              <span className="flex-1 truncate font-mono">{k.key}</span>
              {k.ttl !== null && k.ttl >= 0 && (
                <span className="shrink-0 text-[10px] text-muted-foreground">ttl</span>
              )}
            </button>
          )
        })}

        <div className="px-2 py-2 text-center">
          {list.scanning ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Scanning…
            </span>
          ) : list.done ? (
            <span className="text-[11px] text-muted-foreground">
              {list.keys.length} keys loaded
            </span>
          ) : (
            <Button size="xs" variant="ghost" onClick={() => void scanMore()}>
              Load more ({list.keys.length} loaded)
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
