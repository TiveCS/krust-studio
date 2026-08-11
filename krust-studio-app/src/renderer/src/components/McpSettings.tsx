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
  ConnectionSummary,
  DmlVerb
} from '../../../shared/types'

/**
 * Settings → AI / MCP (ADR-0022, extended by ADR-0024). Global master toggle +
 * port + token, and per-connection capability grants (default-deny): schema
 * introspection (+ exclude globs), accept-proposals, table data reads/writes
 * (the AI Read + Write Allowlist, per-table and per-verb, with column masks),
 * history reads (+ redact globs), and the Data-changeset auto-attach verbs.
 *
 * Laid out **tall, not dense**: a per-table, per-verb grant grid is a security
 * posture the user has to take in at a glance, so this scrolls rather than
 * crams.
 */
export function McpSettings({ open }: { open: boolean }): React.JSX.Element {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [config, setConfig] = useState<McpConfig | null>(null)
  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [portDraft, setPortDraft] = useState('')
  const [audit, setAudit] = useState<McpAuditEntry[]>([])
  const [bridgePath, setBridgePath] = useState('')

  const refresh = async (): Promise<void> => {
    const [s, c, conns, log, bp] = await Promise.all([
      window.api.mcp.status(),
      window.api.mcp.getConfig(),
      window.api.connections.list(),
      window.api.mcp.audit(200),
      window.api.mcp.bridgePath()
    ])
    setStatus(s)
    setConfig(c)
    setPortDraft(String(c.port))
    setConnections(conns)
    setAudit(log)
    setBridgePath(bp)
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

      {/* client setup */}
      <div className="space-y-2 border-t pt-4">
        <div className="text-xs font-medium">Connect an AI client</div>
        <p className="text-[11px] text-muted-foreground">
          HTTP-native clients (Claude Code) connect to the endpoint directly. stdio-first clients
          (Codex CLI, others) spawn the bundled bridge.
        </p>
        <div className="space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground">
            Streamable HTTP (e.g. Claude Code)
          </div>
          <Snippet
            text={`claude mcp add --transport http krust ${endpoint} --header "Authorization: Bearer ${config.token}"`}
            onCopy={copy}
          />
        </div>
        <div className="space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground">
            stdio bridge (e.g. Codex CLI) — command &amp; env
          </div>
          <Snippet
            text={`node ${bridgePath || '<mcp-bridge.mjs>'}\nKRUST_MCP_URL=${endpoint}\nKRUST_MCP_TOKEN=${config.token}`}
            onCopy={copy}
          />
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

/**
 * One section per stacked capability, full width, with room to read (ADR-0024).
 * A per-table, per-verb grant grid is a security posture — it has to be legible
 * at a glance, so this trades vertical space for clarity rather than cramming.
 */
function GrantSection({
  title,
  blurb,
  children
}: {
  title: string
  blurb?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="space-y-2 border-t border-border/60 pt-3 first:border-0 first:pt-0">
      <div>
        <h5 className="text-xs font-medium">{title}</h5>
        {blurb && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{blurb}</p>}
      </div>
      {children}
    </section>
  )
}

function ConnectionGrant({ conn }: { conn: ConnectionSummary }): React.JSX.Element {
  const [grant, setGrant] = useState<McpGrant | null>(null)
  const [excludesDraft, setExcludesDraft] = useState('')
  const [redactDraft, setRedactDraft] = useState('')

  useEffect(() => {
    void window.api.mcp.getGrant(conn.id).then((g) => {
      setGrant(g)
      setExcludesDraft((g.introspectExcludes ?? []).join('\n'))
      setRedactDraft((g.historyRedact ?? []).join('\n'))
    })
  }, [conn.id])

  const save = (next: McpGrant): void => {
    setGrant(next)
    void window.api.mcp.setGrant(conn.id, next)
  }

  if (!grant) return <div className="h-8" />

  const set = (patch: Partial<McpGrant>): void => save({ ...grant, ...patch })

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-medium">{conn.name}</span>
        <span className="rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
          {conn.driver}
        </span>
        {conn.readOnly && (
          <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-400">
            read-only
          </span>
        )}
      </div>

      <GrantSection
        title="Schema"
        blurb="Let an agent read this connection's structure and propose additive schema fixes. Proposals are staged for your review — they are never applied to the database."
      >
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={!!grant.introspection}
              onCheckedChange={(c) => set({ introspection: c === true })}
            />
            Schema introspection — tables, columns, types, keys. No row data.
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={!!grant.propose}
              onCheckedChange={(c) => set({ propose: c === true })}
            />
            Accept schema proposals
          </label>
        </div>
        {grant.introspection && (
          <div className="space-y-1 pt-1">
            <label className="text-[11px] text-muted-foreground">
              Hide these from introspection — one glob per line
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
              rows={3}
              spellCheck={false}
              placeholder="__EFMigrationsHistory&#10;audit.*"
              className="w-full rounded border border-border bg-transparent p-1.5 font-mono text-[11px] outline-none focus:border-ring"
            />
          </div>
        )}
      </GrantSection>

      <GrantSection
        title="Table data"
        blurb="Nothing is readable or writable until you list it below. A table can be readable without being writable; it is never writable without being readable."
      >
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={!!grant.dataReads}
              onCheckedChange={(c) => set({ dataReads: c === true })}
            />
            Allow reading rows
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={!!grant.dataWrites}
              onCheckedChange={(c) => set({ dataWrites: c === true })}
            />
            Allow proposing row changes
            <span className="text-[11px] text-muted-foreground">
              — staged for review, never applied directly
            </span>
          </label>
        </div>
        {(grant.dataReads || grant.dataWrites) && (
          <AllowlistEditor
            grant={grant}
            showWrite={!!grant.dataWrites}
            onChange={(a) => set({ allowlist: a })}
          />
        )}
      </GrantSection>

      <GrantSection
        title="Query history"
        blurb="Let an agent read the SQL Krust has already run here, and list your changesets. Useful for 'what changed last week?' — but history stores statements with their values written in, so it can show data the allowlist above would hide."
      >
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={!!grant.historyReads}
            onCheckedChange={(c) => set({ historyReads: c === true })}
          />
          Allow reading history and changesets
        </label>
        {grant.historyReads && (
          <div className="space-y-1 pt-1">
            <label className="text-[11px] text-muted-foreground">
              Hide the SQL text for these tables — one glob per line. Their entries still
              appear, with the table, time and row count, but the statement is withheld.
            </label>
            <textarea
              value={redactDraft}
              onChange={(e) => setRedactDraft(e.target.value)}
              onBlur={() =>
                set({
                  historyRedact: redactDraft
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                })
              }
              rows={3}
              spellCheck={false}
              placeholder="users&#10;*_secret"
              className="w-full rounded border border-border bg-transparent p-1.5 font-mono text-[11px] outline-none focus:border-ring"
            />
          </div>
        )}
      </GrantSection>

      <GrantSection
        title="Auto-attach to Data changeset"
        blurb={
          <>
            When a Data changeset is active, row changes you make here can be collected
            into it automatically, ready to export as a .sql handoff. Pick which kinds of
            change get collected. Anything not collected still appears in Data Mutation
            history — it lands in the Unassigned inbox, and you can add it to a changeset
            by hand at any time. Nothing is ever lost.
          </>
        }
      >
        <DataAttachEditor conn={conn} />
      </GrantSection>
    </div>
  )
}

/**
 * Per-connection auto-attach verbs (ADR-0024). Lives on the ConnectionConfig,
 * not the MCP grant — it governs *every* row change on this connection, not
 * only the AI's.
 */
function DataAttachEditor({ conn }: { conn: ConnectionSummary }): React.JSX.Element {
  // Absent means ALL — an existing connection carried over from an older build
  // must keep auto-attaching, not silently stop.
  const verbs = new Set<DmlVerb>(conn.dataAttachVerbs ?? ['insert', 'update', 'delete'])
  const unscoped = conn.dataAttachUnscoped === true

  const persist = (patch: Partial<ConnectionSummary>): void => {
    const { hasPassword: _hasPassword, ...config } = { ...conn, ...patch }
    void window.api.connections.save({ config })
  }

  const toggleVerb = (v: DmlVerb, on: boolean): void => {
    const next = new Set(verbs)
    if (on) next.add(v)
    else next.delete(v)
    persist({ dataAttachVerbs: (['insert', 'update', 'delete'] as DmlVerb[]).filter((x) => next.has(x)) })
  }

  const LABEL: Record<DmlVerb, string> = {
    insert: 'INSERT — new rows',
    update: 'UPDATE — changes to existing rows',
    delete: 'DELETE — removing specific rows'
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {(['insert', 'update', 'delete'] as DmlVerb[]).map((v) => (
          <label key={v} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={verbs.has(v)}
              onCheckedChange={(c) => toggleVerb(v, c === true)}
            />
            {LABEL[v]}
          </label>
        ))}
      </div>
      <div className="space-y-1 border-t border-border/60 pt-3">
        <label className="flex items-start gap-2 text-xs">
          <Checkbox
            className="mt-0.5"
            checked={unscoped}
            onCheckedChange={(c) => persist({ dataAttachUnscoped: c === true })}
          />
          <span>
            Also collect whole-table wipes
            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
              TRUNCATE, and DELETE / UPDATE written without a WHERE clause. These hit every
              row in the table, so they are left out by default even when the boxes above
              are ticked — an accidental one should not ride silently into a script DevOps
              runs on production. They still go to Unassigned; add them deliberately.
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}

function AllowlistEditor({
  grant,
  showWrite,
  onChange
}: {
  grant: McpGrant
  /** render the per-verb write columns (only meaningful with dataWrites on) */
  showWrite: boolean
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

  const toggleVerb = (i: number, v: DmlVerb, on: boolean): void => {
    const cur = new Set(list[i].write ?? [])
    if (on) cur.add(v)
    else cur.delete(v)
    update(i, {
      write: (['insert', 'update', 'delete'] as DmlVerb[]).filter((x) => cur.has(x))
    })
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-border/60 p-3">
      {list.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          No tables listed — the AI can see nothing on this connection. Add one below.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="w-44">Table</span>
            <span className="w-16">Read rows</span>
            {showWrite && <span className="w-44">Propose changes</span>}
            <span className="flex-1">Hide columns</span>
          </div>
          {list.map((e, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-44 truncate font-mono text-xs">{e.table}</span>
              <span className="w-16">
                <Checkbox
                  checked={e.data}
                  onCheckedChange={(c) => update(i, { data: c === true })}
                />
              </span>
              {showWrite && (
                <span className="flex w-44 items-center gap-2">
                  {(['insert', 'update', 'delete'] as DmlVerb[]).map((v) => (
                    <label
                      key={v}
                      className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"
                      title={
                        e.data
                          ? undefined
                          : 'Enable "Read rows" first — a table is never writable without being readable'
                      }
                    >
                      <Checkbox
                        disabled={!e.data}
                        checked={(e.write ?? []).includes(v)}
                        onCheckedChange={(c) => toggleVerb(i, v, c === true)}
                      />
                      {v.slice(0, 3)}
                    </label>
                  ))}
                </span>
              )}
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
                placeholder="e.g. password_hash, email"
                className="h-7 flex-1 text-[11px]"
              />
              <button
                onClick={() => remove(i)}
                className="px-1 text-muted-foreground hover:text-destructive"
                title="Remove"
              >
                <span className="text-sm">×</span>
              </button>
            </div>
          ))}
        </div>
      )}
      {showWrite && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Hidden columns cannot be read, filtered on, or written to. Whole-table writes are
          always refused — the agent must say which rows it means.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="flex gap-2 pt-1"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="table name to allow…"
          className="h-7 flex-1 text-[11px]"
        />
        <Button type="submit" size="xs" variant="secondary" disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}

function Snippet({
  text,
  onCopy
}: {
  text: string
  onCopy: (text: string, what: string) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-1.5 rounded border border-border/60 bg-muted/20 p-1.5">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">
        {text}
      </pre>
      <button
        onClick={() => onCopy(text, 'Config')}
        title="Copy"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Copy className="size-3" />
      </button>
    </div>
  )
}
