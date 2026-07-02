import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  FunctionSquare,
  Cog,
  Play,
  Save,
  Trash2,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { SqlDisplay } from '@/components/SqlDisplay'
import { SqlEditor, type SqlEditorHandle } from '@/components/SqlEditor'
import { cn } from '@/lib/utils'
import { useConnections } from '@/store/connections'
import type { DriverType, RoutineArg, RoutineExecResult } from '../../../shared/types'

type SubView = 'definition' | 'execute'

export function RoutineView(): React.JSX.Element | null {
  const {
    connections,
    openConnectionId,
    tabs,
    activeTabId,
    loadRoutineDef,
    setRoutineDraft,
    createRoutineFromDraft,
    dropRoutine
  } = useConnections()

  const tab = tabs.find((t) => t.id === activeTabId) ?? null
  const driver = connections.find((c) => c.id === openConnectionId)?.driver as
    | DriverType
    | undefined
  const readOnly = connections.find((c) => c.id === openConnectionId)?.readOnly ?? false

  const editorRef = useRef<SqlEditorHandle>(null)
  const [sub, setSub] = useState<SubView>('definition')
  const [busy, setBusy] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)
  const [dropConfirm, setDropConfirm] = useState('')

  // execute state (transient, per mount)
  const [args, setArgs] = useState<Record<string, RoutineArg>>({})
  const [preview, setPreview] = useState<string[] | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RoutineExecResult | null>(null)
  const [execError, setExecError] = useState<string | null>(null)

  const isNew = tab != null && tab.kind === 'routine' && !tab.routineRef
  const def = tab?.routineDef ?? null
  // MySQL: editing an EXISTING routine is blocked in beta.1 (no atomic replace,
  // Recovery Copy deferred to beta.2 — ADR-0021). New routines are allowed.
  const mysqlEditBlocked = driver === 'mysql' && !isNew

  // load definition for an existing routine tab on mount
  useEffect(() => {
    if (tab?.kind === 'routine' && tab.routineRef && !tab.routineDef && !tab.routineDefLoading) {
      void loadRoutineDef(tab.id)
    }
  }, [tab?.id, tab?.routineRef, tab?.routineDef, tab?.routineDefLoading, loadRoutineDef, tab])

  // seed exec args when the param list is known
  const execParams = useMemo(
    () => (def?.params ?? []).filter((p) => p.mode === 'in' || p.mode === 'inout'),
    [def]
  )
  useEffect(() => {
    setArgs((prev) => {
      const next: Record<string, RoutineArg> = {}
      for (const p of execParams)
        next[p.name] = prev[p.name] ?? { name: p.name, type: p.type, value: '' }
      return next
    })
  }, [execParams])

  if (!tab || tab.kind !== 'routine') return null

  const ref = tab.routineRef
  const dirty = tab.routineDraft !== undefined && tab.routineDraft !== tab.routineBaseline

  const doSave = async (): Promise<void> => {
    setBusy(true)
    try {
      const statements = await createRoutineFromDraft()
      toast.success(isNew ? 'Routine created' : 'Routine saved', {
        description: statements[0]
      })
      // reload metadata after create/replace
      if (tab.routineRef) void loadRoutineDef(tab.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const doDrop = async (): Promise<void> => {
    if (!ref) return
    setBusy(true)
    try {
      const [sql] = await dropRoutine(ref)
      toast.success('Routine dropped', { description: sql })
      setDropOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const argList = (): RoutineArg[] => execParams.map((p) => args[p.name] ?? { name: p.name, type: p.type, value: '' })

  const doPreview = async (): Promise<void> => {
    if (!openConnectionId || !ref) return
    try {
      const { statements } = await window.api.routines.previewCall(openConnectionId, ref, argList())
      setPreview(statements)
      setConfirmOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const doRun = async (): Promise<void> => {
    if (!openConnectionId || !ref) return
    setRunning(true)
    setExecError(null)
    try {
      const res = await window.api.routines.execute(openConnectionId, ref, argList())
      setResult(res)
      setConfirmOpen(false)
    } catch (err) {
      setExecError(err instanceof Error ? err.message : String(err))
      setConfirmOpen(false)
    } finally {
      setRunning(false)
    }
  }

  const KindIcon = ref?.kind === 'function' || (isNew && driver === 'postgres') ? FunctionSquare : Cog

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <KindIcon className="size-4 text-muted-foreground" />
        <span className="font-mono text-sm font-medium">{tab.entity.name}</span>
        {ref && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
            {ref.kind}
          </span>
        )}
        {dirty && <span className="text-[10px] text-amber-500">● unsaved</span>}
        <div className="ml-auto flex items-center gap-1">
          {ref && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void loadRoutineDef(tab.id)}
              title="Reload from server"
            >
              <RefreshCw />
            </Button>
          )}
          {!mysqlEditBlocked && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => editorRef.current?.format()}
              title="Format (Shift+Alt+F)"
            >
              <Sparkles />
              Format
            </Button>
          )}
          {!mysqlEditBlocked && (
            <Button size="xs" onClick={() => void doSave()} disabled={busy || readOnly}>
              <Save />
              {isNew ? 'Create' : 'Save'}
            </Button>
          )}
          {ref && (
            <Button
              size="xs"
              variant="destructive"
              onClick={() => {
                setDropConfirm('')
                setDropOpen(true)
              }}
              disabled={readOnly}
            >
              <Trash2 />
              Drop
            </Button>
          )}
        </div>
      </div>

      {/* sub-view switch */}
      {ref && (
        <div className="flex gap-1 border-b px-3 py-1.5">
          <SubTab active={sub === 'definition'} onClick={() => setSub('definition')}>
            Definition
          </SubTab>
          <SubTab active={sub === 'execute'} onClick={() => setSub('execute')}>
            Execute
          </SubTab>
        </div>
      )}

      {/* body */}
      <div className="min-h-0 flex-1 overflow-auto">
        {tab.routineDefLoading && (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        )}
        {tab.error && (
          <div className="m-3 rounded border border-destructive/40 p-2 text-xs text-destructive">
            {tab.error}
          </div>
        )}

        {(sub === 'definition' || isNew) && !tab.routineDefLoading && (
          <div className="flex h-full min-h-0 flex-col">
            {mysqlEditBlocked && (
              <div className="m-3 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Editing an existing MySQL/MariaDB routine lands in a later beta
                  (safe replace). You can view the definition, execute it, drop it,
                  or create a new routine.
                </span>
              </div>
            )}
            {mysqlEditBlocked ? (
              <SqlDisplay
                value={def?.definition ?? ''}
                driver={driver}
                className="p-3 text-xs"
              />
            ) : (
              <SqlEditor
                ref={editorRef}
                value={tab.routineDraft ?? ''}
                onChange={(v) => setRoutineDraft(tab.id, v)}
                onRun={() => void doSave()}
                driver={driver}
                onFormatError={(m) => toast.error(m)}
              />
            )}
          </div>
        )}

        {sub === 'execute' && ref && !isNew && (
          <div className="space-y-3 p-3">
            {def && def.params.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                {def.params.map((p) => (
                  <span key={p.name} className="mr-3 font-mono">
                    {p.name}{' '}
                    <span className="uppercase text-muted-foreground/70">{p.mode}</span>{' '}
                    {p.type}
                  </span>
                ))}
              </div>
            )}
            {execParams.length === 0 && (
              <p className="text-xs text-muted-foreground">No input parameters.</p>
            )}
            {execParams.map((p) => {
              const a = args[p.name] ?? { name: p.name, type: p.type, value: '' }
              const isNull = a.value === null
              return (
                <div key={p.name} className="flex items-center gap-2">
                  <label className="w-40 shrink-0 truncate font-mono text-xs" title={p.type}>
                    {p.name}
                    <span className="ml-1 text-muted-foreground">{p.type}</span>
                  </label>
                  <Input
                    className="h-7 flex-1 font-mono text-xs"
                    disabled={isNull}
                    value={a.value ?? ''}
                    placeholder={isNull ? 'NULL' : 'value…'}
                    onChange={(e) =>
                      setArgs((prev) => ({
                        ...prev,
                        [p.name]: { name: p.name, type: p.type, value: e.target.value }
                      }))
                    }
                  />
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Checkbox
                      checked={isNull}
                      onCheckedChange={(c) =>
                        setArgs((prev) => ({
                          ...prev,
                          [p.name]: { name: p.name, type: p.type, value: c ? null : '' }
                        }))
                      }
                    />
                    NULL
                  </label>
                </div>
              )
            })}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => void doPreview()}
                disabled={running || (ref.kind === 'procedure' && readOnly)}
              >
                <Play />
                {ref.kind === 'procedure' ? 'Preview & run…' : 'Run'}
              </Button>
              {ref.kind === 'procedure' && readOnly && (
                <span className="text-[11px] text-amber-500">
                  Read-only connection — procedure execution is blocked.
                </span>
              )}
            </div>

            {execError && (
              <div className="rounded border border-destructive/40 p-2 text-xs text-destructive">
                {execError}
              </div>
            )}
            {result && <RoutineResult result={result} driver={driver} />}
          </div>
        )}
      </div>

      {/* execute confirm (preview + run) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {ref?.kind === 'procedure' ? 'Run procedure' : 'Run function'}
            </DialogTitle>
            <DialogDescription>
              The exact command{(preview?.length ?? 0) > 1 ? 's' : ''} that will run:
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-auto rounded border">
            <SqlDisplay value={(preview ?? []).join('\n')} driver={driver} className="p-2 text-xs" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void doRun()} disabled={running}>
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* drop confirm (typed) */}
      <Dialog open={dropOpen} onOpenChange={setDropOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              Drop {ref?.kind}
            </DialogTitle>
            <DialogDescription>
              This permanently drops{' '}
              <span className="font-mono">{ref?.name}</span>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Type <span className="font-mono text-foreground">{ref?.name}</span> to confirm.
            </p>
            <Input
              autoFocus
              value={dropConfirm}
              onChange={(e) => setDropConfirm(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && dropConfirm === ref?.name && void doDrop()
              }
              placeholder={ref?.name}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDropOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void doDrop()}
              disabled={busy || dropConfirm !== ref?.name}
            >
              Drop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SubTab({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded px-2 py-1 text-xs',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function RoutineResult({
  result,
  driver
}: {
  result: RoutineExecResult
  driver?: DriverType
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      {result.statements.length > 0 && (
        <div className="rounded border">
          <SqlDisplay value={result.statements.join('\n')} driver={driver} className="p-2 text-xs" />
        </div>
      )}
      {result.outValues && (
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">OUT values</p>
          <ResultTable
            columns={Object.keys(result.outValues).map((name) => ({ name }))}
            rows={[result.outValues]}
          />
        </div>
      )}
      {result.resultSets.map((rs, i) => (
        <div key={i}>
          {result.resultSets.length > 1 && (
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              Result set {i + 1}
            </p>
          )}
          <ResultTable columns={rs.columns} rows={rs.rows} />
        </div>
      ))}
      {!result.outValues &&
        result.resultSets.length === 0 &&
        result.affected != null && (
          <p className="text-xs text-muted-foreground">
            {result.affected} row{result.affected === 1 ? '' : 's'} affected.
          </p>
        )}
    </div>
  )
}

function ResultTable({
  columns,
  rows
}: {
  columns: { name: string }[]
  rows: Record<string, unknown>[]
}): React.JSX.Element {
  if (!rows.length) return <p className="text-xs text-muted-foreground">No rows.</p>
  const cols = columns.length ? columns : Object.keys(rows[0]).map((name) => ({ name }))
  return (
    <div className="overflow-auto rounded border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/50">
            {cols.map((c) => (
              <th key={c.name} className="border-b px-2 py-1 text-left font-mono font-medium">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-accent/40">
              {cols.map((c) => (
                <td key={c.name} className="border-b px-2 py-1 font-mono">
                  {fmtCell(r[c.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
