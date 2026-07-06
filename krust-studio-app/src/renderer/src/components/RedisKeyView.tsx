import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Trash2, Pencil, Plus, Clock, AlertTriangle } from 'lucide-react'
import { useRedis, buildCommands, type StagedEdit } from '@/store/redis'
import { useConnections, type Tab } from '@/store/connections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { JsonTree } from '@/components/JsonTree'
import type { RedisArg } from '../../../shared/types'

/** render a command argv for the preview (binary args shown as a byte count) */
function argText(a: RedisArg): string {
  return typeof a === 'string' ? a : `<binary ${Math.floor((a.b64.length * 3) / 4)}B>`
}

/** format remaining ms TTL for display (-1 = no expiry, -2 = key gone) */
function formatTtl(ms: number): string {
  if (ms === -1) return 'no expiry'
  if (ms === -2) return 'expired'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d`
}

/**
 * Redis Key tab (ADR-0020). Reuses the Staged Edits language: collections render
 * as a member grid; string in a value pane; stream append-only. Value/member +
 * expiry edits stage into one WATCH+MULTI/EXEC commit; rename/delete are separate
 * guarded actions.
 */
export function RedisKeyView(): React.JSX.Element {
  const activeTabId = useConnections((s) => s.activeTabId)
  const tabs = useConnections((s) => s.tabs)
  const closeTab = useConnections((s) => s.closeTab)
  const tab = tabs.find((t) => t.id === activeTabId)

  const redis = useRedis()
  const tabId = tab?.id ?? ''
  const ident = tab?.redisKey
  const tabState = redis.tabs[tabId]

  const kb = ident?.keyB64

  useEffect(() => {
    // also re-run when connId becomes available (restored tab mounts before the
    // sidebar's init sets the redis connection)
    if (ident && tabId && redis.connId) void redis.loadValue(tabId, ident.key, { keyB64: kb })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, ident?.key, redis.connId])

  // auto-reload exactly when the key's TTL elapses, so an expired key reflects
  // without a manual refresh (the reload surfaces the now-missing value)
  const ttlMs = tabState?.meta?.ttl
  useEffect(() => {
    if (!ident || !tabId || ttlMs === undefined || ttlMs < 0) return
    const id = setTimeout(() => void redis.loadValue(tabId, ident.key, { keyB64: kb }), ttlMs + 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, ident?.key, ttlMs])

  if (!tab || !ident) {
    return <div className="p-6 text-sm text-muted-foreground">No key selected.</div>
  }

  // a binary key NAME can only be addressed by its raw bytes — read + delete
  // only (no edit/rename/TTL/commit, since staging addresses by the UTF-8 name)
  const binaryKey = !!ident.binary
  const page = tabState?.page ?? null
  const staged = tabState?.staged ?? []
  const commands = buildCommands(ident.key, staged, tabState?.ttlChange)
  const emptyDelete = tabState?.emptyDelete ?? null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        tab={tab}
        ttl={tabState?.meta?.ttl ?? null}
        binaryKey={binaryKey}
        onReload={() => void redis.loadValue(tabId, ident.key, { force: true, keyB64: kb })}
        onClose={() => closeTab(tabId)}
      />

      {emptyDelete && (
        <div className="m-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertTriangle className="size-3.5" /> This empties the collection — Redis will
            delete the key <span className="font-mono">{ident.key}</span> ({emptyDelete.cardinality}{' '}
            {emptyDelete.cardinality === 1 ? 'member' : 'members'} removed).
          </p>
          <div className="mt-1 flex gap-2">
            <Button size="xs" variant="ghost" onClick={() => redis.cancelEmptyDelete(tabId)}>
              Cancel
            </Button>
            <Button
              size="xs"
              variant="destructive"
              onClick={async () => {
                const ok = await redis.confirmEmptyCommit(tabId, ident.key, ident.type)
                if (ok) {
                  toast.success('Committed — key deleted')
                  closeTab(tabId)
                }
              }}
            >
              Delete key
            </Button>
          </div>
        </div>
      )}

      {tabState?.conflict && (
        <div className="m-2 rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
          <p className="font-medium text-amber-400">
            Key changed under you ({tabState.conflict.kind.replace('-', ' ')}).
          </p>
          <div className="mt-1 flex gap-2">
            <Button size="xs" variant="secondary" onClick={() => void redis.loadValue(tabId, ident.key, { keyB64: kb })}>
              Reload
            </Button>
            {tabState.conflict.forceAllowed && (
              <ForceButton onForce={() => redis.forceCommit(tabId, ident.key, ident.type)} keyName={ident.key} />
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tabState?.loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : tabState?.error ? (
          <div className="rounded border border-destructive/40 p-2 text-xs text-destructive">{tabState.error}</div>
        ) : page ? (
          <ValueBody
            tabId={tabId}
            keyName={ident.key}
            page={page}
            readonly={binaryKey}
            stage={(e) => redis.stage(tabId, e)}
            loadMore={(o) => void redis.loadValue(tabId, ident.key, { ...o, keyB64: kb })}
          />
        ) : null}
      </div>

      {/* staged command preview + commit (decision 16) */}
      {!binaryKey && (commands.length > 0 || staged.length > 0) && (
        <div className="border-t border-border bg-card/40 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {commands.length} staged command{commands.length === 1 ? '' : 's'} (one transaction)
            </span>
            <div className="flex gap-2">
              <Button size="xs" variant="ghost" onClick={() => redis.clearStaged(tabId)}>
                Discard
              </Button>
              <Button
                size="xs"
                disabled={tabState?.committing}
                onClick={async () => {
                  const ok = await redis.commit(tabId, ident.key, ident.type)
                  if (ok) {
                    toast.success('Committed')
                    void redis.loadValue(tabId, ident.key, { keyB64: kb })
                  }
                }}
              >
                {tabState?.committing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Commit
              </Button>
            </div>
          </div>
          <div className="max-h-28 space-y-0.5 overflow-auto font-mono text-[11px]">
            {commands.map((c, i) => (
              <div key={i} className={cn('truncate', c.destructive && 'text-destructive')}>
                {c.args.map(argText).join(' ')}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Header({
  tab,
  ttl,
  binaryKey,
  onReload,
  onClose
}: {
  tab: Tab
  ttl: number | null
  /** binary key name → read + delete only (rename/TTL hidden) */
  binaryKey: boolean
  onReload: () => void
  onClose: () => void
}): React.JSX.Element {
  const redis = useRedis()
  const ident = tab.redisKey!
  const [renameOpen, setRenameOpen] = useState(false)
  const [newName, setNewName] = useState(ident.key)
  const [overwrite, setOverwrite] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [expiryOpen, setExpiryOpen] = useState(false)
  const [expirySecs, setExpirySecs] = useState('')

  const doRename = async (allowOverwrite: boolean): Promise<void> => {
    if (!newName.trim() || newName === ident.key) return
    try {
      await redis.renameKey(ident.key, newName, allowOverwrite)
      toast.success('Renamed')
      setRenameOpen(false)
      onClose()
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      if (m.includes('TARGET_EXISTS')) {
        setOverwrite(true)
        toast.error(`Key "${newName}" already exists — confirm overwrite`)
      } else toast.error(m)
    }
  }

  const openRename = (): void => {
    setNewName(ident.key)
    setOverwrite(false)
    setRenameOpen(true)
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
      <span className="font-mono text-sm font-medium">{ident.key}</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
        {ident.type}
      </span>
      {binaryKey && (
        <span
          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase text-amber-400"
          title="Binary key name — read and delete only"
        >
          binary · read-only
        </span>
      )}
      {ttl !== null && (
        <span
          className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          title="Remaining time to live"
        >
          <Clock className="size-3" /> {formatTtl(ttl)}
        </span>
      )}
      <div className="flex-1" />

      <Button size="xs" variant="ghost" onClick={onReload} title="Reload from server">
        <RefreshCw className="size-3.5" /> Reload
      </Button>

      {/* expiry (stages PEXPIRE/PERSIST into the value-commit) */}
      {!binaryKey && (
        <Button size="xs" variant="ghost" onClick={() => setExpiryOpen((v) => !v)}>
          <Clock className="size-3.5" /> TTL
        </Button>
      )}
      {!binaryKey && expiryOpen && (
        <div className="flex items-center gap-1">
          <input
            value={expirySecs}
            onChange={(e) => setExpirySecs(e.target.value)}
            placeholder="seconds"
            className="h-6 w-20 rounded border border-border bg-transparent px-1 text-xs"
          />
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              const s = Number(expirySecs)
              redis.setTtlChange(tab.id, Number.isFinite(s) && s > 0 ? s * 1000 : null)
              setExpiryOpen(false)
              toast.message(s > 0 ? `Staged expiry ${s}s` : 'Staged remove expiry')
            }}
          >
            Stage
          </Button>
        </div>
      )}

      {/* rename — separate guarded action, in a dialog (UTF-8 keys only) */}
      {!binaryKey && (
        <Button size="xs" variant="ghost" onClick={openRename}>
          <Pencil className="size-3.5" /> Rename
        </Button>
      )}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename key</DialogTitle>
            <DialogDescription className="font-mono text-xs">{ident.key}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
              setOverwrite(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !overwrite) void doRename(false)
            }}
            placeholder="new key name"
            className="font-mono"
          />
          {overwrite && (
            <p className="text-xs text-destructive">
              A key named <span className="font-mono">{newName}</span> already exists. Overwrite
              replaces its value.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            {overwrite ? (
              <Button variant="destructive" onClick={() => void doRename(true)}>
                Overwrite
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={!newName.trim() || newName === ident.key}
                onClick={() => void doRename(false)}
              >
                Rename
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete — simple yes/no confirm; the key name is highlighted as danger */}
      <Button
        size="xs"
        variant="ghost"
        className="text-destructive"
        title="Delete key"
        onClick={() => setDelOpen(true)}
      >
        <Trash2 className="size-3.5" /> Delete
      </Button>
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" /> Delete key
            </DialogTitle>
            <DialogDescription>
              Permanently remove{' '}
              <span className="rounded bg-destructive/10 px-1 font-mono font-medium text-destructive">
                {ident.key}
              </span>{' '}
              and its value? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDelOpen(false)}>
              No
            </Button>
            <Button
              variant="destructive"
              autoFocus
              onClick={async () => {
                await redis.deleteKey(ident.key, ident.keyB64)
                toast.success('Deleted')
                setDelOpen(false)
                onClose()
              }}
            >
              <Trash2 className="size-3.5" /> Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ForceButton({ onForce, keyName }: { onForce: () => Promise<boolean>; keyName: string }): React.JSX.Element {
  const [confirm, setConfirm] = useState('')
  return (
    <div className="flex items-center gap-1">
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="type key to force"
        className="h-6 w-28 rounded border border-border bg-transparent px-1 font-mono text-[11px]"
      />
      <Button
        size="xs"
        variant="destructive"
        disabled={confirm !== keyName}
        onClick={async () => {
          const ok = await onForce()
          if (ok) toast.success('Force-committed')
        }}
      >
        Force overwrite
      </Button>
    </div>
  )
}

// ── per-type value body ─────────────────────────────────────────────────────

function ValueBody({
  tabId,
  keyName,
  page,
  readonly,
  stage,
  loadMore
}: {
  tabId: string
  keyName: string
  page: import('../../../shared/types').RedisValuePage
  /** binary key name → the whole value is read-only (can't be safely addressed) */
  readonly?: boolean
  stage: (e: StagedEdit) => void
  loadMore: (opts: { cursor?: string; start?: number }) => void
}): React.JSX.Element {
  void tabId
  void keyName
  const ro = readonly ?? false
  switch (page.type) {
    case 'string':
      return <StringEditor page={page} stage={stage} readonly={ro} />
    case 'hash':
      return (
        <MemberGrid
          columns={['field', 'value']}
          rows={page.fields.map((f) => [f.field, f.value])}
          rowBinary={page.fields.map((f) => f.binary ?? false)}
          rowB64={page.fields.map((f) => f.b64)}
          readonly={ro}
          cursor={page.cursor}
          onMore={(c) => loadMore({ cursor: c })}
          onAdd={(vals) => stage({ kind: 'hash-set', field: vals[0], value: vals[1] })}
          onEditValue={(row, value) => stage({ kind: 'hash-set', field: row[0], value })}
          onRemove={(row, b64) => stage({ kind: 'hash-del', field: row[0], fieldB64: b64 })}
        />
      )
    case 'set':
      return (
        <MemberGrid
          columns={['member']}
          rows={page.members.map((m) => [m.value])}
          rowBinary={page.members.map((m) => m.binary ?? false)}
          rowB64={page.members.map((m) => m.b64)}
          readonly={ro}
          cursor={page.cursor}
          onMore={(c) => loadMore({ cursor: c })}
          onAdd={(vals) => stage({ kind: 'set-add', member: vals[0] })}
          onRemove={(row, b64) => stage({ kind: 'set-del', member: row[0], memberB64: b64 })}
        />
      )
    case 'zset':
      return (
        <MemberGrid
          columns={['member', 'score']}
          rows={page.members.map((m) => [m.member, String(m.score)])}
          rowBinary={page.members.map((m) => m.binary ?? false)}
          rowB64={page.members.map((m) => m.b64)}
          readonly={ro}
          cursor={page.cursor}
          onMore={(c) => loadMore({ cursor: c })}
          onAdd={(vals) => stage({ kind: 'zset-set', member: vals[0], score: Number(vals[1]) || 0 })}
          onEditValue={(row, value) => stage({ kind: 'zset-set', member: row[0], score: Number(value) || 0 })}
          onRemove={(row, b64) => stage({ kind: 'zset-del', member: row[0], memberB64: b64 })}
        />
      )
    case 'list':
      return (
        <ListEditor
          items={page.items}
          start={page.start}
          end={page.end}
          length={page.length}
          readonly={ro}
          onMore={() => loadMore({ start: page.end + 1 })}
          onSet={(index, value) => stage({ kind: 'list-set', index, value })}
          onPush={(side, value) => stage({ kind: 'list-push', side, value })}
          onRemove={(value, b64) => stage({ kind: 'list-removeval', count: 1, value, valueB64: b64 })}
        />
      )
    case 'stream':
      return (
        <StreamViewer
          entries={page.entries}
          readonly={ro}
          onMore={() => loadMore({})}
          onAppend={(fields) => stage({ kind: 'stream-add', fields })}
        />
      )
    case 'none':
      return <p className="text-sm text-muted-foreground">Key not found (it may have been deleted or expired).</p>
    default:
      return <p className="text-sm text-muted-foreground">Unsupported value type.</p>
  }
}

type ViewMode = 'text' | 'json' | 'hex' | 'base64'

// ── byte/encoding helpers (renderer-side, derived from page.base64) ──────────
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
}
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (clean.length % 2 !== 0) throw new Error('Hex must have an even number of digits')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function StringEditor({
  page,
  stage,
  readonly
}: {
  page: Extract<import('../../../shared/types').RedisValuePage, { type: 'string' }>
  stage: (e: StagedEdit) => void
  readonly?: boolean
}): React.JSX.Element {
  // original value in each representation, derived once from the raw bytes
  const orig = React.useMemo(() => {
    const bytes = page.base64 ? b64ToBytes(page.base64) : new Uint8Array()
    let json = page.text
    try {
      json = JSON.stringify(JSON.parse(page.text), null, 2)
    } catch {
      json = page.text
    }
    return { text: page.text, json, hex: bytesToHex(bytes), base64: page.base64 }
  }, [page.base64, page.text])

  const [mode, setMode] = useState<ViewMode>(page.binary ? 'hex' : 'text')
  const [draft, setDraft] = useState(orig[page.binary ? 'hex' : 'text'])
  // JSON mode renders a collapsible tree by default; 'raw' for the editable text
  const [jsonView, setJsonView] = useState<'tree' | 'raw'>('tree')

  // reset the editor to the chosen mode's representation when value or mode changes
  useEffect(() => {
    setDraft(orig[mode])
  }, [orig, mode])

  // parse the current JSON draft for the tree (null when not valid JSON)
  const jsonParsed = React.useMemo(() => {
    if (mode !== 'json') return undefined
    try {
      return { ok: true as const, value: JSON.parse(draft) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'invalid JSON' }
    }
  }, [mode, draft])

  // invalid JSON has no tree — fall back to the raw editor
  const jsonInvalid = mode === 'json' && jsonParsed !== undefined && !jsonParsed.ok
  useEffect(() => {
    if (jsonInvalid && jsonView === 'tree') setJsonView('raw')
  }, [jsonInvalid, jsonView])

  if (page.tooLarge) {
    return (
      <p className="text-sm text-muted-foreground">
        Value is {(page.bytes / 1024 / 1024).toFixed(2)} MB. Use <strong>Reload</strong> to load it
        explicitly.
      </p>
    )
  }

  const dirty = draft !== orig[mode]
  const onStage = (): void => {
    try {
      switch (mode) {
        case 'text':
          stage({ kind: 'string-set', value: draft })
          break
        case 'json': {
          JSON.parse(draft) // validate; store the text as-typed
          stage({ kind: 'string-set', value: draft })
          break
        }
        case 'hex': {
          const bytes = hexToBytes(draft)
          stage({ kind: 'string-set-bin', b64: bytesToB64(bytes), bytes: bytes.length })
          break
        }
        case 'base64': {
          const bytes = b64ToBytes(draft.trim())
          stage({ kind: 'string-set-bin', b64: bytesToB64(bytes), bytes: bytes.length })
          break
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid value for this view')
    }
  }

  const MODES: { id: ViewMode; label: string; disabled?: boolean }[] = [
    { id: 'text', label: 'Text', disabled: page.binary },
    { id: 'json', label: 'JSON', disabled: page.binary },
    { id: 'hex', label: 'Hex' },
    { id: 'base64', label: 'Base64' }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            disabled={m.disabled}
            onClick={() => setMode(m.id)}
            className={cn(
              'rounded px-2 py-0.5 text-[11px]',
              mode === m.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
              m.disabled && 'cursor-not-allowed opacity-40'
            )}
            title={m.disabled ? 'Value is not valid UTF-8' : undefined}
          >
            {m.label}
          </button>
        ))}
        {page.binary && (
          <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
            binary
          </span>
        )}
        {mode === 'json' && (
          <div className="ml-auto flex items-center gap-1">
            {(['tree', 'raw'] as const).map((v) => {
              const disabled = v === 'tree' && jsonInvalid
              return (
                <button
                  key={v}
                  disabled={disabled}
                  onClick={() => setJsonView(v)}
                  title={disabled ? 'Value is not valid JSON' : undefined}
                  className={cn(
                    'rounded px-2 py-0.5 text-[11px] capitalize',
                    jsonView === v
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50',
                    disabled && 'cursor-not-allowed opacity-40'
                  )}
                >
                  {v}
                </button>
              )
            })}
            <button
              disabled={!jsonParsed?.ok}
              onClick={() => {
                if (jsonParsed?.ok) setDraft(JSON.stringify(jsonParsed.value, null, 2))
              }}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/50',
                !jsonParsed?.ok && 'cursor-not-allowed opacity-40'
              )}
              title="Re-format (pretty-print)"
            >
              Format
            </button>
          </div>
        )}
      </div>

      {mode === 'json' && jsonView === 'tree' && jsonParsed?.ok ? (
        <div className="min-h-0 w-full flex-1 overflow-auto rounded border border-border bg-transparent p-2">
          <JsonTree data={jsonParsed.value} />
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          readOnly={readonly}
          className="min-h-0 w-full flex-1 resize-none rounded border border-border bg-transparent p-2 font-mono text-xs outline-none focus:border-ring"
          spellCheck={false}
        />
      )}

      <div className="flex shrink-0 items-center gap-2">
        {!readonly && (
          <Button
            size="xs"
            variant="secondary"
            disabled={!dirty || (mode === 'json' && jsonView === 'tree')}
            onClick={onStage}
          >
            Stage value
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground">
          {page.bytes} bytes · {page.encoding}
        </span>
      </div>
    </div>
  )
}

function MemberGrid({
  columns,
  rows,
  rowBinary,
  rowB64,
  readonly,
  cursor,
  onMore,
  onAdd,
  onEditValue,
  onRemove
}: {
  columns: string[]
  rows: string[][]
  /** per-row flag: the field/member held non-UTF-8 bytes — shown as hex, no inline edit */
  rowBinary?: boolean[]
  /** per-row raw bytes (base64) for binary members — addresses them for removal */
  rowB64?: (string | undefined)[]
  /** whole grid read-only (binary key name) — no add/edit/remove */
  readonly?: boolean
  cursor: string
  onMore: (cursor: string) => void
  onAdd: (vals: string[]) => void
  onEditValue?: (row: string[], value: string) => void
  onRemove: (row: string[], b64?: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<string[]>(columns.map(() => ''))
  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            {columns.map((c) => (
              <th key={c} className="px-2 py-1 font-medium">
                {c}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const binary = rowBinary?.[i] ?? false
            return (
            <tr key={i} className="border-t border-border/50">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 font-mono">
                  {ci === row.length - 1 && onEditValue && !binary && !readonly ? (
                    <input
                      defaultValue={cell}
                      onBlur={(e) => e.target.value !== cell && onEditValue(row, e.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-1 hover:border-border focus:border-ring"
                    />
                  ) : (
                    <span className="flex items-center gap-1 truncate">
                      {ci === 0 && binary && (
                        <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-400">
                          bin
                        </span>
                      )}
                      {cell}
                    </span>
                  )}
                </td>
              ))}
              <td className="px-1">
                {/* binary members can't be edited in place but CAN be removed
                    (addressed by their raw bytes); read-only keys allow neither */}
                {!readonly && (
                  <button onClick={() => onRemove(row, rowB64?.[i])} title="Stage remove">
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </td>
            </tr>
            )
          })}
          {/* add-member row (UTF-8 only; binary members created elsewhere) */}
          {!readonly && (
            <tr className="border-t border-border/50">
              {columns.map((c, ci) => (
                <td key={c} className="px-2 py-1">
                  <input
                    value={draft[ci]}
                    onChange={(e) => setDraft((d) => d.map((v, j) => (j === ci ? e.target.value : v)))}
                    placeholder={c}
                    className="w-full rounded border border-border bg-transparent px-1 font-mono"
                  />
                </td>
              ))}
              <td className="px-1">
                <button
                  onClick={() => {
                    if (draft[0].trim()) {
                      onAdd(draft)
                      setDraft(columns.map(() => ''))
                    }
                  }}
                  title="Stage add"
                >
                  <Plus className="size-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {cursor !== '0' && (
        <Button size="xs" variant="ghost" onClick={() => onMore(cursor)}>
          Load more
        </Button>
      )}
    </div>
  )
}

function ListEditor({
  items,
  start,
  end,
  length,
  readonly,
  onMore,
  onSet,
  onPush,
  onRemove
}: {
  items: { value: string; binary?: boolean; b64?: string }[]
  start: number
  end: number
  length: number
  readonly?: boolean
  onMore: () => void
  onSet: (index: number, value: string) => void
  onPush: (side: 'L' | 'R', value: string) => void
  onRemove: (value: string, b64?: string) => void
}): React.JSX.Element {
  const [push, setPush] = useState('')
  return (
    <div className="space-y-2">
      {!readonly && (
        <div className="flex items-center gap-1">
          <input
            value={push}
            onChange={(e) => setPush(e.target.value)}
            placeholder="value"
            className="h-6 flex-1 rounded border border-border bg-transparent px-1 font-mono text-xs"
          />
          <Button size="xs" variant="ghost" onClick={() => push && (onPush('L', push), setPush(''))}>
            Prepend
          </Button>
          <Button size="xs" variant="ghost" onClick={() => push && (onPush('R', push), setPush(''))}>
            Append
          </Button>
        </div>
      )}
      <table className="w-full text-xs">
        <tbody>
          {items.map((it, i) => {
            const index = start + i
            const binary = it.binary ?? false
            return (
              <tr key={index} className="border-t border-border/50">
                <td className="w-12 px-2 py-1 text-muted-foreground">{index}</td>
                <td className="px-2 py-1 font-mono">
                  {binary || readonly ? (
                    <span className="flex items-center gap-1 truncate">
                      {binary && (
                        <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-400">
                          bin
                        </span>
                      )}
                      {it.value}
                    </span>
                  ) : (
                    <input
                      defaultValue={it.value}
                      onBlur={(e) => e.target.value !== it.value && onSet(index, e.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-1 hover:border-border focus:border-ring"
                    />
                  )}
                </td>
                <td className="px-1">
                  {!readonly && (
                    <button onClick={() => onRemove(it.value, it.b64)} title="Stage remove (LREM)">
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="text-[11px] text-muted-foreground">
        {start}–{end} of {length}
      </div>
      {end + 1 < length && (
        <Button size="xs" variant="ghost" onClick={onMore}>
          Load more
        </Button>
      )}
    </div>
  )
}

function StreamViewer({
  entries,
  readonly,
  onMore,
  onAppend
}: {
  entries: { id: string; fields: [string, string][] }[]
  readonly?: boolean
  onMore: () => void
  onAppend: (fields: [string, string][]) => void
}): React.JSX.Element {
  const [field, setField] = useState('')
  const [value, setValue] = useState('')
  return (
    <div className="space-y-2">
      {!readonly && (
        <div className="flex items-center gap-1">
          <input value={field} onChange={(e) => setField(e.target.value)} placeholder="field" className="h-6 w-32 rounded border border-border bg-transparent px-1 font-mono text-xs" />
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" className="h-6 flex-1 rounded border border-border bg-transparent px-1 font-mono text-xs" />
          <Button size="xs" variant="ghost" onClick={() => field && (onAppend([[field, value]]), setField(''), setValue(''))}>
            <Plus className="size-3.5" /> XADD
          </Button>
        </div>
      )}
      <div className="space-y-1 font-mono text-[11px]">
        {entries.map((e) => (
          <div key={e.id} className="rounded border border-border/50 p-1.5">
            <div className="text-muted-foreground">{e.id}</div>
            {e.fields.map(([f, v], i) => (
              <div key={i}>
                <span className="text-sky-400">{f}</span>: {v}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Streams are append-only; existing entries are immutable.</p>
      <Button size="xs" variant="ghost" onClick={onMore}>
        Load more
      </Button>
    </div>
  )
}
