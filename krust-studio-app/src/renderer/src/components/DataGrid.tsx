import { Fragment, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Check,
  Undo2,
  Plus,
  X,
  RefreshCw,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Eye,
  Search,
  Download
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { JsonViewerPanel } from '@/components/JsonViewerPanel'
import { FkInlinePicker } from '@/components/FkInlinePicker'
import { ExportDialog } from '@/components/ExportDialog'
import { Combobox } from '@/components/ui/combobox'
import { enumValues } from '@/lib/enums'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { FilterBar } from '@/components/FilterBar'
import { cn } from '@/lib/utils'
import { useConnections, editKey } from '@/store/connections'

const ROWNUM_W = 48
const DEFAULT_COL_W = 180
const MIN_COL_W = 48

// looks like an ISO timestamp → render the readable part
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

/** tooltip: local + UTC, readable, for hovering a timestamp cell */
function dateTip(d: Date): string {
  return `Local: ${d.toLocaleString()}\nUTC:   ${d.toUTCString()}`
}

function dateSpan(text: string, d: Date): React.ReactNode {
  return (
    <span title={dateTip(d)} className="text-amber-300/90">
      {text}
    </span>
  )
}

function display(v: unknown): React.ReactNode {
  if (v === null || v === undefined)
    return <span className="italic text-muted-foreground/50">NULL</span>
  if (v === '')
    return <span className="italic text-muted-foreground/50">EMPTY</span>
  if (v instanceof Date) return dateSpan(v.toISOString(), v)
  if (typeof v === 'boolean')
    return (
      <span className={v ? 'text-emerald-400' : 'text-rose-400'}>
        {String(v)}
      </span>
    )
  if (typeof v === 'object')
    return <span className="text-violet-300">{JSON.stringify(v)}</span>
  if (typeof v === 'number')
    return <span className="text-sky-300 tabular-nums">{String(v)}</span>
  const s = String(v)
  if (ISO_RE.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime())
      ? <span className="text-amber-300/90">{s}</span>
      : dateSpan(s, d)
  }
  return s
}

function toText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

interface Sel {
  ar: number
  ac: number
  fr: number
  fc: number
}

