import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  Undo2,
  X,
  Pencil,
  TableProperties,
  AlignLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { StructureEditor } from '@/components/StructureEditor'
import { ViewSwitch } from '@/components/ViewSwitch'
import { SqlDisplay } from '@/components/SqlDisplay'
import { TemplateManager } from '@/components/TemplateManager'
import { type EditorColumn } from '@/components/ColumnsEditor'
import { seed, diff } from '@/lib/columnDiff'
import { insertTemplateColumns } from '@/lib/templates'
import { useConnections, type StructureSub as Sub } from '@/store/connections'
import type { EntityRef, IndexSpec, NewColumnSpec, SchemaOp } from '../../../shared/types'

const SUBS: Sub[] = ['columns', 'indexes', 'relations', 'referencedBy', 'ddl']
const SUB_LABEL: Record<Sub, string> = {
  columns: 'Columns',
  indexes: 'Indexes',
  relations: 'Relations',
  referencedBy: 'Referenced by',
  ddl: 'DDL'
}

// index methods offered per engine (sqlite: none — btree only, no USING).
// MySQL lists HASH but it's disabled unless the table's storage engine actually
// supports it (MEMORY/NDB) — InnoDB/MyISAM silently store USING HASH as a B-tree.
const INDEX_METHODS: Record<string, string[]> = {
  postgres: ['btree', 'hash', 'gist', 'gin', 'spgist', 'brin'],
  mysql: ['btree', 'hash']
}

// MySQL storage engines that implement real user-defined HASH indexes
const MYSQL_HASH_ENGINES = new Set(['MEMORY', 'HEAP', 'NDB', 'NDBCLUSTER'])

/** reason a method is unavailable for the current table, or null if usable */
function methodDisabledReason(
  driver: string | undefined,
  method: string,
  engine: string | undefined
): string | null {
  if (driver === 'mysql' && method === 'hash') {
    const eng = (engine ?? '').toUpperCase()
    if (!MYSQL_HASH_ENGINES.has(eng))
      return `Needs a MEMORY or NDB table — ${engine ?? 'InnoDB'} stores USING HASH as a B-tree.`
  }
  return null
}

const METHOD_DESC: Record<string, string> = {
  default: 'Engine default (B-tree on Postgres & MySQL).',
  btree: 'Balanced tree — general purpose: equality, range (<, >, BETWEEN), ORDER BY.',
  hash: 'Hash table — equality (=) only; fast exact match, no ranges or sorting.',
  gist: 'GiST — geometric, full-text, range & nearest-neighbour searches.',
  gin: 'Inverted index — multi-value columns: arrays, jsonb, full-text.',
  spgist: 'Space-partitioned GiST — non-balanced data: tries, quadtrees, IP ranges.',
  brin: 'Block-range — huge, naturally-ordered tables; tiny & cheap, coarse.'
}

function th(label: string): React.JSX.Element {
  return <th className="px-3 py-1.5 text-left font-medium">{label}</th>
}

// stable empty refs so an unseeded/empty tab doesn't churn renders
const EMPTY_COLS: EditorColumn[] = []
const EMPTY_ADDS: IndexSpec[] = []

