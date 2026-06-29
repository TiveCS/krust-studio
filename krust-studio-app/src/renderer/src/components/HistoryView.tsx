import { Fragment, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  RefreshCw,
  Trash2,
  Copy,
  Plus,
  Star,
  Download,
  MoreVertical,
  Pencil,
  FolderInput,
  Inbox,
  GitBranch,
  CheckCircle2,
  XCircle,
  ChevronRight,
  WrapText
} from 'lucide-react'
import { format as formatSql } from 'sql-formatter'
import { SqlDisplay } from '@/components/SqlDisplay'
import { highlightSql } from '@/lib/sqlHighlight'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useConnections } from '@/store/connections'
import type {
  Changeset,
  HistoryEntry,
  HistoryStream
} from '../../../shared/types'

type View =
  | { kind: 'stream'; stream: HistoryStream }
  | { kind: 'changeset'; id: number }
  | { kind: 'unassigned' }

function when(ts: number): string {
  return new Date(ts).toLocaleString()
}
const withSemi = (s: string): string =>
  s.trimEnd().endsWith(';') ? s.trimEnd() : s.trimEnd() + ';'

/** collapse whitespace to a single line for the truncated list preview */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

const fmtLang = (d?: string): string =>
  d === 'mysql' ? 'mysql' : d === 'postgres' ? 'postgresql' : d === 'sqlite' ? 'sqlite' : 'sql'

/** pretty-print SQL for display; never throws (falls back to the verbatim text) */
function tryFormat(sql: string, driver?: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return formatSql(sql, { language: fmtLang(driver) as any })
  } catch {
    return sql
  }
}

