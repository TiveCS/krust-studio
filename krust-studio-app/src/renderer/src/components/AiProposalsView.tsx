import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Play,
  Download,
  Trash2,
  AlertTriangle,
  Bot,
  RefreshCw,
  Database,
  Table2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { SqlDisplay } from '@/components/SqlDisplay'
import { cn } from '@/lib/utils'
import { useSchemaSync } from '@/store/schemaSync'
import { useConnections } from '@/store/connections'
import type {
  DataProposal,
  DataCommitResult,
  SchemaSyncProposal,
  SchemaSyncCommitResult
} from '../../../shared/types'

/**
 * **AI Proposals** (ADR-0024) — the single surface for everything an agent has
 * staged but nothing it has applied. Holds Schema proposals (from a Schema Sync
 * run) and Data proposals side by side; each binds to one changeset of its own
 * kind, so ADR-0023's typed-changeset invariant is untouched.
 */

function createKey(name: string): string {
  return `create:${name}`
}
function alterKey(table: string, i: number): string {
  return `alter:${table}:${i}`
}
function dataChangeKey(i: number): string {
  return `data:${i}`
}

export function AiProposalsView(): React.JSX.Element {
  const { proposals, dataProposals, refresh, dismiss, dismissData } = useSchemaSync()

  useEffect(() => {
    void refresh()
  }, [refresh])

  const empty = proposals.length === 0 && dataProposals.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">AI Proposals</span>
        <span className="text-[11px] text-muted-foreground">
          Staged by an agent — nothing here has touched the database
        </span>
        <div className="ml-auto">
          <Button size="xs" variant="ghost" onClick={() => void refresh()} title="Refresh">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {empty ? (
          <div className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">
            <Bot className="mx-auto mb-3 size-8 opacity-40" />
            No proposals yet. When an AI agent calls{' '}
            <span className="font-mono">propose_schema_ops</span> or{' '}
            <span className="font-mono">propose_data_changes</span> over MCP, its staged work
            appears here for you to review and commit.
          </div>
        ) : (
          <div className="space-y-6">
            {proposals.length > 0 && (
              <section className="space-y-3">
                <SectionHeading
                  icon={<Database className="size-3.5" />}
                  label="Schema"
                  hint="DDL — binds to a Schema changeset"
                  count={proposals.length}
                />
                {proposals.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    onDismiss={() => void dismiss(p.id)}
                    onDone={refresh}
                  />
                ))}
              </section>
            )}

            {dataProposals.length > 0 && (
              <section className="space-y-3">
                <SectionHeading
                  icon={<Table2 className="size-3.5" />}
                  label="Data"
                  hint="DML — binds to a Data changeset"
                  count={dataProposals.length}
                />
                {dataProposals.map((p) => (
                  <DataProposalCard
                    key={p.id}
                    proposal={p}
                    onDismiss={() => void dismissData(p.id)}
                    onDone={refresh}
                  />
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHeading({
  icon,
  label,
  hint,
  count
}: {
  icon: React.ReactNode
  label: string
  hint: string
  count: number
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      <span className="rounded bg-muted px-1.5 text-[10px]">{count}</span>
      <span className="text-[11px]">{hint}</span>
    </div>
  )
}

// ───────────────────────── data proposals (ADR-0024) ─────────────────────────

function DataProposalCard({
  proposal: p,
  onDismiss,
  onDone
}: {
  proposal: DataProposal
  onDismiss: () => void
  onDone: () => Promise<void>
}): React.JSX.Element {
  const driver = useConnections((s) => s.connections.find((c) => c.id === p.connectionId)?.driver)
  const readOnly = useConnections(
    (s) => s.connections.find((c) => c.id === p.connectionId)?.readOnly ?? false
  )
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [changeset, setChangeset] = useState(p.changesetName ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DataCommitResult | null>(null)

  const toggle = (key: string): void =>
    setExcluded((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const selected = p.changes.filter((_, i) => !excluded.has(dataChangeKey(i)))
  const estimated = selected.reduce((n, c) => n + (c.estimatedRows ?? 0), 0)
  const anyUnknown = selected.some(
    (c) => c.verb !== 'insert' && typeof c.estimatedRows !== 'number'
  )

  const commit = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await window.api.schemaSync.commitData(p.id, {
        changesetName: changeset || undefined,
        excludeKeys: [...excluded]
      })
      setResult(res)
      if (res.failed.length === 0) {
        toast.success(`Committed — ${res.ran.length} statement(s), ${res.affected} row(s)`)
        await onDone()
      } else {
        toast.error('Commit failed — the transaction rolled back, nothing changed')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const exportSql = async (): Promise<void> => {
    try {
      const sql = await window.api.schemaSync.exportDataSql(p.id)
      await window.api.dialog.saveText(`ai-data-${p.connectionName}.sql`, sql)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <span className="font-mono text-xs font-medium">{p.connectionName}</span>
        <span className="rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
          {driver ?? '—'}
        </span>
        {readOnly && (
          <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-400">
            read-only
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          {p.client} · {selected.length} of {p.changes.length} selected ·{' '}
          {anyUnknown ? '≈? ' : `~${estimated} `}row{estimated === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            value={changeset}
            onChange={(e) => setChangeset(e.target.value)}
            placeholder="data changeset / ticket"
            className="h-7 w-44 text-xs"
          />
          <Button size="xs" variant="ghost" onClick={() => void exportSql()} title="Export .sql">
            <Download className="size-3.5" /> Export
          </Button>
          <Button
            size="xs"
            disabled={busy || readOnly || selected.length === 0}
            onClick={() => void commit()}
            title={readOnly ? 'Read-only connection — commit blocked; use Export' : 'Commit'}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Commit
          </Button>
          <Button size="xs" variant="ghost" className="text-destructive" onClick={onDismiss}>
            <Trash2 className="size-3.5" /> Dismiss
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {readOnly && (
          <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-600 dark:text-amber-400">
            Read-only connection — commit is blocked. Export the .sql for the DevOps handoff.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          Row counts were measured when the agent drafted this. They are re-taken at commit — rows
          that started matching in the meantime will be included.
        </p>

        {p.changes.map((c, i) => {
          const key = dataChangeKey(i)
          const off = excluded.has(key)
          const rows =
            c.verb === 'insert'
              ? '1 row'
              : typeof c.estimatedRows === 'number'
                ? `~${c.estimatedRows} row${c.estimatedRows === 1 ? '' : 's'}`
                : 'row count unknown'
          return (
            <div key={key} className={cn('rounded border', off && 'opacity-50')}>
              <div className="flex items-center gap-2 px-2 py-1">
                <Checkbox checked={!off} onCheckedChange={() => toggle(key)} />
                <span className="rounded bg-muted px-1 text-[9px] font-medium uppercase">
                  {c.verb}
                </span>
                <span className="font-mono text-xs font-medium">{c.table}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{rows}</span>
              </div>
              {c.sql ? (
                <SqlDisplay
                  value={c.sql}
                  driver={driver as never}
                  className="border-t p-2 text-[11px]"
                />
              ) : (
                <div className="border-t p-2 text-[11px] text-muted-foreground">
                  (SQL preview unavailable)
                </div>
              )}
            </div>
          )
        })}

        {result && (
          <div className="space-y-0.5 rounded border border-border/60 p-2 text-[11px]">
            {result.ran.map((r, i) => (
              <div key={`r${i}`} className="font-mono text-emerald-500">
                ✓ {r}
              </div>
            ))}
            {result.failed.map((f, i) => (
              <div key={`f${i}`} className="text-destructive">
                ✗ {f} — transaction rolled back, nothing was changed
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────── schema proposals (ADR-0022, unchanged) ─────────────────

function ProposalCard({
  proposal: p,
  onDismiss,
  onDone
}: {
  proposal: SchemaSyncProposal
  onDismiss: () => void
  onDone: () => Promise<void>
}): React.JSX.Element {
  const driver = useConnections((s) => s.connections.find((c) => c.id === p.connectionId)?.driver)
  const readOnly = useConnections(
    (s) => s.connections.find((c) => c.id === p.connectionId)?.readOnly ?? false
  )
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [changeset, setChangeset] = useState(p.changesetName ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SchemaSyncCommitResult | null>(null)

  const toggle = (key: string): void =>
    setExcluded((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const totalOps = p.createTables.length + p.alters.reduce((n, a) => n + a.ops.length, 0)

  const commit = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await window.api.schemaSync.commit(p.id, {
        changesetName: changeset || undefined,
        excludeKeys: [...excluded]
      })
      setResult(res)
      if (res.conflicts.length === 0) {
        toast.success(`Committed — ${res.ran.length} run, ${res.skipped.length} skipped`)
        await onDone()
      } else {
        toast.error(`${res.conflicts.length} op(s) conflicted — see details`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const exportSql = async (): Promise<void> => {
    try {
      const sql = await window.api.schemaSync.exportSql(p.id)
      await window.api.dialog.saveText(`schema-sync-${p.connectionName}.sql`, sql)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="rounded-lg border">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <span className="font-mono text-xs font-medium">{p.connectionName}</span>
        <span className="rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
          {driver ?? '—'}
        </span>
        {readOnly && (
          <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-400">
            read-only
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          {p.client} · {totalOps} additive op{totalOps === 1 ? '' : 's'}
          {p.reportOnly.length > 0 && ` · ${p.reportOnly.length} report-only`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            value={changeset}
            onChange={(e) => setChangeset(e.target.value)}
            placeholder="changeset / ticket"
            className="h-7 w-40 text-xs"
          />
          <Button size="xs" variant="ghost" onClick={() => void exportSql()} title="Export .sql">
            <Download className="size-3.5" /> Export
          </Button>
          <Button
            size="xs"
            disabled={busy || readOnly || totalOps === 0}
            onClick={() => void commit()}
            title={readOnly ? 'Read-only connection — commit blocked; use Export' : 'Commit'}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Commit
          </Button>
          <Button size="xs" variant="ghost" className="text-destructive" onClick={onDismiss}>
            <Trash2 className="size-3.5" /> Dismiss
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {readOnly && (
          <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-600 dark:text-amber-400">
            Read-only connection — commit is blocked. Export the .sql for the DevOps handoff.
          </p>
        )}

        {/* additive: create tables */}
        {p.createTables.map((ct) => {
          const key = createKey(ct.spec.name)
          const off = excluded.has(key)
          return (
            <OpBlock
              key={key}
              checked={!off}
              onToggle={() => toggle(key)}
              label={`CREATE TABLE ${ct.spec.name}`}
              ddl={ct.ddl}
              driver={driver}
            />
          )
        })}

        {/* additive: alters (per op) */}
        {p.alters.map((a) =>
          a.ops.map((op, i) => {
            const key = alterKey(a.table, i)
            const off = excluded.has(key)
            const stmt = a.statements?.[i]
            return (
              <OpBlock
                key={key}
                checked={!off}
                onToggle={() => toggle(key)}
                label={`${a.table} · ${op.kind}`}
                ddl={stmt}
                driver={driver}
              />
            )
          })
        )}

        {/* report-only */}
        {p.reportOnly.length > 0 && (
          <div className="space-y-1 rounded border border-border/60 p-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <AlertTriangle className="size-3.5 text-amber-500" /> Report-only — not applied,
              review manually
            </div>
            {p.reportOnly.map((r, i) => (
              <div key={i} className="text-[11px]">
                <span className="font-mono text-foreground">{r.table}</span>{' '}
                <span className="text-amber-500">{r.kind}</span> — {r.detail}
                {(r.codeSpec || r.dbSpec) && (
                  <span className="text-muted-foreground">
                    {' '}
                    (code: <span className="font-mono">{r.codeSpec ?? '—'}</span> · db:{' '}
                    <span className="font-mono">{r.dbSpec ?? '—'}</span>)
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* commit result */}
        {result && (
          <div className="space-y-0.5 rounded border border-border/60 p-2 text-[11px]">
            {result.ran.map((r, i) => (
              <div key={`r${i}`} className="text-emerald-500">
                ✓ {r}
              </div>
            ))}
            {result.skipped.map((s, i) => (
              <div key={`s${i}`} className="text-muted-foreground">
                – skipped {s}
              </div>
            ))}
            {result.conflicts.map((c, i) => (
              <div key={`c${i}`} className="text-destructive">
                ✗ {c}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function OpBlock({
  checked,
  onToggle,
  label,
  ddl,
  driver
}: {
  checked: boolean
  onToggle: () => void
  label: string
  ddl?: string
  driver?: string
}): React.JSX.Element {
  return (
    <div className={cn('rounded border', !checked && 'opacity-50')}>
      <div className="flex items-center gap-2 px-2 py-1">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
        <span className="font-mono text-xs font-medium">{label}</span>
      </div>
      {ddl ? (
        <SqlDisplay value={ddl} driver={driver as never} className="border-t p-2 text-[11px]" />
      ) : (
        <div className="border-t p-2 text-[11px] text-muted-foreground">
          (DDL preview unavailable — will be generated at commit)
        </div>
      )}
    </div>
  )
}
