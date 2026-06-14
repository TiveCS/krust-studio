import { Fragment, useEffect, useRef, useState } from 'react'
import { Plus, X, Code, ListFilter, FilterX, Parentheses, Play } from 'lucide-react'
import { useUi } from '@/store/ui'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { ColumnInfo, Filter, FilterOp } from '../../../shared/types'

const OPS: { value: FilterOp; label: string; noValue?: boolean }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'like', label: 'LIKE' },
  { value: 'notlike', label: 'NOT LIKE' },
  { value: 'in', label: 'IN' },
  { value: 'between', label: 'BETWEEN' },
  { value: 'isnull', label: 'IS NULL', noValue: true },
  { value: 'notnull', label: 'IS NOT NULL', noValue: true }
]

function opNeedsValue(op: FilterOp): boolean {
  return !OPS.find((o) => o.value === op)?.noValue
}

type Row = { column: string; op: FilterOp; value: string; value2?: string; conj?: 'and' | 'or' }
type Group = { conj: 'and' | 'or'; rows: Row[] }

/** rebuild the group model from a flat Filter[] (grouped by `group`, contiguous) */
function seed(value: Filter[]): Group[] {
  const groups: Group[] = []
  let lastGroup: number | null = null
  for (const f of value) {
    const g = f.group ?? 0
    if (g !== lastGroup) {
      groups.push({ conj: f.groupConj ?? 'and', rows: [] })
      lastGroup = g
    }
    groups[groups.length - 1].rows.push({
      column: f.column,
      op: f.op,
      value: f.value,
      value2: f.value2,
      conj: f.conj
    })
  }
  return groups
}

/** flatten the group model back to Filter[] with group / conj / groupConj */
function flatten(groups: Group[]): Filter[] {
  const out: Filter[] = []
  groups.forEach((g, gi) =>
    g.rows.forEach((r, ri) => {
      if (!r.column) return
      out.push({
        column: r.column,
        op: r.op,
        value: r.value,
        value2: r.value2,
        group: gi,
        conj: ri > 0 ? (r.conj ?? 'and') : undefined,
        groupConj: ri === 0 ? g.conj : undefined
      })
    })
  )
  return out
}

function AndOr({
  value,
  onChange
}: {
  value: 'and' | 'or'
  onChange: (v: 'and' | 'or') => void
}): React.JSX.Element {
  return (
    <button
      onClick={() => onChange(value === 'and' ? 'or' : 'and')}
      title="Toggle AND / OR"
      className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
    >
      {value === 'or' ? 'OR' : 'AND'}
    </button>
  )
}