export function HistoryView(): React.JSX.Element {
  const openConnectionId = useConnections((s) => s.openConnectionId)
  const connections = useConnections((s) => s.connections)
  const conn = connections.find((c) => c.id === openConnectionId)

  const [view, setView] = useState<View>({
    kind: 'stream',
    stream: 'table_mutation'
  })
  const [changesets, setChangesets] = useState<Changeset[]>([])
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  /** id of the row expanded to show its full, highlighted statement */
  const [expandedId, setExpandedId] = useState<number | null>(null)
  /** pretty-print the expanded statement (display only; copy stays verbatim) */
  const [formatExpanded, setFormatExpanded] = useState(true)
  const driver = conn?.driver
  const [search, setSearch] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number[] | null>(null)
  const [dialog, setDialog] = useState<{
    mode: 'create' | 'rename'
    id?: number
    name: string
    ticket: string
    /** entry ids to move into the changeset right after it's created */
    assignIds?: number[]
  } | null>(null)

  const csName = (id: number | null): string =>
    id == null ? '' : (changesets.find((c) => c.id === id)?.name ?? `#${id}`)

  const loadChangesets = useCallback(async (): Promise<void> => {
    if (!openConnectionId) return setChangesets([])
    setChangesets(await window.api.history.listChangesets(openConnectionId))
  }, [openConnectionId])

  const loadEntries = useCallback(async (): Promise<void> => {
    if (!openConnectionId) return setEntries([])
    setLoading(true)
    setSearch('')
    try {
      const q =
        view.kind === 'stream'
          ? { connectionId: openConnectionId, stream: view.stream }
          : view.kind === 'changeset'
            ? { connectionId: openConnectionId, changesetId: view.id }
            : { connectionId: openConnectionId, unassigned: true }
      setEntries(await window.api.history.list({ ...q, limit: 500 }))
      setSelected(new Set())
    } finally {
      setLoading(false)
    }
  }, [openConnectionId, view])

  useEffect(() => {
    void loadChangesets()
  }, [loadChangesets])
  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  // DDL contexts can group/move into changesets
  const isDdlView =
    view.kind === 'changeset' ||
    view.kind === 'unassigned' ||
    (view.kind === 'stream' && view.stream === 'table_mutation')

  const toggle = (id: number): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const copy = async (text: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label)
    } catch {
      toast.error('Clipboard write blocked')
    }
  }
  const copyChosen = (): void => {
    const chosen = selected.size
      ? entries.filter((e) => selected.has(e.id))
      : entries
    const sql = chosen.map((e) => withSemi(e.statement)).reverse().join('\n')
    void copy(sql, `Copied ${chosen.length} statement(s)`)
  }

  const refreshAll = async (): Promise<void> => {
    await Promise.all([loadChangesets(), loadEntries()])
  }

  const moveTo = async (changesetId: number | null): Promise<void> => {
    await window.api.history.assignEntries([...selected], changesetId)
    toast.success(
      changesetId == null
        ? 'Moved to Unassigned'
        : `Moved to ${csName(changesetId)}`
    )
    await refreshAll()
  }

  const setActive = async (id: number, active: boolean): Promise<void> => {
    if (!openConnectionId) return
    await window.api.history.setActiveChangeset(openConnectionId, active ? null : id)
    await loadChangesets()
  }

  const exportCs = async (id: number): Promise<void> => {
    const res = await window.api.history.exportChangeset(id)
    if (res.saved) {
      toast.success('Exported changeset', { description: res.path })
      await loadChangesets()
    }
  }

  const removeCs = async (id: number): Promise<void> => {
    await window.api.history.deleteChangeset(id)
    if (view.kind === 'changeset' && view.id === id)
      setView({ kind: 'stream', stream: 'table_mutation' })
    await refreshAll()
  }

  const submitDialog = async (): Promise<void> => {
    if (!dialog || !openConnectionId) return
    const name = dialog.name.trim()
    if (!name) return
    try {
      if (dialog.mode === 'create') {
        const cs = await window.api.history.createChangeset(
          openConnectionId,
          name,
          dialog.ticket.trim() || undefined
        )
        if (dialog.assignIds?.length) {
          await window.api.history.assignEntries(dialog.assignIds, cs.id)
        }
        setDialog(null)
        await loadChangesets()
        setView({ kind: 'changeset', id: cs.id })
      } else if (dialog.id != null) {
        await window.api.history.renameChangeset(
          dialog.id,
          name,
          dialog.ticket.trim() || undefined
        )
        setDialog(null)
        await loadChangesets()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const filtered = search
    ? entries.filter((e) =>
        e.statement.toLowerCase().includes(search.toLowerCase())
      )
    : entries

  const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id))
  const toggleAll = (): void =>
    setSelected(
      allSelected
        ? new Set([...selected].filter((id) => !filtered.some((e) => e.id === id)))
        : new Set([...selected, ...filtered.map((e) => e.id)])
    )

  const deleteSelected = async (): Promise<void> => {
    const ids = [...selected]
    await window.api.history.deleteEntries(ids)
    toast.success(`Deleted ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}`)
    setDeleteConfirm(null)
    await loadEntries()
  }

  const railItem = (active: boolean): string =>
    cn(
      'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs',
      active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
    )

  return (
    <div className="flex h-full min-h-0">
      {/* left rail */}
      <aside className="flex w-60 shrink-0 flex-col overflow-auto border-r border-border p-2">
        <div className="flex items-center justify-between px-1 py-1">
          <span className="text-[10px] font-medium uppercase text-muted-foreground">
            Changesets
          </span>
          <button
            onClick={() => setDialog({ mode: 'create', name: '', ticket: '' })}
            disabled={!openConnectionId}
            title="New changeset"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {changesets.length === 0 && (
          <p className="px-2 py-1 text-[11px] text-muted-foreground/70">
            No changesets. Create one to group captured DDL.
          </p>
        )}
        {changesets.map((c) => {
          const selectedView = view.kind === 'changeset' && view.id === c.id
          return (
            <div key={c.id} className="group flex items-center">
              <button
                onClick={() => setView({ kind: 'changeset', id: c.id })}
                className={railItem(selectedView)}
              >
                <GitBranch className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{c.name}</span>
                {c.active && (
                  <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
                )}
                {c.status === 'exported' && (
                  <span className="text-[9px] text-primary">exp</span>
                )}
                <span className="text-[10px] text-muted-foreground/60">
                  {c.count}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent">
                    <MoreVertical className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void setActive(c.id, c.active)}>
                    <Star />
                    {c.active ? 'Clear active' : 'Set active'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      setDialog({
                        mode: 'rename',
                        id: c.id,
                        name: c.name,
                        ticket: c.ticket ?? ''
                      })
                    }
                  >
                    <Pencil />
                    Rename…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void exportCs(c.id)}
                    disabled={c.count === 0}
                  >
                    <Download />
                    Export .sql
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => void removeCs(c.id)}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}

        <button
          onClick={() => setView({ kind: 'unassigned' })}
          className={cn(railItem(view.kind === 'unassigned'), 'mt-1')}
        >
          <Inbox className="size-3.5 shrink-0" />
          <span className="flex-1">Unassigned</span>
        </button>

        <div className="my-2 border-t border-border" />
        <button
          onClick={() => setView({ kind: 'stream', stream: 'table_mutation' })}
          className={railItem(view.kind === 'stream' && view.stream === 'table_mutation')}
        >
          Schema Mutation (all)
        </button>
        <button
          onClick={() => setView({ kind: 'stream', stream: 'data_mutation' })}
          className={railItem(view.kind === 'stream' && view.stream === 'data_mutation')}
        >
          Data Mutation (all)
        </button>
        <button
          onClick={() => setView({ kind: 'stream', stream: 'data_retrieval' })}
          className={railItem(view.kind === 'stream' && view.stream === 'data_retrieval')}
        >
          Data Retrieval (all)
        </button>
      </aside>

      {/* right pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="truncate text-sm font-medium">
            {view.kind === 'changeset'
              ? csName(view.id)
              : view.kind === 'unassigned'
                ? 'Unassigned'
                : view.stream === 'table_mutation'
                  ? 'Schema Mutation'
                  : view.stream === 'data_mutation'
                    ? 'Data Mutation'
                    : 'Data Retrieval'}
          </span>
          <span className="text-xs text-muted-foreground">
            {conn?.name ?? 'No connection'}
          </span>
          {loading && <Loader2 className="size-3.5 animate-spin" />}
          <div className="flex-1" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter statements…"
            className="h-6 w-48 text-xs"
          />

          {selected.size > 0 && (
            <Button
              size="xs"
              variant="ghost"
              className="whitespace-nowrap text-destructive hover:text-destructive"
              onClick={() => setDeleteConfirm([...selected])}
            >
              <Trash2 />
              Delete {selected.size}
            </Button>
          )}

          {isDdlView && selected.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="xs" variant="ghost" className="whitespace-nowrap">
                  <FolderInput />
                  Move {selected.size}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {changesets
                  .filter(
                    (c) => !(view.kind === 'changeset' && view.id === c.id)
                  )
                  .map((c) => (
                    <DropdownMenuItem key={c.id} onSelect={() => void moveTo(c.id)}>
                      <GitBranch />
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                {view.kind !== 'unassigned' && (
                  <DropdownMenuItem onSelect={() => void moveTo(null)}>
                    <Inbox />
                    Unassigned
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    setDialog({
                      mode: 'create',
                      name: '',
                      ticket: '',
                      assignIds: [...selected]
                    })
                  }
                >
                  <Plus />
                  New changeset…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {view.kind === 'changeset' && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void exportCs(view.id)}
              disabled={entries.length === 0}
              title="Export .sql for DevOps"
            >
              <Download />
              Export
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={copyChosen}
            disabled={entries.length === 0}
          >
            <Copy />
            {selected.size ? `Copy ${selected.size}` : 'Copy all'}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void refreshAll()}
            title="Refresh"
          >
            <RefreshCw />
          </Button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-auto pr-2"
          style={{ scrollbarGutter: 'stable' }}
        >
          {!openConnectionId ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Connect to a database to see its history.
            </div>
          ) : entries.length === 0 && !loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No statements here yet.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No statements match "{search}".
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="w-8 px-2 py-1.5">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="w-8 px-2 py-1.5" />
                  <th className="w-40 px-2 py-1.5 font-medium">When</th>
                  <th className="w-36 px-2 py-1.5 font-medium">Object</th>
                  <th className="px-2 py-1.5 font-medium">Statement</th>
                  {isDdlView && view.kind !== 'changeset' && (
                    <th className="w-32 px-2 py-1.5 font-medium">Changeset</th>
                  )}
                  <th className="w-14 px-2 py-1.5 text-right font-medium">Rows</th>
                  <th className="w-8 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const expanded = expandedId === e.id
                  const colCount = 7 + (isDdlView && view.kind !== 'changeset' ? 1 : 0)
                  return (
                    <Fragment key={e.id}>
                      <tr
                        className={cn(
                          'group border-b border-border/30 align-top',
                          selected.has(e.id) && 'bg-accent/40'
                        )}
                      >
                        <td className="px-2 py-1.5">
                          <Checkbox
                            checked={selected.has(e.id)}
                            onCheckedChange={() => toggle(e.id)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {e.status === 'success' ? (
                            <CheckCircle2 className="size-3.5 text-primary" />
                          ) : (
                            <XCircle className="size-3.5 text-destructive" />
                          )}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                          {when(e.ts)}
                        </td>
                        <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                          {e.entity ?? ''}
                        </td>
                        <td className="max-w-0 px-2 py-1.5">
                          {/* click to expand into the full, highlighted statement */}
                          <button
                            onClick={() => setExpandedId(expanded ? null : e.id)}
                            title={expanded ? 'Collapse' : 'Expand'}
                            className="flex w-full items-start gap-1 text-left font-mono"
                          >
                            <ChevronRight
                              className={cn(
                                'mt-0.5 size-3 shrink-0 text-muted-foreground/60 transition-transform',
                                expanded && 'rotate-90'
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {highlightSql(oneLine(e.statement).slice(0, 300), driver)}
                            </span>
                          </button>
                        </td>
                        {isDdlView && view.kind !== 'changeset' && (
                          <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                            {e.changesetId == null ? (
                              <span className="text-muted-foreground/50">—</span>
                            ) : (
                              csName(e.changesetId)
                            )}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {e.affected ?? ''}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() =>
                              void copy(withSemi(e.statement), 'Copied statement')
                            }
                            title="Copy statement"
                            className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border/30 bg-card/30">
                          <td colSpan={colCount} className="px-2 pb-2.5 pt-1">
                            <div className="mb-1.5 flex items-center gap-2 pl-6">
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Statement
                              </span>
                              <button
                                onClick={() => setFormatExpanded((v) => !v)}
                                title="Toggle pretty-print (display only)"
                                className={cn(
                                  'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
                                  formatExpanded
                                    ? 'bg-accent text-foreground'
                                    : 'text-muted-foreground hover:bg-accent/50'
                                )}
                              >
                                <WrapText className="size-3" />
                                {formatExpanded ? 'Formatted' : 'Raw'}
                              </button>
                              <div className="flex-1" />
                              <button
                                onClick={() =>
                                  void copy(withSemi(e.statement), 'Copied statement')
                                }
                                title="Copy verbatim statement"
                                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                <Copy className="size-3" />
                                Copy
                              </button>
                            </div>
                            <div className="ml-6 overflow-auto rounded border border-border/60 bg-background p-2">
                              <SqlDisplay
                                value={
                                  formatExpanded
                                    ? tryFormat(e.statement, driver)
                                    : e.statement
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog
        open={!!deleteConfirm}
        onOpenChange={(o) => !o && setDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirm?.length ?? 0} entr{(deleteConfirm?.length ?? 0) === 1 ? 'y' : 'ies'}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the selected history entries. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void deleteSelected()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'create' ? 'New changeset' : 'Rename changeset'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={dialog?.name ?? ''}
              onChange={(e) =>
                setDialog((d) => (d ? { ...d, name: e.target.value } : d))
              }
              onKeyDown={(e) => e.key === 'Enter' && void submitDialog()}
              placeholder="Name (e.g. add orders.status)"
            />
            <Input
              value={dialog?.ticket ?? ''}
              onChange={(e) =>
                setDialog((d) => (d ? { ...d, ticket: e.target.value } : d))
              }
              onKeyDown={(e) => e.key === 'Enter' && void submitDialog()}
              placeholder="Ticket (optional, e.g. JIRA-123)"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitDialog()} disabled={!dialog?.name.trim()}>
              {dialog?.mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
