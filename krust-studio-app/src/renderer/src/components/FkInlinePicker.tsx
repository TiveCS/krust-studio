import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  Loader2,
  Search,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FilterBar } from '@/components/FilterBar'
import { cn } from '@/lib/utils'
import type {
  ColumnInfo,
  EntityRef,
  Filter,
  Sort
} from '../../../shared/types'

const LIMIT = 50

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

interface Props {
  connId: string
  /** parent table being browsed */
  entity: EntityRef
  /** which parent column's value is written into the target cell */
  refColumn: string
  /** the FK cell's current value — its parent row is marked as selected */
  currentValue: unknown
  /** px to indent the box so it lines up with the first data column */
  offsetLeft: number
  /** visible width of the grid scroll container; box fills it minus the offset */
  containerWidth: number
  onPick: (value: unknown) => void
  /** open the referenced table in a full new tab */
  onOpenTable: () => void
  onClose: () => void
}

export function FkInlinePicker({
  connId,
  entity,
  refColumn,
  currentValue,
  offsetLeft,
  containerWidth,
  onPick,
  onOpenTable,
  onClose
}: Props): React.JSX.Element {
  const [term, setTerm] = useState('')
  const [filters, setFilters] = useState<Filter[]>([])
  const [orderBy, setOrderBy] = useState<Sort | null>(null)
  const [page, setPage] = useState(0)
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  const searching = term.trim().length > 0

  useEffect(() => {
    const t = setTimeout(() => void fetchRows(), searching ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, entity.name, entity.schema, term, filters, orderBy, page])

  async function fetchRows(): Promise<void> {
    const my = ++reqId.current
    setLoading(true)
    try {
      if (searching) {
        const res = await window.api.sessions.searchRows(
          connId,
          entity,
          term.trim(),
          LIMIT,
          page * LIMIT
        )
        if (my !== reqId.current) return
        setColumns(res.columns)
        setRows(res.rows)
      } else {
        const res = await window.api.sessions.readRows(
          connId,
          entity,
          LIMIT,
          page * LIMIT,
          filters,
          orderBy ? [orderBy] : undefined
        )
        if (my !== reqId.current) return
        setColumns(res.columns)
        setRows(res.rows)
      }
    } finally {
      if (my === reqId.current) setLoading(false)
    }
  }

  // quick search and the filter builder are mutually exclusive per query
  const onSearchChange = (v: string): void => {
    setTerm(v)
    if (v.trim()) {
      setFilters([])
      setOrderBy(null)
    }
    setPage(0)
  }
  const onApplyFilters = (f: Filter[]): void => {
    setTerm('')
    setFilters(f)
    setPage(0)
  }
  const toggleSort = (column: string): void => {
    if (searching) return
    setOrderBy((o) =>
      o?.column !== column
        ? { column, dir: 'asc' }
        : o.dir === 'asc'
          ? { column, dir: 'desc' }
          : null
    )
    setPage(0)
  }

  const curStr = currentValue == null ? null : String(currentValue)
  const isSelected = (row: Record<string, unknown>): boolean =>
    curStr != null && String(row[refColumn]) === curStr

  return (
    <div
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') onClose()
      }}
      style={{
        left: offsetLeft,
        width: containerWidth
          ? Math.max(420, containerWidth - offsetLeft - 20)
          : undefined
      }}
      className="sticky my-2.5 ml-2.5 flex flex-col overflow-hidden rounded-md border border-border bg-popover shadow-md"
    >
      {/* header: quick search + open-full + close */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={term}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`Search ${entity.name}…`}
          className="w-full bg-transparent text-xs outline-none"
        />
        {loading && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
        <Button
          size="xs"
          variant="ghost"
          onClick={onOpenTable}
          title={`Open ${entity.name} in a new tab`}
        >
          <ExternalLink />
          Open full
        </Button>
        <button
          onClick={onClose}
          title="Close"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* filter builder (dimmed while quick-searching — mutually exclusive) */}
      <div className={cn('shrink-0', searching && 'pointer-events-none opacity-40')}>
        <FilterBar
          key={`${entity.schema ?? ''}.${entity.name}-${searching ? 's' : 'f'}`}
          columns={columns}
          value={filters}
          onApply={onApplyFilters}
        />
      </div>

      <div className="max-h-64 overflow-auto p-1.5">
        {rows.length === 0 && !loading ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No matching rows.
          </div>
        ) : (
          <table className="min-w-full border-collapse font-mono text-[11px]">
            <thead className="sticky top-0 z-10 bg-popover">
              <tr className="border-b border-border">
                <th className="w-6" />
                {columns.map((c) => (
                  <th
                    key={c.name}
                    onClick={() => toggleSort(c.name)}
                    className={cn(
                      'px-2.5 py-1.5 text-left font-medium whitespace-nowrap text-muted-foreground',
                      !searching && 'cursor-pointer hover:text-foreground'
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {c.name}
                      {c.name === refColumn && (
                        <span className="text-[9px] text-primary">FK</span>
                      )}
                      {!searching &&
                        (orderBy?.column === c.name ? (
                          orderBy.dir === 'asc' ? (
                            <ArrowUp className="size-3 text-primary" />
                          ) : (
                            <ArrowDown className="size-3 text-primary" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-25" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const sel = isSelected(row)
                return (
                  <tr
                    key={i}
                    onClick={() => onPick(row[refColumn])}
                    className={cn(
                      'cursor-pointer border-b border-border/30 hover:bg-accent',
                      sel && 'bg-primary/15'
                    )}
                  >
                    <td className="px-1 text-center text-primary">
                      {sel && <Check className="mx-auto size-3.5" />}
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.name}
                        className={cn(
                          'max-w-[14rem] truncate px-2.5 py-1.5 whitespace-nowrap',
                          sel && 'font-medium text-foreground'
                        )}
                        title={cell(row[c.name])}
                      >
                        {cell(row[c.name])}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* pager */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-3 text-xs text-muted-foreground">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={page === 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          <ChevronLeft />
        </Button>
        <span>
          rows {page * LIMIT + (rows.length ? 1 : 0)}–{page * LIMIT + rows.length}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={rows.length < LIMIT || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight />
        </Button>
        <span className="text-muted-foreground/60">click a row to pick</span>
      </div>
    </div>
  )
}
