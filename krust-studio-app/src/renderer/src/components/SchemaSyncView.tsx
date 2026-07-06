import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Play, Download, Trash2, AlertTriangle, Bot, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { SqlDisplay } from '@/components/SqlDisplay'
import { cn } from '@/lib/utils'
import { useSchemaSync } from '@/store/schemaSync'
import { useConnections } from '@/store/connections'
import type { SchemaSyncProposal, SchemaSyncCommitResult } from '../../../shared/types'

function createKey(name: string): string {
  return `create:${name}`
}
function alterKey(table: string, i: number): string {
  return `alter:${table}:${i}`
}

export function SchemaSyncView(): React.JSX.Element {
  const { proposals, refresh, dismiss } = useSchemaSync()

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Bot className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Schema Sync</span>
        <span className="text-[11px] text-muted-foreground">
          AI-proposed schema fixes — review &amp; commit
        </span>
        <div className="ml-auto">
          <Button size="xs" variant="ghost" onClick={() => void refresh()} title="Refresh">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {proposals.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">
            <Bot className="mx-auto mb-3 size-8 opacity-40" />
            No proposals yet. When an AI agent calls{' '}
            <span className="font-mono">propose_schema_ops</span> over MCP, staged additive schema
            fixes appear here for you to review and commit.
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} onDismiss={() => void dismiss(p.id)} onDone={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

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

  const totalOps =
    p.createTables.length + p.alters.reduce((n, a) => n + a.ops.length, 0)

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
              <div key={`r${i}`} className="text-emerald-500">✓ {r}</div>
            ))}
            {result.skipped.map((s, i) => (
              <div key={`s${i}`} className="text-muted-foreground">– skipped {s}</div>
            ))}
            {result.conflicts.map((c, i) => (
              <div key={`c${i}`} className="text-destructive">✗ {c}</div>
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
        <SqlDisplay
          value={ddl}
          driver={driver as never}
          className="border-t p-2 text-[11px]"
        />
      ) : (
        <div className="border-t p-2 text-[11px] text-muted-foreground">
          (DDL preview unavailable — will be generated at commit)
        </div>
      )}
    </div>
  )
}
