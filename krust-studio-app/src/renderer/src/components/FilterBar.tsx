import { useEffect, useRef, useState } from 'react'
import { Plus, X, Filter as FilterIcon, ChevronDown, ChevronUp } from 'lucide-react'
import { useUi } from '@/store/ui'
import { Button } from '@/components/ui/button'
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
  onApply
}: {
  columns: ColumnInfo[]
  value: Filter[]
  onApply: (filters: Filter[]) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [groups, setGroups] = useState<Group[]>(seed(value))

  // resync from external filter changes (e.g. right-click "Filter by this value")
  // while collapsed; don't clobber an in-progress edit
  useEffect(() => {
    if (!expanded) setGroups(seed(value))
  }, [value, expanded])

  const newRow = (): Row => ({
    column: columns[0]?.name ?? '',
    op: 'eq',
    value: ''
  })

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
    setGroups((gs) =>
      gs
        .map((g, i) => (i === gi ? { ...g, rows: g.rows.filter((_, j) => j !== ri) } : g))
        .filter((g) => g.rows.length > 0)
    )
  const setGroupConj = (gi: number, conj: 'and' | 'or'): void =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, conj } : g)))
  const addGroup = (): void =>
    setGroups((gs) => [...gs, { conj: 'and', rows: [newRow()] }])

  const apply = (): void => onApply(flatten(groups))
  const clear = (): void => {
    setGroups([])
    onApply([])
  }
  const openBuilder = (): void => {
    if (groups.length === 0) setGroups([{ conj: 'and', rows: [newRow()] }])
    setExpanded(true)
  }

  // filter.add command (Ctrl+Shift+F): expand the builder + append a focused
  // empty condition to the last group (or seed the first group).
  const builderRef = useRef<HTMLDivElement>(null)
  const addNonce = useUi((s) => s.filterAddNonce)
  const seenNonce = useRef(addNonce)
  useEffect(() => {
    if (addNonce === seenNonce.current) return
    seenNonce.current = addNonce
    setExpanded(true)
    setGroups((gs) =>
      gs.length === 0
        ? [{ conj: 'and', rows: [newRow()] }]
        : gs.map((g, i) =>
            i === gs.length - 1 ? { ...g, rows: [...g.rows, newRow()] } : g
          )
    )
    requestAnimationFrame(() => {
      const cols = builderRef.current?.querySelectorAll<HTMLElement>(
        '[data-filter-col]'
      )
      cols?.[cols.length - 1]?.focus()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNonce])

  const count = groups.reduce((n, g) => n + g.rows.filter((r) => r.column).length, 0)

  return (
    <div className="border-b border-border/60">
      {/* compact bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
        <FilterIcon className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">
          {count === 0 ? 'No filters' : `${count} condition${count > 1 ? 's' : ''}`}
        </span>
        <Button size="xs" variant="ghost" onClick={() => (expanded ? setExpanded(false) : openBuilder())}>
          {expanded ? <ChevronUp /> : <ChevronDown />}
          Filter
        </Button>
        {count > 0 && !expanded && (
          <Button size="xs" variant="ghost" onClick={clear}>
            Clear
          </Button>
        )}
      </div>

      {/* builder */}
      {expanded && (
        <div
          ref={builderRef}
          className="space-y-2 border-t border-border/60 bg-muted/10 p-2"
        >
          {groups.map((g, gi) => (
            <div key={gi} className="flex items-start gap-1.5">
              {gi > 0 ? (
                <div className="pt-1.5">
                  <AndOr value={g.conj} onChange={(v) => setGroupConj(gi, v)} />
                </div>
              ) : (
                <span className="w-9" />
              )}
              <div className="flex-1 space-y-1 rounded-md border border-border bg-background p-2">
                {g.rows.map((r, ri) => (
                  <div key={ri} className="flex flex-wrap items-center gap-1">
                    {ri > 0 ? (
                      <AndOr
                        value={r.conj ?? 'and'}
                        onChange={(v) => setRow(gi, ri, { conj: v })}
                      />
                    ) : (
                      <span className="w-9 text-[10px] text-muted-foreground/60">where</span>
                    )}
                    <Select value={r.column} onValueChange={(v) => setRow(gi, ri, { column: v })}>
                      <SelectTrigger data-filter-col className="h-7 w-32 text-xs">
                        <SelectValue placeholder="column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={r.op} onValueChange={(v) => setRow(gi, ri, { op: v as FilterOp })}>
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
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
                        className="h-7 w-36 text-xs"
                      />
                    )}
                    {r.op === 'between' && (
                      <>
                        <span className="text-xs text-muted-foreground">and</span>
                        <Input
                          value={r.value2 ?? ''}
                          onChange={(e) => setRow(gi, ri, { value2: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && apply()}
                          placeholder="value"
                          className="h-7 w-36 text-xs"
                        />
                      </>
                    )}
                    <button
                      onClick={() => removeRow(gi, ri)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent"
                      title="Remove condition"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <Button size="xs" variant="ghost" onClick={() => addRow(gi)}>
                  <Plus />
                  Condition
                </Button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pl-10">
            <Button size="xs" variant="ghost" onClick={addGroup}>
              <Plus />
              Group
            </Button>
            <div className="flex-1" />
            <Button size="xs" variant="ghost" onClick={clear}>
              Clear
            </Button>
            <Button size="xs" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
