import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Download,
  Upload,
  FileWarning,
  AlertTriangle,
  Table2,
  Eye
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useConnections } from '@/store/connections'
import type {
  BackupTableMode,
  BackupTableSpec,
  RestorePreview
} from '../../../shared/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type PanelTab = 'backup' | 'restore'

const MODES: { value: BackupTableMode; label: string }[] = [
  { value: 'skip', label: 'Skip' },
  { value: 'schema', label: 'Schema' },
  { value: 'schema+data', label: 'Schema + data' }
]

export function BackupDialog({ open, onOpenChange }: Props): React.JSX.Element {
  const { openConnectionId, entities, connections, refreshEntities } = useConnections()
  const conn = connections.find((c) => c.id === openConnectionId)
  const readOnly = conn?.readOnly ?? false
  const [panel, setPanel] = useState<PanelTab>('backup')

  // ── backup state ──────────────────────────────────────────────────────────
  const tables = useMemo(() => entities.filter((e) => e.type === 'table'), [entities])
  const views = useMemo(() => entities.filter((e) => e.type === 'view'), [entities])
  const ordered = useMemo(() => [...tables, ...views], [tables, views])
  const [modes, setModes] = useState<Record<string, BackupTableMode>>({})
  const [dropFirst, setDropFirst] = useState(false)
  const [busy, setBusy] = useState(false)

  const keyOf = (e: { name: string; schema?: string }): string =>
    `${e.schema ?? ''}.${e.name}`
  const modeOf = (e: { name: string; schema?: string }): BackupTableMode =>
    modes[keyOf(e)] ?? 'schema+data'
  const setMode = (e: { name: string; schema?: string }, m: BackupTableMode): void =>
    setModes((prev) => ({ ...prev, [keyOf(e)]: m }))
  const setAll = (m: BackupTableMode): void =>
    setModes(Object.fromEntries(ordered.map((e) => [keyOf(e), m])))

  const selectedCount = ordered.filter((e) => modeOf(e) !== 'skip').length

  const runBackup = async (): Promise<void> => {
    if (!openConnectionId) return
    const specTables: BackupTableSpec[] = ordered.map((e) => ({
      name: e.name,
      schema: e.schema,
      type: e.type,
      mode: modeOf(e)
    }))
    setBusy(true)
    try {
      const res = await window.api.backup.run(openConnectionId, {
        tables: specTables,
        dropFirst
      })
      if (res.saved) {
        toast.success(
          `Backed up ${res.tablesWritten} object(s), ${res.rowsWritten} row(s)`,
          { description: res.path }
        )
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // ── restore state ─────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [restorePath, setRestorePath] = useState<string | null>(null)
  const [stopOnError, setStopOnError] = useState(true)
  const [confirming, setConfirming] = useState(false)

  const chooseFile = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await window.api.backup.restorePreview()
      if (res.canceled || !res.preview) return
      setPreview(res.preview)
      setRestorePath(res.path ?? null)
      setConfirming(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const runRestore = async (): Promise<void> => {
    if (!openConnectionId || !restorePath) return
    setBusy(true)
    try {
      const res = await window.api.backup.restoreRun(
        openConnectionId,
        restorePath,
        stopOnError
      )
      if (res.failed === 0) {
        toast.success(`Restore complete — ran ${res.ran} statement(s)`)
      } else {
        toast.error(
          `Restore: ${res.ran} ok, ${res.failed} failed — ${res.errors[0]?.error ?? ''}`,
          { duration: 8000 }
        )
      }
      // schema likely changed (new tables) — refresh the sidebar tree
      await refreshEntities()
      onOpenChange(false)
      setPreview(null)
      setRestorePath(null)
      setConfirming(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const seg = (active: boolean): string =>
    cn(
      'rounded px-3 py-1 text-xs',
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Backup &amp; Restore</DialogTitle>
          <DialogDescription>
            Self-contained SQL dump — no external tooling required.
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex w-fit rounded-md border border-border p-0.5">
          <button onClick={() => setPanel('backup')} className={seg(panel === 'backup')}>
            Backup
          </button>
          <button onClick={() => setPanel('restore')} className={seg(panel === 'restore')}>
            Restore
          </button>
        </div>

        {panel === 'backup' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Set all:</span>
              <Button size="xs" variant="ghost" onClick={() => setAll('schema+data')}>
                Schema + data
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setAll('schema')}>
                Schema only
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setAll('skip')}>
                None
              </Button>
            </div>

            <div className="max-h-72 overflow-auto rounded-md border border-border">
              {ordered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No tables to back up.
                </div>
              ) : (
                ordered.map((e) => (
                  <div
                    key={keyOf(e)}
                    className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 text-xs last:border-0"
                  >
                    {e.type === 'view' ? (
                      <Eye className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate font-mono">{e.name}</span>
                    <div className="inline-flex rounded border border-border p-0.5">
                      {MODES.map((m) => {
                        // views can't carry data
                        const disabled = e.type === 'view' && m.value === 'schema+data'
                        return (
                          <button
                            key={m.value}
                            disabled={disabled}
                            onClick={() => setMode(e, m.value)}
                            className={cn(
                              seg(modeOf(e) === m.value),
                              disabled && 'cursor-not-allowed opacity-30'
                            )}
                          >
                            {m.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={dropFirst}
                onCheckedChange={(v) => setDropFirst(v === true)}
              />
              Add <span className="font-mono">DROP … IF EXISTS</span> before each CREATE
            </label>

            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-xs text-muted-foreground">
                {selectedCount} object(s) selected
              </span>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void runBackup()} disabled={busy || selectedCount === 0}>
                {busy ? <Loader2 className="animate-spin" /> : <Download />}
                Save…
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {readOnly && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 px-3 py-2 text-xs text-amber-500">
                <AlertTriangle className="size-4 shrink-0" />
                This connection is read-only — restore is blocked.
              </div>
            )}
            <Button variant="outline" onClick={() => void chooseFile()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              Choose a .sql backup…
            </Button>

            {preview && (
              <>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {preview.total} statement(s)
                  </span>
                  {preview.destructiveCount > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <FileWarning className="size-3.5" />
                      {preview.destructiveCount} destructive (DROP/DELETE/TRUNCATE)
                    </span>
                  )}
                </div>
                <div className="max-h-56 overflow-auto rounded-md border border-border font-mono text-[11px]">
                  {preview.statements.slice(0, 500).map((s, i) => (
                    <div
                      key={i}
                      className={cn(
                        'truncate border-b border-border/20 px-2 py-0.5 last:border-0',
                        s.destructive && 'bg-delete-row text-destructive'
                      )}
                      title={s.statement}
                    >
                      {s.statement}
                    </div>
                  ))}
                  {preview.statements.length > 500 && (
                    <div className="px-2 py-1 text-muted-foreground">
                      … and {preview.statements.length - 500} more
                    </div>
                  )}
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={stopOnError}
                    onCheckedChange={(v) => setStopOnError(v === true)}
                  />
                  Stop on first error
                </label>

                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
                  <p className="mb-2 flex items-center gap-1.5 font-medium text-destructive">
                    <AlertTriangle className="size-3.5" />
                    Runs arbitrary, irreversible SQL against{' '}
                    <span className="font-mono">{conn?.name}</span>.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    {!confirming ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={readOnly}
                        onClick={() => setConfirming(true)}
                      >
                        Run restore…
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy || readOnly}
                          onClick={() => void runRestore()}
                        >
                          {busy ? <Loader2 className="animate-spin" /> : <AlertTriangle />}
                          Yes, run {preview.total} statement(s)
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