export function DataGrid(): React.JSX.Element | null {
  const {
    connections,
    openConnectionId,
    tabs,
    activeTabId,
    pageSize,
    gotoPage,
    setPageSize,
    countRows,
    setFilters,
    setSort,
    openTable,
    setCellEdit,
    stageDeletes,
    addRow,
    setInsertCell,
    removeInsert,
    setColWidth,
    clearChanges,
    commitChanges
  } = useConnections()
  const dbEnums = useConnections((s) => s.enums)
  const tab = tabs.find((t) => t.id === activeTabId)
  const conn = connections.find((c) => c.id === openConnectionId)

  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [sel, setSel] = useState<Sel | null>(null)
  const [ctx, setCtx] = useState<{ r: number; c: number } | null>(null)
  const [modal, setModal] = useState<{ r: number; c: number } | null>(null)
  const [modalDraft, setModalDraft] = useState('')
  const [jsonOpen, setJsonOpen] = useState(false)
  const [fillOpen, setFillOpen] = useState(false)
  const [fillValue, setFillValue] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [fkTarget, setFkTarget] = useState<{ r: number; c: number } | null>(null)
  const [gridW, setGridW] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)

  const selecting = useRef(false)
  const colSelecting = useRef(false)
  const resizing = useRef<{
    col: string
    startX: number
    startW: number
    startTableW: number
    liveW: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  // live <col> elements, keyed by column name — mutated directly during resize
  const colEls = useRef<Map<string, HTMLTableColElement>>(new Map())

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const r = resizing.current
      if (!r) return
      // Resize via direct DOM writes — no React re-render per pixel (the grid
      // has up to 500 rows; a store update each mousemove was the lag source).
      const next = Math.max(MIN_COL_W, r.startW + (e.clientX - r.startX))
      r.liveW = next
      const colEl = colEls.current.get(r.col)
      if (colEl) colEl.style.width = `${next}px`
      if (tableRef.current)
        tableRef.current.style.width = `${r.startTableW + (next - r.startW)}px`
    }
    const onUp = (): void => {
      selecting.current = false
      colSelecting.current = false
      // Commit the resize to the store once on release
      if (resizing.current) setColWidth(resizing.current.col, resizing.current.liveW)
      resizing.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setColWidth])

  const tabError = tab?.error
  useEffect(() => {
    if (tabError) toast.error(tabError)
  }, [tabError])

  // FK browser auto-closes when its target cell can no longer be trusted:
  // tab switch, page change, or filter change (per FK Picker spec).
  useEffect(() => {
    setFkTarget(null)
  }, [activeTabId, tab?.pageIndex, tab?.filters])

  // reset per-grid local state when switching tabs (stale selection indices
  // would otherwise point at the wrong/missing rows of the new tab)
  useEffect(() => {
    setSel(null)
    setJsonOpen(false)
    setEditing(null)
  }, [activeTabId])

  // removing an insert row shifts row indices; the index-based FK target would
  // re-attach to a different row. Close the picker when an insert is removed.
  const prevInsCount = useRef(0)
  useEffect(() => {
    const n = tab?.inserts.length ?? 0
    if (n < prevInsCount.current) setFkTarget(null)
    prevInsCount.current = n
  }, [tab?.inserts.length])

  // track the scroll container's visible width so the inline FK picker can
  // fill it (out to the right edge) regardless of total table width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setGridW(el.clientWidth))
    ro.observe(el)
    setGridW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  if (!tab) return null

  const cols = tab.data?.columns ?? []
  const rows = tab.data?.rows ?? []
  const pk = tab.data?.primaryKey ?? []
  const realCount = rows.length
  const insCount = tab.inserts.length
  const total = insCount + realCount
  const insertCount = tab.inserts.filter((r) => Object.keys(r).length > 0).length
  const editCount =
    Object.keys(tab.edits).length + tab.deletes.length + insertCount
  const canEditReal = !conn?.readOnly && pk.length > 0
  const canInsert = !conn?.readOnly
  const colW = (name: string): number => tab.colWidths[name] ?? DEFAULT_COL_W
  const totalW = ROWNUM_W + cols.reduce((s, c) => s + colW(c.name), 0)
  const fkByCol = new Map((tab.data?.foreignKeys ?? []).map((f) => [f.column, f]))
  const enumValuesOf = (type?: string): string[] | null =>
    enumValues(type, dbEnums)
  const fkTargetCol = fkTarget ? cols[fkTarget.c] : null
  const fkTargetFk = fkTargetCol ? fkByCol.get(fkTargetCol.name) : undefined

  // insert rows render first (top); real rows after
  const isInsert = (r: number): boolean => r < insCount
  const insIdx = (r: number): number => r
  const realIdx = (r: number): number => r - insCount
  const cellEditable = (r: number): boolean =>
    isInsert(r) ? canInsert : canEditReal

  const valueAt = (r: number, c: number): unknown => {
    const name = cols[c].name
    if (isInsert(r)) {
      const row = tab.inserts[insIdx(r)]
      return row && name in row ? row[name] : undefined
    }
    const ri = realIdx(r)
    const key = editKey(ri, name)
    return key in tab.edits ? tab.edits[key] : rows[ri]?.[name]
  }
  const isEditedCell = (r: number, c: number): boolean => {
    const name = cols[c].name
    return isInsert(r)
      ? name in tab.inserts[insIdx(r)]
      : editKey(realIdx(r), name) in tab.edits
  }
  const setCellValue = (r: number, c: number, v: unknown): void => {
    const name = cols[c].name
    if (isInsert(r)) setInsertCell(insIdx(r), name, v)
    else setCellEdit(realIdx(r), name, v)
  }

  const rect = sel && {
    minR: Math.min(sel.ar, sel.fr),
    maxR: Math.max(sel.ar, sel.fr),
    minC: Math.min(sel.ac, sel.fc),
    maxC: Math.max(sel.ac, sel.fc)
  }
  const inSel = (r: number, c: number): boolean =>
    !!rect && r >= rect.minR && r <= rect.maxR && c >= rect.minC && c <= rect.maxC

  // data for the export dialog's "Selection" scope (the current cell range)
  const selectionData = rect
    ? {
        columns: cols.slice(rect.minC, rect.maxC + 1),
        rows: Array.from({ length: rect.maxR - rect.minR + 1 }, (_, i) => {
          const rr = rect.minR + i
          const o: Record<string, unknown> = {}
          for (let cc = rect.minC; cc <= rect.maxC; cc++)
            o[cols[cc].name] = valueAt(rr, cc)
          return o
        })
      }
    : null

  const rowFullySelected = (r: number): boolean =>
    !!rect &&
    r >= rect.minR &&
    r <= rect.maxR &&
    rect.minC === 0 &&
    rect.maxC === cols.length - 1

  const colFullySelected = (c: number): boolean =>
    !!rect &&
    c >= rect.minC &&
    c <= rect.maxC &&
    rect.minR === 0 &&
    rect.maxR === total - 1

  // Excel-style column selection from the header (click or drag across headers)
  const startColSelect = (c: number): void => {
    if (total === 0) return
    containerRef.current?.focus()
    colSelecting.current = true
    setSel({ ar: 0, ac: c, fr: total - 1, fc: c })
  }
  const extendColSelect = (c: number, buttonHeld: boolean): void => {
    // only extend while the primary button is actually held — guards against a
    // stuck colSelecting ref turning plain hover into selection
    if (!buttonHeld) {
      colSelecting.current = false
      return
    }
    if (!colSelecting.current) return
    setSel((s) => (s ? { ...s, ar: 0, fr: total - 1, fc: c } : s))
  }

  // one big box around the range; anchor cell gets a full outline
  const selStyle = (r: number, c: number): React.CSSProperties | undefined => {
    if (!rect || !sel || !inSel(r, c)) return undefined
    const col = 'var(--primary)'
    if (sel.ar === r && sel.ac === c)
      return { boxShadow: `inset 0 0 0 1.5px ${col}` }
    const s: string[] = []
    if (r === rect.minR) s.push(`inset 0 1px 0 0 ${col}`)
    if (r === rect.maxR) s.push(`inset 0 -1px 0 0 ${col}`)
    if (c === rect.minC) s.push(`inset 1px 0 0 0 ${col}`)
    if (c === rect.maxC) s.push(`inset -1px 0 0 0 ${col}`)
    return s.length ? { boxShadow: s.join(',') } : undefined
  }

  const startEdit = (r: number, c: number): void => {
    if (!cellEditable(r)) return
    setSel({ ar: r, ac: c, fr: r, fc: c })
    setEditing({ r, c })
    setDraft(toText(valueAt(r, c)))
  }
  const commitDraft = (): void => {
    if (editing) {
      if (draft !== toText(valueAt(editing.r, editing.c)))
        setCellValue(editing.r, editing.c, draft)
    }
    setEditing(null)
  }

  const selectedRows = (): number[] => {
    if (!rect) return []
    const out: number[] = []
    for (let r = rect.minR; r <= rect.maxR; r++) out.push(r)
    return out
  }

  // bulk-fill every editable cell in the selection with one value
  const applyFill = (value: unknown): void => {
    if (!rect) return
    for (let r = rect.minR; r <= rect.maxR; r++) {
      if (!cellEditable(r)) continue
      for (let c = rect.minC; c <= rect.maxC; c++) setCellValue(r, c, value)
    }
  }

  const deleteSelected = (): void => {
    const realDel: number[] = []
    const insDel: number[] = []
    for (const r of selectedRows()) {
      if (isInsert(r)) insDel.push(insIdx(r))
      else if (canEditReal) realDel.push(realIdx(r))
    }
    if (realDel.length) stageDeletes(realDel)
    insDel.sort((a, b) => b - a).forEach(removeInsert)
  }

  const writeClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  const copySelection = (): void => {
    if (!rect) return
    const lines: string[] = []
    let count = 0
    for (let r = rect.minR; r <= rect.maxR; r++) {
      const cells: string[] = []
      for (let c = rect.minC; c <= rect.maxC; c++) {
        cells.push(toText(valueAt(r, c)))
        count++
      }
      lines.push(cells.join('\t'))
    }
    void writeClipboard(lines.join('\n')).then(() =>
      toast.success(`Copied ${count} cell${count > 1 ? 's' : ''}`)
    )
  }

  const pasteSelection = async (): Promise<void> => {
    if (!rect) return
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      toast.error('Clipboard read blocked')
      return
    }
    if (!text) return
    const grid = text.replace(/\r/g, '').split('\n').map((l) => l.split('\t'))
    while (grid.length > 1 && grid[grid.length - 1].join('') === '') grid.pop()
    let n = 0
    for (let dr = 0; dr < grid.length; dr++) {
      for (let dc = 0; dc < grid[dr].length; dc++) {
        const r = rect.minR + dr
        const c = rect.minC + dc
        if (r >= total || c >= cols.length || !cellEditable(r)) continue
        setCellValue(r, c, grid[dr][dc])
        n++
      }
    }
    if (n) toast.success(`Pasted ${n} cell${n > 1 ? 's' : ''}`)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (editing) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'c') {
      copySelection()
      e.preventDefault()
    } else if (mod && e.key.toLowerCase() === 'v') {
      void pasteSelection()
      e.preventDefault()
    } else if (e.key === 'Delete') {
      if (rect) {
        deleteSelected()
        e.preventDefault()
      }
    } else if (e.key === ' ') {
      if (sel) {
        setJsonOpen((o) => !o)
        e.preventDefault()
      }
    } else if (e.key === 'Escape') {
      if (jsonOpen) setJsonOpen(false)
      else setSel(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        key={tab.id}
        columns={cols}
        value={tab.filters}
        onApply={(f) => void setFilters(f)}
      />

      <div className="flex min-h-0 flex-1">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={containerRef}
              className="min-h-0 min-w-0 flex-1 overflow-auto outline-none"
              tabIndex={0}
              onKeyDown={onKeyDown}
            >
              <table
                ref={tableRef}
                className="border-collapse font-mono text-xs"
                style={{ width: totalW, tableLayout: 'fixed' }}
              >
                <colgroup>
                  <col style={{ width: ROWNUM_W }} />
                  {cols.map((c) => (
                    <col
                      key={c.name}
                      ref={(el) => {
                        if (el) colEls.current.set(c.name, el)
                        else colEls.current.delete(c.name)
                      }}
                      style={{ width: colW(c.name) }}
                    />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-20 bg-background px-2 py-1.5 text-right font-normal text-muted-foreground/50">
                      #
                    </th>
                    {cols.map((c, ci) => (
                      <th
                        key={c.name}
                        className={cn(
                          'relative px-3 py-1.5 text-left font-medium whitespace-nowrap',
                          colFullySelected(ci)
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        <div className="flex w-full items-center gap-1 pr-1">
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault()
                              startColSelect(ci)
                            }}
                            onMouseEnter={(e) => extendColSelect(ci, e.buttons === 1)}
                            title={
                              enumValuesOf(c.type)
                                ? `enum: ${enumValuesOf(c.type)!.join(', ')}`
                                : 'Select column (drag to select more)'
                            }
                            className={cn(
                              'flex min-w-0 flex-1 items-center gap-1 select-none',
                              !colFullySelected(ci) && 'hover:text-foreground'
                            )}
                          >
                            <span className="truncate">{c.name}</span>
                            {pk.includes(c.name) && (
                              <span className="text-[9px] text-amber-500/70">PK</span>
                            )}
                            {fkByCol.has(c.name) && (
                              <span className="text-[9px] text-primary">FK</span>
                            )}
                            {enumValuesOf(c.type) && (
                              <span className="text-[9px] text-primary">ENUM</span>
                            )}
                            {c.type && (
                              <span className="truncate text-[10px] font-normal lowercase text-muted-foreground/45">
                                {c.type}
                                {c.nullable ? '?' : ''}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={(e) => setSort(c.name, e.shiftKey)}
                            title="Sort (Shift-click to add)"
                            className="flex shrink-0 items-center hover:text-foreground"
                          >
                            {(() => {
                              const si = tab.orderBy.findIndex(
                                (o) => o.column === c.name
                              )
                              if (si < 0)
                                return (
                                  <ChevronsUpDown className="size-3 opacity-25 hover:opacity-60" />
                                )
                              return (
                                <>
                                  {tab.orderBy[si].dir === 'asc' ? (
                                    <ArrowUp className="size-3 text-primary" />
                                  ) : (
                                    <ArrowDown className="size-3 text-primary" />
                                  )}
                                  {tab.orderBy.length > 1 && (
                                    <span className="text-[9px] text-primary">
                                      {si + 1}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </button>
                        </div>
                        <span
                          onMouseDown={(e) => {
                            e.preventDefault()
                            const w = colW(c.name)
                            resizing.current = {
                              col: c.name,
                              startX: e.clientX,
                              startW: w,
                              startTableW: tableRef.current?.offsetWidth ?? totalW,
                              liveW: w
                            }
                          }}
                          className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-ring"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: total }, (_, r) => {
                    const ins = isInsert(r)
                    const deleted = !ins && tab.deletes.includes(realIdx(r))
                    return (
                      <Fragment
                        key={ins ? `ins-${insIdx(r)}` : `row-${realIdx(r)}`}
                      >
                      <tr
                        className={cn(
                          'border-b border-border/30',
                          ins && 'bg-new-row',
                          deleted && 'bg-delete-row line-through'
                        )}
                      >
                        <td
                          onMouseDown={(e) => {
                            if (ins) return
                            containerRef.current?.focus()
                            if (e.shiftKey && sel)
                              setSel({ ...sel, fr: r, fc: cols.length - 1 })
                            else {
                              selecting.current = true
                              setSel({ ar: r, ac: 0, fr: r, fc: cols.length - 1 })
                            }
                          }}
                          onMouseEnter={(e) => {
                            if (selecting.current && !ins && e.buttons === 1)
                              setSel((s) =>
                                s && s.fr !== r
                                  ? { ...s, fr: r, fc: cols.length - 1 }
                                  : s
                              )
                          }}
                          onMouseMove={(e) => {
                            if (selecting.current && !ins && e.buttons === 1)
                              setSel((s) =>
                                s && s.fr !== r
                                  ? { ...s, fr: r, fc: cols.length - 1 }
                                  : s
                              )
                          }}
                          className={cn(
                            'sticky left-0 z-10 px-1 py-1 text-center select-none',
                            rowFullySelected(r)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background text-muted-foreground/40'
                          )}
                        >
                          {ins ? (
                            <button
                              onClick={() => removeInsert(insIdx(r))}
                              className="text-muted-foreground hover:text-destructive"
                              title="Remove new row"
                            >
                              <X className="size-3" />
                            </button>
                          ) : (
                            tab.pageIndex * pageSize + realIdx(r) + 1
                          )}
                        </td>
                        {cols.map((col, c) => {
                          const edited = isEditedCell(r, c)
                          const isEditing = editing?.r === r && editing?.c === c
                          const isFkTarget =
                            fkTarget?.r === r && fkTarget?.c === c
                          return (
                            <td
                              key={col.name}
                              onMouseDown={(e) => {
                                if (e.button !== 0 || isEditing) return
                                containerRef.current?.focus()
                                if (e.shiftKey && sel) setSel({ ...sel, fr: r, fc: c })
                                else {
                                  selecting.current = true
                                  setSel({ ar: r, ac: c, fr: r, fc: c })
                                }
                              }}
                              onMouseEnter={(e) => {
                                if (selecting.current && e.buttons === 1)
                                  setSel((s) =>
                                    s && (s.fr !== r || s.fc !== c)
                                      ? { ...s, fr: r, fc: c }
                                      : s
                                  )
                              }}
                              onMouseMove={(e) => {
                                if (selecting.current && e.buttons === 1)
                                  setSel((s) =>
                                    s && (s.fr !== r || s.fc !== c)
                                      ? { ...s, fr: r, fc: c }
                                      : s
                                  )
                              }}
                              onDoubleClick={() => startEdit(r, c)}
                              onContextMenu={() => {
                                setCtx({ r, c })
                                if (!inSel(r, c)) setSel({ ar: r, ac: c, fr: r, fc: c })
                              }}
                              style={selStyle(r, c)}
                              className={cn(
                                'group/cell relative overflow-hidden px-3 py-1 whitespace-nowrap text-ellipsis select-none',
                                edited && !ins && 'bg-edit-cell',
                                isFkTarget &&
                                  'outline outline-2 -outline-offset-2 outline-primary'
                              )}
                            >
                              {isEditing && enumValuesOf(col.type) ? (
                                <Combobox
                                  value={draft}
                                  onChange={(val) => setCellValue(r, c, val)}
                                  options={enumValuesOf(col.type) ?? []}
                                  creatable
                                  placeholder="value"
                                  autoOpen
                                  onOpenChange={(o) => !o && setEditing(null)}
                                  className="h-auto rounded-none border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                                />
                              ) : isEditing ? (
                                <input
                                  autoFocus
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={commitDraft}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitDraft()
                                    if (e.key === 'Escape') setEditing(null)
                                  }}
                                  className="w-full bg-transparent outline-none"
                                />
                              ) : (() => {
                                const v = valueAt(r, c)
                                const fk = fkByCol.get(col.name)
                                const hasVal =
                                  v !== null && v !== undefined && v !== ''
                                const showNav = fk && hasVal
                                const showPick =
                                  fk && cellEditable(r) && !!openConnectionId
                                if (!fk || (!showNav && !showPick))
                                  return display(v)
                                return (
                                  <span className="flex items-center justify-between gap-1">
                                    <span className="truncate">{display(v)}</span>
                                    <span className="flex shrink-0 items-center gap-0.5">
                                      {showPick && (
                                        <button
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setFkTarget((t) =>
                                              t && t.r === r && t.c === c
                                                ? null
                                                : { r, c }
                                            )
                                          }}
                                          title={`Pick from ${fk.refTable}`}
                                          className={cn(
                                            'hover:text-primary',
                                            isFkTarget
                                              ? 'text-primary'
                                              : 'text-muted-foreground',
                                            ins || isFkTarget
                                              ? 'opacity-100'
                                              : 'opacity-0 group-hover/cell:opacity-100'
                                          )}
                                        >
                                          <Search className="size-3" />
                                        </button>
                                      )}
                                      {showNav && (
                                        <button
                                          onMouseDown={(e) => e.stopPropagation()}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void openTable(
                                              {
                                                name: fk.refTable,
                                                schema: fk.refSchema
                                              },
                                              [
                                                {
                                                  column: fk.refColumn,
                                                  op: 'eq',
                                                  value: String(v)
                                                }
                                              ]
                                            )
                                          }}
                                          title={`Open ${fk.refTable}`}
                                          className="text-muted-foreground opacity-0 group-hover/cell:opacity-100 hover:text-primary"
                                        >
                                          <ExternalLink className="size-3" />
                                        </button>
                                      )}
                                    </span>
                                  </span>
                                )
                              })()}
                            </td>
                          )
                        })}
                      </tr>
                      {fkTarget?.r === r && fkTargetFk && openConnectionId && (
                        <tr>
                          <td colSpan={cols.length + 1} className="p-0">
                            <FkInlinePicker
                              key={fkTarget.c}
                              connId={openConnectionId}
                              entity={{
                                name: fkTargetFk.refTable,
                                schema: fkTargetFk.refSchema
                              }}
                              refColumn={fkTargetFk.refColumn}
                              currentValue={valueAt(fkTarget.r, fkTarget.c)}
                              offsetLeft={ROWNUM_W}
                              containerWidth={gridW}
                              onPick={(val) =>
                                setCellValue(fkTarget.r, fkTarget.c, val)
                              }
                              onOpenTable={(filters) =>
                                void openTable(
                                  { name: fkTargetFk.refTable, schema: fkTargetFk.refSchema },
                                  filters.length ? filters : undefined
                                )
                              }
                              onClose={() => setFkTarget(null)}
                            />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                  {total === 0 && !tab.loading && (
                    <tr>
                      <td
                        colSpan={cols.length + 1}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        No rows.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem disabled={!ctx} onSelect={() => setJsonOpen(true)}>
              <Eye />
              View row (JSON)
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!ctx || !cellEditable(ctx.r)}
              onSelect={() => {
                if (ctx) {
                  setModal(ctx)
                  setModalDraft(toText(valueAt(ctx.r, ctx.c)))
                }
              }}
            >
              Edit in editor…
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!ctx || !cellEditable(ctx.r)}
              onSelect={() => ctx && setCellValue(ctx.r, ctx.c, null)}
            >
              Set as NULL
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!rect}
              onSelect={() => {
                setFillValue('')
                setFillOpen(true)
              }}
            >
              Fill selection…
            </ContextMenuItem>
            <ContextMenuItem disabled={!rect} onSelect={() => applyFill(null)}>
              Fill selection NULL
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!ctx}
              onSelect={() => {
                if (!ctx) return
                const name = cols[ctx.c].name
                const v = valueAt(ctx.r, ctx.c)
                const f =
                  v === null || v === undefined
                    ? { column: name, op: 'isnull' as const, value: '' }
                    : { column: name, op: 'eq' as const, value: toText(v) }
                void setFilters([...tab.filters, f])
              }}
            >
              Filter by this value
            </ContextMenuItem>
            <ContextMenuItem disabled={!ctx} onSelect={copySelection}>
              Copy
            </ContextMenuItem>
            <ContextMenuItem disabled={!ctx} onSelect={() => void pasteSelection()}>
              Paste
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              disabled={!rect}
              onSelect={deleteSelected}
            >
              Delete row(s)
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {jsonOpen && sel && openConnectionId && (
          <JsonViewerPanel
            connId={openConnectionId}
            columns={cols}
            row={Object.fromEntries(
              cols.map((c, ci) => [c.name, valueAt(sel.ar, ci)])
            )}
            foreignKeys={tab.data?.foreignKeys ?? []}
            title={
              isInsert(sel.ar)
                ? 'New row'
                : `Row ${tab.pageIndex * pageSize + realIdx(sel.ar) + 1}`
            }
            onClose={() => setJsonOpen(false)}
          />
        )}
      </div>

      {openConnectionId && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          entityName={tab.entity.name}
          page={{ columns: cols, rows }}
          selection={selectionData}
          onFetchAll={() =>
            window.api.sessions.exportAllRows(
              openConnectionId,
              tab.entity,
              tab.filters,
              tab.orderBy.length ? tab.orderBy : undefined
            )
          }
        />
      )}

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3 text-xs text-muted-foreground">
        {canInsert && (
          <Button size="xs" variant="ghost" onClick={addRow}>
            <Plus />
            Add row
          </Button>
        )}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setExportOpen(true)}
          title="Export rows (CSV / JSON)"
        >
          <Download />
          Export
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => gotoPage(tab.pageIndex)}
          title="Refresh"
        >
          <RefreshCw />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={tab.pageIndex === 0 || tab.loading}
          onClick={() => gotoPage(0)}
          title="First page"
        >
          <ChevronsLeft />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={tab.pageIndex === 0 || tab.loading}
          onClick={() => gotoPage(tab.pageIndex - 1)}
        >
          <ChevronLeft />
        </Button>
        <span>
          rows {tab.pageIndex * pageSize + (realCount ? 1 : 0)}–
          {tab.pageIndex * pageSize + realCount}
          {tab.total != null ? (
            <> / {tab.total.toLocaleString()}</>
          ) : (
            <>
              {' / '}
              <button
                onClick={() => countRows()}
                disabled={tab.counting}
                className="underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
                title="Count all matching rows"
              >
                {tab.counting ? 'counting…' : '? count'}
              </button>
            </>
          )}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={realCount < pageSize || tab.loading}
          onClick={() => gotoPage(tab.pageIndex + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={
            tab.total == null ||
            tab.loading ||
            tab.pageIndex >= Math.ceil(tab.total / pageSize) - 1
          }
          onClick={() =>
            tab.total != null &&
            gotoPage(Math.max(0, Math.ceil(tab.total / pageSize) - 1))
          }
          title="Last page"
        >
          <ChevronsRight />
        </Button>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => setPageSize(Number(v))}
        >
          <SelectTrigger className="h-7 w-[5.5rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[50, 100, 500].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / pg
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tab.loading && <Loader2 className="size-3.5 animate-spin" />}
        <div className="flex-1" />
        {conn?.readOnly && <span className="text-amber-500/80">read-only</span>}
        {!conn?.readOnly && pk.length === 0 && (
          <span className="text-muted-foreground/70">no PK · edit/delete off</span>
        )}
        {editCount > 0 && (
          <>
            <span className="font-medium text-foreground">
              {insertCount}i · {Object.keys(tab.edits).length}e · {tab.deletes.length}d
            </span>
            <Button
              size="xs"
              onClick={() => setReviewOpen(true)}
              disabled={tab.committing}
            >
              {tab.committing ? <Loader2 className="animate-spin" /> : <Check />}
              Commit
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={clearChanges}
              disabled={tab.committing}
            >
              <Undo2 />
              Discard
            </Button>
          </>
        )}
      </div>

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {modal ? cols[modal.c]?.name : ''}</DialogTitle>
          </DialogHeader>
          <textarea
            value={modalDraft}
            onChange={(e) => setModalDraft(e.target.value)}
            rows={10}
            className="w-full resize-y rounded-md border border-input bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                if (modal) setCellValue(modal.r, modal.c, null)
                setModal(null)
              }}
            >
              Set NULL
            </Button>
            <Button
              onClick={() => {
                if (modal) setCellValue(modal.r, modal.c, modalDraft)
                setModal(null)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fillOpen} onOpenChange={setFillOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fill selection</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={fillValue}
            onChange={(e) => setFillValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyFill(fillValue)
                setFillOpen(false)
              }
            }}
            placeholder="value for every selected cell"
            className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFillOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                applyFill(fillValue)
                setFillOpen(false)
              }}
            >
              Fill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review changes</DialogTitle>
          </DialogHeader>
          {(() => {
            const byRow = new Map<number, Record<string, unknown>>()
            for (const [k, v] of Object.entries(tab.edits)) {
              const sep = k.indexOf('|')
              const ri = Number(k.slice(0, sep))
              if (tab.deletes.includes(ri)) continue
              const m = byRow.get(ri) ?? {}
              m[k.slice(sep + 1)] = v
              byRow.set(ri, m)
            }
            const pkOf = (ri: number): string =>
              pk.map((c) => `${c}=${toText(rows[ri]?.[c])}`).join(', ') ||
              `row ${ri + 1}`
            const inserts = tab.inserts.filter(
              (r) => Object.keys(r).length > 0
            )
            const total = byRow.size + tab.deletes.length + inserts.length
            return (
              <div className="space-y-3 text-xs">
                <p className="text-muted-foreground">
                  {total} row(s) affected · runs in one transaction (rolls back on
                  error).
                </p>
                <div className="max-h-72 space-y-2 overflow-auto">
                  {inserts.length > 0 && (
                    <div>
                      <p className="font-medium text-emerald-400">
                        Insert ({inserts.length})
                      </p>
                      {inserts.map((r, i) => (
                        <div key={i} className="ml-2 font-mono break-all text-muted-foreground">
                          {JSON.stringify(r)}
                        </div>
                      ))}
                    </div>
                  )}
                  {byRow.size > 0 && (
                    <div>
                      <p className="font-medium text-amber-400">
                        Update ({byRow.size})
                      </p>
                      {[...byRow].map(([ri, changes]) => (
                        <div key={ri} className="ml-2 font-mono">
                          <span className="text-muted-foreground/60">
                            {pkOf(ri)}
                          </span>
                          {Object.entries(changes).map(([col, to]) => (
                            <div key={col} className="ml-2">
                              {col}: <span className="text-muted-foreground/50">{toText(rows[ri]?.[col])}</span>
                              {' → '}
                              <span className="text-foreground">{toText(to)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {tab.deletes.length > 0 && (
                    <div>
                      <p className="font-medium text-rose-400">
                        Delete ({tab.deletes.length})
                      </p>
                      {tab.deletes.map((ri) => (
                        <div key={ri} className="ml-2 font-mono text-muted-foreground">
                          {pkOf(ri)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setReviewOpen(false)
                void commitChanges()
              }}
              disabled={tab.committing}
            >
              <Check />
              Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