export function StructureView(): React.JSX.Element | null {
  const {
    tabs,
    activeTabId,
    refreshStructure,
    refreshEntities,
    connections,
    openConnectionId,
    setStructureSub,
    fetchReferencedBy,
    openTable,
    setStructDraft,
    setIdxAdds,
    setIdxDrops,
    setFkDrops,
    setStructDirty,
    templates
  } = useConnections()
  const tab = tabs.find((t) => t.id === activeTabId)
  const st = tab?.structure ?? null
  const sub = tab?.structureSub ?? 'columns'
  const setSub = setStructureSub

  const [ddl, setDdl] = useState<string | null>(null)
  const [ddlLoading, setDdlLoading] = useState(false)
  const [prettyDdl, setPrettyDdl] = useState(false)

  // ── staged structure changes (columns + indexes, committed together) ──────
  // These live on the tab (store) so they survive switching tabs within a live
  // session — but are NOT persisted to disk (ADR 0012). `structDraft === null`
  // means "not seeded yet"; the effect below seeds it from the structure.
  const colDraft = tab?.structDraft ?? EMPTY_COLS
  const idxAdds = tab?.idxAdds ?? EMPTY_ADDS
  const idxDrops = useMemo(() => new Set(tab?.idxDrops ?? []), [tab?.idxDrops])
  const fkDrops = useMemo(() => new Set(tab?.fkDrops ?? []), [tab?.fkDrops])
  const [colFilter, setColFilter] = useState('')
  const [tmplOpen, setTmplOpen] = useState(false)

  // FK-backing index alert: shown when user drops an index that backs a FK
  const [fkBackingAlert, setFkBackingAlert] = useState<{
    indexName: string
    constraint: string
  } | null>(null)

  // add/edit-index dialog (editIdx = index into idxAdds, or null for a new one)
  const [addOpen, setAddOpen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [ixName, setIxName] = useState('')
  const [ixUnique, setIxUnique] = useState(false)
  const [ixCols, setIxCols] = useState<string[]>([])
  const [ixMethod, setIxMethod] = useState('')

  // commit / preview
  const [previewSql, setPreviewSql] = useState<string | null>(null)
  const [prettyPreview, setPrettyPreview] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)

  const driver = connections.find((c) => c.id === openConnectionId)?.driver
  const canAlter = driver !== 'sqlite'
  const canReorder = driver === 'mysql'

  // seed the draft from the structure the first time it loads. The store resets
  // structDraft to null on every structure (re)load (commit / refresh), so this
  // reseeds afterwards; switching tabs keeps the existing draft (not null).
  useEffect(() => {
    if (st && tab && tab.structDraft == null) setStructDraft(seed(st.columns))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, tab?.structDraft])

  const colOps = useMemo(
    () => (st ? diff(st.columns, colDraft, canAlter, canReorder) : []),
    [st, colDraft, canAlter, canReorder]
  )
  const movedNames = useMemo(
    () => new Set(colOps.filter((o) => o.kind === 'moveColumn').map((o) => o.name)),
    [colOps]
  )
  // order: drop FKs → drop indexes → column changes → add indexes
  // FK drops must precede index drops (MySQL requires FK gone before its backing index)
  const ops = useMemo<SchemaOp[]>(() => {
    // a constraint may already be dropped by colOps (Columns FK-toggle, or a
    // dropped FK column) — don't emit a second DROP FOREIGN KEY for it
    const colFkDrops = new Set(
      colOps.flatMap((o) => (o.kind === 'dropForeignKey' ? [o.constraint] : []))
    )
    return [
      ...[...fkDrops]
        .filter((c) => !colFkDrops.has(c))
        .map((c) => ({ kind: 'dropForeignKey', constraint: c }) as SchemaOp),
      ...[...idxDrops].map((name) => ({ kind: 'dropIndex', name }) as SchemaOp),
      ...colOps,
      ...idxAdds.map((spec) => ({ kind: 'addIndex', spec }) as SchemaOp)
    ]
  }, [fkDrops, idxDrops, colOps, idxAdds])

  // surface "has uncommitted schema changes" onto the tab (powers the dirty dot
  // + close-confirm). setStructDirty no-ops when the value is unchanged.
  useEffect(() => {
    setStructDirty(ops.length > 0)
  }, [ops, setStructDirty])

  // first relation row per constraint — a composite FK spans multiple rows
  // (one per column); show the drop toggle only once per constraint
  const firstFkRow = useMemo(() => {
    const m = new Map<string, number>()
    st?.relations.forEach((r, i) => {
      if (r.constraint && !m.has(r.constraint)) m.set(r.constraint, i)
    })
    return m
  }, [st])

  // fetch the structure if it isn't loaded yet — covers a restored tab opened
  // directly in structure view (setTabView, which normally fetches, isn't
  // called on workspace restore)
  useEffect(() => {
    if (tab && !tab.draft && !st && !tab.structureLoading && openConnectionId) {
      void refreshStructure()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, st, openConnectionId])

  // fetch referencedBy when its sub-tab is active (incl. on restore)
  useEffect(() => {
    if (sub === 'referencedBy') void fetchReferencedBy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, activeTabId])

  const entityKey = tab ? `${tab.entity.schema ?? ''}.${tab.entity.name}` : ''
  useEffect(() => {
    if (sub !== 'ddl' || !openConnectionId || !tab) return
    let live = true
    setDdlLoading(true)
    setDdl(null)
    window.api.sessions
      .getCreateSql(openConnectionId, tab.entity)
      .then((s) => live && setDdl(s))
      .catch((e) => live && setDdl(`-- ${e instanceof Error ? e.message : e}`))
      .finally(() => live && setDdlLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, openConnectionId, entityKey])

  if (!tab) return null

  // walkable relations: open the target table at the sub-tab that keeps walking
  // the same direction — Relations click (outbound) → land on Referenced by;
  // Referenced-by click (inbound) → land on Relations.
  const walkTo = (
    table: string,
    sub: 'relations' | 'referencedBy',
    schema?: string
  ): void => {
    const ref: EntityRef = { name: table, schema }
    void openTable(ref, undefined, { view: 'structure', structureSub: sub })
  }

  const connRow = connections.find((c) => c.id === openConnectionId)
  const readOnly = connRow?.readOnly ?? false
  const methods = INDEX_METHODS[connRow?.driver ?? ''] ?? []

  const toggleCol = (name: string): void =>
    setIxCols((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    )

  const resetIxForm = (): void => {
    setIxName('')
    setIxUnique(false)
    setIxCols([])
    setIxMethod('')
    setEditIdx(null)
  }

  const openAddIndex = (): void => {
    resetIxForm()
    setAddOpen(true)
  }

  const openEditIndex = (i: number): void => {
    const ix = idxAdds[i]
    setIxName(ix.name ?? '')
    setIxUnique(ix.unique)
    setIxCols(ix.columns)
    setIxMethod(ix.method ?? '')
    setEditIdx(i)
    setAddOpen(true)
  }

  const stageIndex = (): void => {
    if (ixCols.length === 0) return
    const spec: IndexSpec = {
      name: ixName.trim() || undefined,
      columns: ixCols,
      unique: ixUnique,
      method: ixMethod || undefined
    }
    setIdxAdds(
      editIdx === null
        ? [...idxAdds, spec]
        : idxAdds.map((s, i) => (i === editIdx ? spec : s))
    )
    setAddOpen(false)
    resetIxForm()
  }

  // a FK is backed by an index whose leftmost column is the FK column; MySQL also
  // names the auto-created backing index after the constraint. Match either —
  // false positives are harmless (the alert offers "Drop index only").
  const findBackingFk = (indexName: string): string | undefined => {
    const ix = st?.indexes.find((i) => i.name === indexName)
    const firstCol = ix?.columns[0]
    const rel = st?.relations.find(
      (r) => !!r.constraint && (r.constraint === indexName || r.column === firstCol)
    )
    return rel?.constraint
  }

  const stageDropIndex = (name: string): void => {
    const next = new Set(idxDrops)
    next.has(name) ? next.delete(name) : next.add(name)
    setIdxDrops([...next])
  }

  const toggleDropIndex = (name: string): void => {
    // If this index backs a FK and isn't already staged for drop, prompt to drop both
    if (!idxDrops.has(name)) {
      const constraint = findBackingFk(name)
      if (constraint) {
        setFkBackingAlert({ indexName: name, constraint })
        return
      }
    }
    stageDropIndex(name)
  }

  const toggleDropRelation = (constraint: string): void => {
    const next = new Set(fkDrops)
    next.has(constraint) ? next.delete(constraint) : next.add(constraint)
    setFkDrops([...next])
  }

  const discard = (): void => {
    setStructDraft(st ? seed(st.columns) : [])
    setIdxAdds([])
    setIdxDrops([])
    setFkDrops([])
  }

  const addColumn = (): void => {
    setStructDraft([...colDraft, { name: '', type: '', nullable: true, pk: false }])
    setColFilter('') // clear filter so the new (empty-name) row isn't hidden
    setStructureSub('columns')
  }

  // templates of the current engine (engine-locked)
  const engineTemplates = templates.filter((t) => t.engine === driver)

  // insert a template's columns as staged adds (PK/FK stripped, name collisions skipped)
  const insertTemplate = (id: string): void => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    const { next, added, skipped } = insertTemplateColumns(colDraft, t)
    setStructDraft(next)
    setColFilter('')
    setStructureSub('columns')
    if (added.length === 0)
      toast.error(`No columns added — all ${skipped.length} already exist`)
    else
      toast.success(
        `Added ${added.length} column(s)` +
          (skipped.length ? `, skipped ${skipped.length} (already exist)` : '')
      )
  }

  // the table's current columns, as template column specs (for "Save as template")
  const structureAsColumns = (): NewColumnSpec[] =>
    (st?.columns ?? []).map((c) => ({
      name: c.name,
      type: c.type ?? '',
      nullable: c.nullable,
      pk: c.pk,
      default: c.default ?? undefined
    }))

  const preview = async (): Promise<void> => {
    if (!openConnectionId || ops.length === 0) return
    setPreviewing(true)
    try {
      const { statements } = await window.api.sessions.previewAlter(
        openConnectionId,
        tab.entity,
        ops
      )
      setPrettyPreview(false)
      setPreviewSql(
        statements.length
          ? statements.map((s) => `${s};`).join('\n\n')
          : '-- no statements generated'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setPreviewing(false)
    }
  }

  const commit = async (): Promise<void> => {
    if (!openConnectionId || ops.length === 0) return
    setBusy(true)
    try {
      const { statements } = await window.api.sessions.alterTable(
        openConnectionId,
        tab.entity,
        ops
      )
      toast.success('Structure updated', { description: statements.join(';\n') })
      setPreviewSql(null)
      await refreshStructure()
      await refreshEntities()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-2 text-xs">
        {SUBS.map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className={cn(
              'rounded px-2 py-1',
              sub === s
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
          >
            {SUB_LABEL[s]}
            {st && (s === 'indexes' || s === 'relations') && (
              <span className="ml-1 text-muted-foreground/50">
                {s === 'indexes' ? st.indexes.length : st.relations.length}
              </span>
            )}
            {s === 'referencedBy' && tab.referencedBy && (
              <span className="ml-1 text-muted-foreground/50">
                {tab.referencedBy.length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => refreshStructure()}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Refresh structure"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 text-xs">
        {sub === 'ddl' ? (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center border-b border-border/60 px-3 py-1.5">
              <span className="text-muted-foreground">CREATE statement</span>
              <div className="flex-1" />
              <Button
                size="xs"
                variant={prettyDdl ? 'secondary' : 'ghost'}
                disabled={!ddl}
                onClick={() => setPrettyDdl((v) => !v)}
                title="Display formatted SQL; copied SQL remains exact"
              >
                <AlignLeft />
                Pretty
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={!ddl}
                onClick={() => {
                  if (ddl) {
                    void navigator.clipboard.writeText(ddl)
                    toast.success('Copied DDL')
                  }
                }}
              >
                <Copy />
                Copy
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {ddlLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : ddl ? (
                <SqlDisplay value={ddl} driver={driver} pretty={prettyDdl} />
              ) : null}
            </div>
          </div>
        ) : tab.structureLoading || !st ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : sub === 'columns' ? (
          <StructureEditor
            tab={tab}
            draft={colDraft}
            onDraftChange={setStructDraft}
            movedNames={movedNames}
            colFilter={colFilter}
            onColFilterChange={setColFilter}
          />
        ) : sub === 'indexes' ? (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center border-b border-border/60 px-3 py-1.5">
              <Button
                size="xs"
                variant="ghost"
                disabled={readOnly}
                onClick={openAddIndex}
              >
                <Plus />
                Add index
              </Button>
              {readOnly && <span className="ml-2 text-amber-500/80">read-only</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {st.indexes.length === 0 && idxAdds.length === 0 ? (
                <div className="px-3 py-3 text-muted-foreground">No indexes.</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-background text-muted-foreground">
                    <tr className="border-b border-border">
                      {th('Name')}
                      {th('Unique')}
                      {th('Method')}
                      {th('Columns')}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {st.indexes.map((ix) => {
                      const dropped = idxDrops.has(ix.name)
                      const isPrimary = ix.name === 'PRIMARY'
                      return (
                        <tr
                          key={ix.name}
                          className={cn(
                            'group border-b border-border/30',
                            dropped && 'bg-delete-row line-through'
                          )}
                        >
                          <td className="px-3 py-1 font-mono">{ix.name}</td>
                          <td className="px-3 py-1">
                            <Checkbox checked={ix.unique} disabled />
                          </td>
                          <td className="px-3 py-1 font-mono lowercase text-muted-foreground">
                            {ix.method ?? '—'}
                          </td>
                          <td className="px-3 py-1 font-mono text-muted-foreground">
                            {ix.columns.join(', ')}
                          </td>
                          <td className="px-3 py-1">
                            {!readOnly && !isPrimary && (
                              <button
                                onClick={() => toggleDropIndex(ix.name)}
                                title={dropped ? 'Undo drop' : 'Drop index'}
                                className={cn(
                                  'opacity-0 group-hover:opacity-100',
                                  dropped
                                    ? 'text-muted-foreground opacity-100 hover:text-foreground'
                                    : 'text-muted-foreground hover:text-destructive'
                                )}
                              >
                                {dropped ? (
                                  <Undo2 className="size-3.5" />
                                ) : (
                                  <Trash2 className="size-3.5" />
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {idxAdds.map((ix, i) => (
                      <tr key={`new-${i}`} className="group border-b border-border/30 bg-new-row">
                        <td className="px-3 py-1 font-mono">
                          {ix.name || (
                            <span className="text-muted-foreground/60">(auto)</span>
                          )}
                        </td>
                        <td className="px-3 py-1">
                          <Checkbox checked={ix.unique} disabled />
                        </td>
                        <td className="px-3 py-1 font-mono lowercase text-muted-foreground">
                          {ix.method ?? '—'}
                        </td>
                        <td className="px-3 py-1 font-mono text-muted-foreground">
                          {ix.columns.join(', ')}
                        </td>
                        <td className="px-3 py-1">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            <button
                              onClick={() => openEditIndex(i)}
                              title="Edit staged index"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setIdxAdds(idxAdds.filter((_, idx) => idx !== i))
                              }
                              title="Remove staged index"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : sub === 'relations' ? (
          <div className="flex h-full flex-col">
            {!canAlter && (
              <div className="shrink-0 border-b border-border/60 px-3 py-1.5 text-xs text-amber-500/80">
                SQLite cannot drop foreign keys
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {st.relations.length === 0 ? (
                <div className="px-3 py-3 text-muted-foreground">No relations.</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-background text-muted-foreground">
                    <tr className="border-b border-border">
                      {th('Column')}
                      {th('References')}
                      {th('On Update')}
                      {th('On Delete')}
                      {!readOnly && canAlter && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {st.relations.map((r, i) => {
                      const dropped = r.constraint ? fkDrops.has(r.constraint) : false
                      return (
                        <tr
                          key={i}
                          className={cn(
                            'group border-b border-border/30',
                            dropped && 'bg-delete-row line-through'
                          )}
                        >
                          <td className="px-3 py-1 font-mono">{r.column}</td>
                          <td className="px-3 py-1 font-mono">
                            <button
                              onClick={() => walkTo(r.refTable, 'referencedBy', r.refSchema)}
                              title={`Open ${r.refTable} structure`}
                              className="text-primary hover:underline"
                            >
                              {r.refTable}.{r.refColumn}
                            </button>
                          </td>
                          <td className="px-3 py-1 text-muted-foreground">
                            {r.onUpdate || '—'}
                          </td>
                          <td className="px-3 py-1 text-muted-foreground">
                            {r.onDelete || '—'}
                          </td>
                          {!readOnly && canAlter && (
                            <td className="px-3 py-1">
                              {r.constraint && firstFkRow.get(r.constraint) === i && (
                                <button
                                  onClick={() => toggleDropRelation(r.constraint!)}
                                  title={dropped ? 'Undo drop' : 'Drop relation'}
                                  className={cn(
                                    'opacity-0 group-hover:opacity-100',
                                    dropped
                                      ? 'text-muted-foreground opacity-100 hover:text-foreground'
                                      : 'text-muted-foreground hover:text-destructive'
                                  )}
                                >
                                  {dropped ? (
                                    <Undo2 className="size-3.5" />
                                  ) : (
                                    <Trash2 className="size-3.5" />
                                  )}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          /* referencedBy */
          <div className="h-full overflow-auto">
            {tab.referencedByLoading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : !tab.referencedBy || tab.referencedBy.length === 0 ? (
              <div className="px-3 py-3 text-muted-foreground">
                Nothing references this table.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-background text-muted-foreground">
                  <tr className="border-b border-border">
                    {th('Referencing table')}
                    {th('Column')}
                    {th('→ This column')}
                    {th('On Update')}
                    {th('On Delete')}
                  </tr>
                </thead>
                <tbody>
                  {tab.referencedBy.map((r, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-3 py-1 font-mono">
                        <button
                          onClick={() => walkTo(r.table, 'relations', r.schema)}
                          title={`Open ${r.table} structure`}
                          className="text-primary hover:underline"
                        >
                          {r.table}
                        </button>
                      </td>
                      <td className="px-3 py-1 font-mono text-muted-foreground">
                        {r.column}
                      </td>
                      <td className="px-3 py-1 font-mono text-muted-foreground">
                        {r.refColumn}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {r.onUpdate || '—'}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {r.onDelete || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* footer: Data/Structure switch (always) + commit controls (when editable) */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3 text-xs text-muted-foreground">
        <ViewSwitch view="structure" />
        {st && !readOnly && (
          <>
            {sub === 'columns' && (
            <>
              <Button size="xs" variant="ghost" onClick={addColumn} title="Add a column">
                <Plus />
                Add column
              </Button>
              {canAlter && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="ghost" title="Table templates">
                      <TableProperties />
                      Templates
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => setTmplOpen(true)}>
                      <TableProperties />
                      Save table as template…
                    </DropdownMenuItem>
                    {engineTemplates.length > 0 && <DropdownMenuSeparator />}
                    {engineTemplates.map((t) => (
                      <DropdownMenuItem key={t.id} onSelect={() => insertTemplate(t.id)}>
                        <Plus />
                        Insert “{t.name}” ({t.columns.length})
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
          <span>{ops.length} pending change(s)</span>
          <div className="flex-1" />
          <Button
            size="xs"
            onClick={() => void preview()}
            disabled={previewing || busy || ops.length === 0}
            title="Review the DDL, then commit"
          >
            {previewing ? <Loader2 className="animate-spin" /> : <Check />}
            Commit…
          </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={discard}
              disabled={busy || ops.length === 0}
            >
              <Undo2 />
              Discard
            </Button>
          </>
        )}
      </div>

      {/* Add-index dialog — stages the index (committed with the rest) */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAddOpen(false)
            resetIxForm()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editIdx === null ? 'Add index' : 'Edit index'}</DialogTitle>
            <DialogDescription>
              on <span className="font-mono">{tab.entity.name}</span> — staged until
              you commit
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={ixName}
              onChange={(e) => setIxName(e.target.value)}
              placeholder="Index name (optional — auto if blank)"
            />
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Columns {ixCols.length > 0 && `· ${ixCols.join(', ')}`}
              </p>
              <div className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border p-2">
                {(st?.columns ?? []).map((c) => (
                  <label
                    key={c.name}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={ixCols.includes(c.name)}
                      onCheckedChange={() => toggleCol(c.name)}
                    />
                    <span className="font-mono">{c.name}</span>
                    <span className="text-muted-foreground/60">{c.type}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={ixUnique}
                  onCheckedChange={(v) => setIxUnique(v === true)}
                />
                Unique
              </label>
              {methods.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Method</span>
                  <Select
                    value={ixMethod || 'default'}
                    onValueChange={(v) => setIxMethod(v === 'default' ? '' : v)}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <span className="truncate">{ixMethod || 'default'}</span>
                    </SelectTrigger>
                    <SelectContent className="w-[22rem]">
                      {['default', ...methods].map((m) => {
                        const reason = methodDisabledReason(
                          connRow?.driver,
                          m,
                          st?.engine
                        )
                        return (
                          <SelectItem
                            key={m}
                            value={m}
                            disabled={!!reason}
                            title={reason ?? undefined}
                            className="items-start py-1.5"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium lowercase">
                                {m}
                                {reason && (
                                  <span className="ml-1.5 rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
                                    unavailable
                                  </span>
                                )}
                              </span>
                              <span
                                className={cn(
                                  'text-[11px] leading-snug',
                                  reason ? 'text-amber-500/80' : 'text-muted-foreground'
                                )}
                              >
                                {reason ?? METHOD_DESC[m]}
                              </span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setAddOpen(false)
                resetIxForm()
              }}
            >
              Cancel
            </Button>
            <Button onClick={stageIndex} disabled={ixCols.length === 0}>
              {editIdx === null ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FK-backing index alert — drop the relation first or together */}
      <Dialog
        open={fkBackingAlert !== null}
        onOpenChange={(o) => !o && setFkBackingAlert(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Index backs a foreign key</DialogTitle>
            <DialogDescription>
              Index <span className="font-mono">{fkBackingAlert?.indexName}</span> is
              required by FK constraint{' '}
              <span className="font-mono">{fkBackingAlert?.constraint}</span>. The
              relation must be dropped first. Stage both?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFkBackingAlert(null)}>
              Cancel
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!fkBackingAlert) return
                // escape hatch: stage only the index (covers a false-positive
                // match, or a different index that also satisfies the FK)
                stageDropIndex(fkBackingAlert.indexName)
                setFkBackingAlert(null)
              }}
            >
              Drop index only
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!fkBackingAlert) return
                const nextFk = new Set(fkDrops)
                nextFk.add(fkBackingAlert.constraint)
                setFkDrops([...nextFk])
                const nextIdx = new Set(idxDrops)
                nextIdx.add(fkBackingAlert.indexName)
                setIdxDrops([...nextIdx])
                setFkBackingAlert(null)
              }}
            >
              Drop both
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save the table's columns as a reusable template */}
      <TemplateManager
        open={tmplOpen}
        onOpenChange={setTmplOpen}
        initialColumns={structureAsColumns()}
      />

      {/* DDL review sheet (shared with column commit) */}
      <Sheet open={previewSql !== null} onOpenChange={(o) => !o && setPreviewSql(null)}>
        <SheetContent
          side="right"
          className="w-[52vw] min-w-[34rem] gap-0 sm:max-w-[52vw]"
        >
          <SheetHeader className="border-b border-border">
            <div className="flex items-center gap-2">
              <SheetTitle>Review generated DDL</SheetTitle>
              <div className="flex-1" />
              <Button
                size="xs"
                variant={prettyPreview ? 'secondary' : 'ghost'}
                onClick={() => setPrettyPreview((v) => !v)}
                title="Display formatted SQL; executable and copied SQL remain exact"
              >
                <AlignLeft />
                Pretty
              </Button>
            </div>
            <SheetDescription>
              Exactly what will run on{' '}
              <span className="font-mono">{tab.entity.name}</span>, in one
              transaction. Nothing has run yet — review, then commit.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="rounded-md border border-border bg-card/40 p-3">
              {previewSql && (
                <SqlDisplay value={previewSql} driver={driver} pretty={prettyPreview} />
              )}
            </div>
          </div>
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (previewSql) {
                  void navigator.clipboard.writeText(previewSql)
                  toast.success('Copied DDL')
                }
              }}
            >
              <Copy />
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreviewSql(null)}>
              <X />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setPreviewSql(null)
                void commit()
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Commit
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