export function FilterBar({
  columns,
  value,
  onApply,
  mode = 'builder',
  rawWhere = '',
  filterError = null,
  onSetMode,
  onSetRawWhere,
  onApplyRaw
}: {
  columns: ColumnInfo[]
  value: Filter[]
  onApply: (filters: Filter[]) => void
  /** active mode; Raw support is opt-in (omit `onSetMode` for a builder-only bar) */
  mode?: 'builder' | 'raw'
  rawWhere?: string
  /** engine error from the last raw read — shown inline, last good rows kept */
  filterError?: string | null
  onSetMode?: (mode: 'builder' | 'raw') => void
  onSetRawWhere?: (text: string) => void
  onApplyRaw?: (text: string) => void
}): React.JSX.Element {
  // always-visible builder (no expand chevron): at rest, one empty condition row
  const seedGroups = (v: Filter[]): Group[] => {
    const g = seed(v)
    return g.length ? g : [{ conj: 'and', rows: [newRow()] }]
  }
  const [groups, setGroups] = useState<Group[]>(() => seedGroups(value))
  // remember the Filter[] we last emitted so our own Apply doesn't re-seed (and
  // clobber a fresh edit), while genuinely external changes (filter-by-cell,
  // clear, restore) do re-seed.
  const lastEmitted = useRef(JSON.stringify(value))
  useEffect(() => {
    const j = JSON.stringify(value)
    if (j !== lastEmitted.current) {
      lastEmitted.current = j
      setGroups(seedGroups(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function newRow(): Row {
    return { column: columns[0]?.name ?? '', op: 'eq', value: '' }
  }

  const setRow = (gi: number, ri: number, p: Partial<Row>): void =>
    setGroups((gs) =>
      gs.map((g, i) =>
        i === gi
          ? { ...g, rows: g.rows.map((r, j) => (j === ri ? { ...r, ...p } : r)) }
          : g
      )
    )
  const addRow = (gi: number): void =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, rows: [...g.rows, newRow()] } : g)))
  const removeRow = (gi: number, ri: number): void =>
    setGroups((gs) => {
      const next = gs
        .map((g, i) => (i === gi ? { ...g, rows: g.rows.filter((_, j) => j !== ri) } : g))
        .filter((g) => g.rows.length > 0)
      // keep one empty row at rest so the bar is never blank
      return next.length ? next : [{ conj: 'and', rows: [newRow()] }]
    })
  const setGroupConj = (gi: number, conj: 'and' | 'or'): void =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, conj } : g)))
  const addGroup = (): void =>
    setGroups((gs) => [...gs, { conj: 'and', rows: [newRow()] }])

  const apply = (): void => {
    const f = flatten(groups)
    lastEmitted.current = JSON.stringify(f)
    onApply(f)
  }
  const clear = (): void => {
    setGroups([{ conj: 'and', rows: [newRow()] }])
    lastEmitted.current = '[]'
    onApply([])
  }

  // ── Raw mode ──────────────────────────────────────────────────────────────
  // mirror external rawWhere (seed on mode-switch, filter-by-cell) into a local
  // edit buffer via the render-time adjustment pattern (no effect → no cascade)
  const [rawDraft, setRawDraft] = useState(rawWhere)
  const prevRaw = useRef(rawWhere)
  if (prevRaw.current !== rawWhere) {
    prevRaw.current = rawWhere
    setRawDraft(rawWhere)
  }
  const applyRaw = (): void => onApplyRaw?.(rawDraft)
  const clearRaw = (): void => {
    setRawDraft('')
    onApplyRaw?.('')
  }

  // filter.add command (Ctrl+Shift+F): switch to Builder, append a focused empty
  // condition to the last group, and focus its column picker.
  const builderRef = useRef<HTMLDivElement>(null)
  const addNonce = useUi((s) => s.filterAddNonce)
  const seenNonce = useRef(addNonce)
  useEffect(() => {
    if (addNonce === seenNonce.current) return
    seenNonce.current = addNonce
    if (mode === 'raw') onSetMode?.('builder')
    setGroups((gs) =>
      gs.length === 0
        ? [{ conj: 'and', rows: [newRow()] }]
        : gs.map((g, i) =>
            i === gs.length - 1 ? { ...g, rows: [...g.rows, newRow()] } : g
          )
    )
    requestAnimationFrame(() => {
      const cols = builderRef.current?.querySelectorAll<HTMLElement>('[data-filter-col]')
      cols?.[cols.length - 1]?.focus()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNonce])

  const rawMode = mode === 'raw'
  // icon-button shared style for the where-area control cluster
  const iconBtn =
    'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground'

  if (rawMode) {
    return (
      <div className="space-y-1 border-b border-border/60 bg-muted/10 px-2 py-1.5">
        <div className="flex items-center gap-1">
          {onSetMode && (
            <button
              className={iconBtn}
              title="Switch to Builder filter"
              onClick={() => onSetMode('builder')}
            >
              <ListFilter className="size-3.5" />
            </button>
          )}
          <button className={iconBtn} title="Clear filter" onClick={clearRaw}>
            <FilterX className="size-3.5" />
          </button>
          <button className={iconBtn} title="Apply (Enter)" onClick={applyRaw}>
            <Play className="size-3.5" />
          </button>
          <textarea
            value={rawDraft}
            // keep typing local (no store write per keystroke → no grid re-render
            // lag); persist the unapplied text on blur only
            onChange={(e) => setRawDraft(e.target.value)}
            onBlur={() => onSetRawWhere?.(rawDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                applyRaw()
              }
            }}
            rows={1}
            spellCheck={false}
            placeholder="WHERE predicate — wrapped in SELECT … LIMIT"
            className="h-7 min-h-7 flex-1 resize-y rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {filterError && (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 font-mono text-[11px] text-destructive">
            {filterError}
          </div>
        )}
      </div>
    )
  }

  // structured builder — control cluster (icons) then conditions flow horizontally
  return (
    <div
      ref={builderRef}
      className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/10 px-2 py-1.5"
    >
      {onSetMode && (
        <button
          className={iconBtn}
          title="Switch to Raw filter"
          onClick={() => onSetMode('raw')}
        >
          <Code className="size-3.5" />
        </button>
      )}
      <button className={iconBtn} title="Clear filter" onClick={clear}>
        <FilterX className="size-3.5" />
      </button>
      <button className={iconBtn} title="Add group" onClick={addGroup}>
        <Parentheses className="size-3.5" />
      </button>
      <button
        className={iconBtn}
        title="Add condition"
        onClick={() => addRow(groups.length - 1)}
      >
        <Plus className="size-3.5" />
      </button>
      <button className={iconBtn} title="Apply (Enter)" onClick={apply}>
        <Play className="size-3.5" />
      </button>
      <span className="mx-0.5 h-5 w-px shrink-0 bg-border/70" />

      {groups.map((g, gi) => {
        const multi = groups.length > 1
        return (
          <Fragment key={gi}>
            {gi > 0 && <AndOr value={g.conj} onChange={(v) => setGroupConj(gi, v)} />}
            <div
              className={cn(
                'flex flex-wrap items-center gap-1',
                multi && 'rounded-md border border-sky-400/45 bg-sky-400/[0.07] px-1.5 py-1'
              )}
            >
              {g.rows.map((r, ri) => (
                <Fragment key={ri}>
                  {ri > 0 && (
                    <AndOr
                      value={r.conj ?? 'and'}
                      onChange={(v) => setRow(gi, ri, { conj: v })}
                    />
                  )}
                  <Select value={r.column} onValueChange={(v) => setRow(gi, ri, { column: v })}>
                    <SelectTrigger
                      data-filter-col
                      className="h-6 w-24 gap-1 px-1.5 py-0 text-[11px]"
                    >
                      <SelectValue placeholder="column" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((c) => (
                        <SelectItem key={c.name} value={c.name} className="text-[11px]">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={r.op} onValueChange={(v) => setRow(gi, ri, { op: v as FilterOp })}>
                    <SelectTrigger className="h-6 w-20 gap-1 px-1.5 py-0 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-[11px]">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {opNeedsValue(r.op) && (
                    <Input
                      value={r.value}
                      onChange={(e) => setRow(gi, ri, { value: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && apply()}
                      placeholder={r.op === 'in' ? 'a, b, c' : 'value'}
                      className="h-6 w-64 px-1.5 py-0 text-[11px] md:text-[11px]"
                    />
                  )}
                  {r.op === 'between' && (
                    <>
                      <span className="text-[10px] text-muted-foreground">and</span>
                      <Input
                        value={r.value2 ?? ''}
                        onChange={(e) => setRow(gi, ri, { value2: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && apply()}
                        placeholder="value"
                        className="h-6 w-64 px-1.5 py-0 text-[11px] md:text-[11px]"
                      />
                    </>
                  )}
                  <button
                    onClick={() => removeRow(gi, ri)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                    title="Remove condition"
                  >
                    <X className="size-3" />
                  </button>
                </Fragment>
              ))}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
