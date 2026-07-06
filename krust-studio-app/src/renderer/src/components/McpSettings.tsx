import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, RefreshCw, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  McpConfig,
  McpStatus,
  McpGrant,
  McpAllowEntry,
  McpAuditEntry,
  ConnectionSummary
} from '../../../shared/types'

/**
 * Settings → AI / MCP (ADR-0022). Global master toggle + port + token, and
 * per-connection capability grants (default-deny): schema introspection (+ exclude
 * globs), accept-proposals, and data reads (+ the AI Read Allowlist with masks).
 */
export function McpSettings({ open }: { open: boolean }): React.JSX.Element {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [config, setConfig] = useState<McpConfig | null>(null)
  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [portDraft, setPortDraft] = useState('')
  const [audit, setAudit] = useState<McpAuditEntry[]>([])

  const refresh = async (): Promise<void> => {
    const [s, c, conns, log] = await Promise.all([
      window.api.mcp.status(),
      window.api.mcp.getConfig(),
      window.api.connections.list(),
      window.api.mcp.audit(200)
    ])
    setStatus(s)
    setConfig(c)
    setPortDraft(String(c.port))
    setConnections(conns)
    setAudit(log)
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  if (!config || !status) {
    return (
      <div className="flex min-h-0 flex-1 items-center gap-2 p-4 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    )
  }

  const endpoint = `http://127.0.0.1:${config.port}/`

  const setEnabled = async (on: boolean): Promise<void> => {
    setBusy(true)
    try {
      const s = await window.api.mcp.setEnabled(on)
      setStatus(s)
      setConfig((c) => (c ? { ...c, enabled: on } : c))
      if (on && !s.running && s.error) toast.error(`MCP server failed to start: ${s.error}`)
    } finally {
      setBusy(false)
    }
  }

  const savePort = async (): Promise<void> => {
    const port = Number(portDraft)
    setBusy(true)
    try {
      const s = await window.api.mcp.setPort(port)
      setStatus(s)
      setConfig((c) => (c ? { ...c, port } : c))
      if (s.error) toast.error(s.error)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setPortDraft(String(config.port))
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async (): Promise<void> => {
    const token = await window.api.mcp.regenerateToken()
    setConfig((c) => (c ? { ...c, token } : c))
    toast.success('Token regenerated — update your MCP client config')
  }

  const copy = (text: string, what: string): void => {
    void navigator.clipboard.writeText(text)
    toast.message(`${what} copied`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
      {/* master toggle */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={config.enabled}
            disabled={busy}
            onCheckedChange={(c) => void setEnabled(c === true)}
          />
          Enable the in-app MCP server
        </label>
        <p className="text-[11px] text-muted-foreground">
          Serves a local Model Context Protocol endpoint on{' '}
          <span className="font-mono">127.0.0.1</span> so an AI agent (Claude Code, Codex CLI,
          Cursor…) can inspect schema and propose schema fixes. Off by default. Nothing is exposed
          until you grant a connection below. The AI can never write to the database — it only
          proposes staged schema ops you review and commit.
        </p>
        <div className="flex items-center gap-2 pt-0.5 text-[11px]">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
              status.running
                ? 'bg-emerald-500/15 text-emerald-400'
                : config.enabled
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            {status.running ? 'running' : config.enabled ? 'starting / failed' : 'stopped'}
          </span>
          {status.error && <span className="text-destructive">{status.error}</span>}
        </div>
      </div>

      {/* endpoint + port + token */}
      <div className="space-y-3 border-t pt-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Port</label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1024}
              max={65535}
              value={portDraft}
              onChange={(e) => setPortDraft(e.target.value)}
              className="h-7 w-28 text-xs"
            />
            <Button
              size="xs"
              variant="secondary"
              disabled={busy || portDraft === String(config.port)}
              onClick={() => void savePort()}
            >
              Apply
            </Button>
            <span className="font-mono text-[11px] text-muted-foreground">{endpoint}</span>
            <button
              onClick={() => copy(endpoint, 'Endpoint')}
              title="Copy endpoint"
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Auth token</label>
          <p className="text-[11px] text-muted-foreground">
            Clients send this as <span className="font-mono">Authorization: Bearer …</span>. Paste
            it into your MCP client config. Regenerating invalidates the old one.
          </p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              type={showToken ? 'text' : 'password'}
              value={config.token}
              className="h-7 flex-1 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button size="xs" variant="ghost" onClick={() => setShowToken((v) => !v)}>
              {showToken ? 'Hide' : 'Show'}
            </Button>
            <button
              onClick={() => copy(config.token, 'Token')}
              title="Copy token"
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3.5" />
            </button>
            <button
              onClick={() => void regenerate()}
              title="Regenerate token"
              className="text-muted-foreground hover:text-destructive"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* notify on proposal */}
      <div className="space-y-2 border-t pt-4">
        <label className="flex items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={config.notifyOnProposal}
            onCheckedChange={(c) => {
              const on = c === true
              setConfig((cfg) => (cfg ? { ...cfg, notifyOnProposal: on } : cfg))
              void window.api.mcp.setNotifyOnProposal(on)
            }}
          />
          Toast when an agent proposes schema changes
        </label>
        <p className="text-[11px] text-muted-foreground">
          The Schema Sync tab always badges a new proposal; this also fires a toast. Default on.
        </p>
      </div>

      {/* per-connection grants */}
      <div className="space-y-2 border-t pt-4">
        <div className="text-xs font-medium">Per-connection access (default-deny)</div>
        <p className="text-[11px] text-muted-foreground">
          A connection is invisible to the AI until you grant a capability here. Prod stays hidden
          unless you opt it in — and even then, writes are still blocked by its read-only flag.
        </p>
        <div className="space-y-2 pt-1">
          {connections.length === 0 && (
            <span className="text-[11px] text-muted-foreground/60">No connections yet.</span>
          )}
          {connections.map((conn) => (
            <ConnectionGrant key={conn.id} conn={conn} />
          ))}
        </div>
      </div>

      {/* AI Access Audit */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium">Recent AI access</div>
          <button
            onClick={() => void window.api.mcp.audit(200).then(setAudit)}
            className="text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="size-3" />
          </button>
          <span className="text-[10px] text-muted-foreground/70">
            every MCP call is logged — never auto-purged
          </span>
        </div>
        {audit.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60">No AI access yet.</p>
        ) : (
          <div className="max-h-56 space-y-0.5 overflow-auto rounded border border-border/60 p-2">
            {audit.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground/70">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <span className={cn(e.ok ? 'text-emerald-500' : 'text-destructive')}>
                  {e.ok ? '✓' : '✗'}
                </span>
                <span className="font-mono text-foreground">{e.tool}</span>
                {e.connectionName && (
                  <span className="text-muted-foreground">{e.connectionName}</span>
                )}
                {e.target && <span className="font-mono text-muted-foreground">{e.target}</span>}
                <span className="ml-auto truncate text-muted-foreground/60" title={e.client}>
                  {e.detail ?? e.client}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionGrant({ conn }: { conn: ConnectionSummary }): React.JSX.Element {
  const [grant, setGrant] = useState<McpGrant | null>(null)
  const [excludesDraft, setExcludesDraft] = useState('')

  useEffect(() => {
    void window.api.mcp.getGrant(conn.id).then((g) => {
      setGrant(g)
      setExcludesDraft((g.introspectExcludes ?? []).join('\n'))
    })
  }, [conn.id])

  const save = (next: McpGrant): void => {
    setGrant(next)
    void window.api.mcp.setGrant(conn.id, next)
  }

  if (!grant) return <div className="h-8" />

  const set = (patch: Partial<McpGrant>): void => save({ ...grant, ...patch })

  return (
    <div className="rounded border border-border/60 p-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-medium">{conn.name}</span>
        <span className="rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
          {conn.driver}
        </span>
        {conn.readOnly && (
          <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-400">
            read-only
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        <label className="flex items-center gap-1.5 text-[11px]">
          <Checkbox
            checked={!!grant.introspection}
            onCheckedChange={(c) => set({ introspection: c === true })}
          />
          Schema introspection
        </label>
        <label className="flex items-center gap-1.5 text-[11px]">
          <Checkbox
            checked={!!grant.propose}
            onCheckedChange={(c) => set({ propose: c === true })}
          />
          Accept schema proposals
        </label>
        <label className="flex items-center gap-1.5 text-[11px]">
          <Checkbox
            checked={!!grant.dataReads}
            onCheckedChange={(c) => set({ dataReads: c === true })}
          />
          Data reads
        </label>
      </div>
      {grant.dataReads && <AllowlistEditor grant={grant} onChange={(a) => set({ allowlist: a })} />}
      {grant.introspection && (
        <div className="mt-1.5 space-y-1">
          <label className="text-[10px] text-muted-foreground">
            Introspection excludes (one glob per line — hidden from the diff)
          </label>
          <textarea
            value={excludesDraft}
            onChange={(e) => setExcludesDraft(e.target.value)}
            onBlur={() =>
              set({
                introspectExcludes: excludesDraft
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
            rows={2}
            spellCheck={false}
            placeholder="__EFMigrationsHistory&#10;audit.*"
            className="w-full rounded border border-border bg-transparent p-1 font-mono text-[11px] outline-none focus:border-ring"
          />
        </div>
      )}
    </div>
  )
}

function AllowlistEditor({
  grant,
  onChange
}: {
  grant: McpGrant
  onChange: (a: McpAllowEntry[]) => void
}): React.JSX.Element {
  const list = grant.allowlist ?? []
  const [name, setName] = useState('')

  const update = (i: number, patch: Partial<McpAllowEntry>): void =>
    onChange(list.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const remove = (i: number): void => onChange(list.filter((_, j) => j !== i))
  const add = (): void => {
    const t = name.trim()
    if (!t) return
    onChange([...list, { table: t, data: false }])
    setName('')
  }

  return (
    <div className="mt-2 space-y-1.5 rounded border border-border/60 p-2">
      <div className="text-[10px] font-medium text-muted-foreground">
        AI Read Allowlist — only these tables are readable (default-deny)
      </div>
      {list.length === 0 && (
        <div className="text-[10px] text-muted-foreground/60">
          No tables allowed yet — the AI can read nothing on this connection.
        </div>
      )}
      {list.map((e, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <span className="w-40 truncate font-mono text-[11px]">{e.table}</span>
          <label className="flex items-center gap-1 text-[10px]">
            <Checkbox checked={e.data} onCheckedChange={(c) => update(i, { data: c === true })} />
            rows
          </label>
          <Input
            value={(e.maskColumns ?? []).join(', ')}
            onChange={(ev) =>
              update(i, {
                maskColumns: ev.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
            placeholder="mask columns (comma)"
            className="h-6 flex-1 text-[11px]"
          />
          <button
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive"
            title="Remove"
          >
            <span className="text-xs">×</span>
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="flex gap-1.5 pt-0.5"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="table name to allow…"
          className="h-6 flex-1 text-[11px]"
        />
        <Button type="submit" size="xs" variant="secondary" disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}
