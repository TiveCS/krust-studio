import { useState } from 'react'
import {
  Plus,
  X,
  Link2,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Undo2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { enumForType } from '@/lib/enums'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type {
  EnumType,
  NewColumnSpec,
  StructureColumn
} from '../../../shared/types'

/** a column row; `_orig` set => existing column (its original name) */
export type EditorColumn = NewColumnSpec & {
  _orig?: string
  /** last FK config, kept so toggling FK off then on restores it */
  _lastFk?: NewColumnSpec['fk']
  /** existing column staged for DROP — kept visible (red, struck) until commit */
  _drop?: boolean
}

/** has an existing column been edited vs its original definition? */
function rowChanged(c: EditorColumn, o: StructureColumn): boolean {
  if (c.name !== o.name) return true
  if ((c.type ?? '') !== (o.type ?? '')) return true
  if (c.nullable !== o.nullable) return true
  if (c.pk !== o.pk) return true
  if ((c.default ?? '') !== (o.default ?? '')) return true
  const cf = c.fk
  const of = o.fk
  if (!!cf !== !!of) return true
  if (
    cf &&
    of &&
    (cf.refTable !== of.refTable ||
      cf.refColumn !== of.refColumn ||
      (cf.onUpdate ?? '') !== (of.onUpdate ?? '') ||
      (cf.onDelete ?? '') !== (of.onDelete ?? ''))
  )
    return true
  return false
}

const FK_ACTIONS = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']
const BASE_GRID = 'grid items-center gap-2'
const COLS = '1fr 1fr 3.5rem 3.5rem 2.5rem 1.75rem 2rem'

export function ColumnsEditor({
  columns,
  onChange,
  types,
  tables,
  enums = [],
  readOnly = false,
  allowFk = true,
  canAlterExisting = true,
  reorderable = false,
  original,
  movedNames
}: {
  columns: EditorColumn[]
  onChange: (cols: EditorColumn[]) => void
  types: string[]
  tables: string[]
  /** named enum types (for badge + allowed-values display) */
  enums?: EnumType[]
  readOnly?: boolean
  /** allow toggling/editing foreign keys */
  allowFk?: boolean
  /** engine can change an existing column's type/nullability */
  canAlterExisting?: boolean
  /** show a drag handle to reorder rows (new-table any engine; existing = MySQL) */
  reorderable?: boolean
  /** original columns — when provided, rows highlight as new (green) / changed
   *  (amber) / dropped (red) / moved (blue) vs this baseline (structure-edit
   *  context; omit for new-table). Also enables drop-keeps-the-row behavior. */
  original?: StructureColumn[]
  /** current names of reordered columns (for the moved-row highlight) */
  movedNames?: Set<string>
}): React.JSX.Element {
  const origByName = new Map((original ?? []).map((o) => [o.name, o]))
  // grid template gains a leading grip column when reorderable (inline style:
  // Tailwind can't JIT a dynamically-built arbitrary class)
  const gridTemplate = reorderable ? `1.25rem ${COLS}` : COLS
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  // move `from` so it lands at `toRaw` in the ORIGINAL indexing (i = before row
  // i, i+1 = after). Adjusts for the gap left when the dragged item is removed.
  const moveTo = (from: number, toRaw: number): void => {
    let to = toRaw
    if (from < toRaw) to -= 1
    if (from === to) return
    const next = [...columns]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    onChange(next)
  }
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggleExpand = (i: number): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  const update = (i: number, p: Partial<EditorColumn>): void =>
    onChange(columns.map((c, idx) => (idx === i ? { ...c, ...p } : c)))
  const remove = (i: number): void => {
    const c = columns[i]
    // existing column in structure-edit context → stage DROP (toggle), keep row;
    // a brand-new/uncommitted row (or new-table) → hard-remove
    if (original && c._orig) update(i, { _drop: !c._drop })
    else onChange(columns.filter((_, idx) => idx !== i))
  }
  const toggleFk = (i: number): void => {
    const c = columns[i]
    if (c.fk) update(i, { fk: undefined, _lastFk: c.fk })
    else update(i, { fk: c._lastFk ?? { refTable: '', refColumn: 'id' } })
  }

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          BASE_GRID,
          'px-1 text-[10px] font-medium uppercase text-muted-foreground'
        )}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {reorderable && <span />}
        <span>Name</span>
        <span>Type</span>
        <span className="text-center">Null</span>
        <span className="text-center">PK</span>
        <span className="text-center">FK</span>
        <span />
        <span />
      </div>
      {columns.map((c, i) => {
        const existing = !!c._orig
        const dropped = !!c._drop
        const typeNullLocked = readOnly || dropped || (existing && !canAlterExisting)
        const pkLocked = readOnly || dropped || existing
        const colEnum = enumForType(c.type, enums)
        // diff highlight (structure-edit context only — `original` provided)
        const orig = existing ? origByName.get(c._orig as string) : undefined
        const status: 'new' | 'changed' | 'moved' | 'drop' | null = dropped
          ? 'drop'
          : original
            ? !existing
              ? 'new'
              : orig && rowChanged(c, orig)
                ? 'changed'
                : c.name && movedNames?.has(c.name)
                  ? 'moved'
                  : null
            : null
        return (
          <div key={i} className="space-y-1.5">
            <div
              className={cn(
                BASE_GRID,
                'rounded px-1',
                status === 'new' && 'bg-new-row',
                status === 'changed' && 'bg-edit-cell',
                status === 'moved' && 'bg-moved-row',
                status === 'drop' && 'bg-delete-row line-through',
                overIndex === i && dragIndex !== null && 'ring-1 ring-primary/60'
              )}
              style={{ gridTemplateColumns: gridTemplate }}
              onDragOver={
                reorderable && dragIndex !== null
                  ? (e) => {
                      e.preventDefault()
                      setOverIndex(i)
                    }
                  : undefined
              }
              onDrop={
                reorderable && dragIndex !== null
                  ? (e) => {
                      e.preventDefault()
                      // drop on lower half of the row → place AFTER it (lets you
                      // reach the very last position)
                      const r = e.currentTarget.getBoundingClientRect()
                      const after = e.clientY > r.top + r.height / 2
                      moveTo(dragIndex, after ? i + 1 : i)
                      setDragIndex(null)
                      setOverIndex(null)
                    }
                  : undefined
              }
            >
              {reorderable && (
                <button
                  type="button"
                  draggable={!readOnly && !dropped}
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setOverIndex(null)
                  }}
                  title="Drag to reorder"
                  className="flex cursor-grab justify-center text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
                >
                  <GripVertical className="size-3.5" />
                </button>
              )}
              <Input
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="column"
                className="h-7 text-xs"
                disabled={readOnly || dropped}
              />
              <Combobox
                value={c.type}
                onChange={(v) => update(i, { type: v })}
                options={types}
                placeholder="type"
                creatable
                disabled={typeNullLocked}
              />
              <div className="flex justify-center">
                <Checkbox
                  checked={c.nullable}
                  onCheckedChange={(v) => update(i, { nullable: !!v })}
                  disabled={typeNullLocked}
                />
              </div>
              <div className="flex justify-center">
                <Checkbox
                  checked={c.pk}
                  onCheckedChange={(v) => update(i, { pk: !!v })}
                  disabled={pkLocked}
                />
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => toggleFk(i)}
                  disabled={readOnly || dropped || !allowFk}
                  title={allowFk ? 'Foreign key' : 'FK editing not available here'}
                  className={cn(
                    'rounded p-1 hover:bg-accent disabled:opacity-30',
                    c.fk ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <Link2 className="size-3.5" />
                </button>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => toggleExpand(i)}
                  title="More (default, auto-increment)"
                  className={cn(
                    'rounded p-1 hover:bg-accent',
                    c.default || c.autoInc || colEnum
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  {expanded.has(i) ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
              </div>
              <div className="flex justify-center">
                {!readOnly && (
                  <button
                    onClick={() => remove(i)}
                    disabled={!dropped && columns.length === 1}
                    title={dropped ? 'Undo drop' : 'Drop column'}
                    className={cn(
                      'disabled:opacity-30',
                      dropped
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'text-muted-foreground hover:text-destructive'
                    )}
                  >
                    {dropped ? (
                      <Undo2 className="size-3.5" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {c.fk && (
              <div className="ml-4 grid grid-cols-[auto_1fr_1fr_1fr_1fr] items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
                <span className="text-[10px] uppercase text-muted-foreground">
                  references
                </span>
                <Combobox
                  value={c.fk.refTable}
                  onChange={(v) => update(i, { fk: { ...c.fk!, refTable: v } })}
                  options={tables}
                  placeholder="table"
                  creatable
                  disabled={readOnly || !allowFk}
                />
                <Combobox
                  value={c.fk.refColumn}
                  onChange={(v) => update(i, { fk: { ...c.fk!, refColumn: v } })}
                  options={['id']}
                  placeholder="column"
                  creatable
                  disabled={readOnly || !allowFk}
                />
                <Select
                  value={c.fk.onUpdate}
                  onValueChange={(v) => update(i, { fk: { ...c.fk!, onUpdate: v } })}
                  disabled={readOnly || !allowFk}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="on update" />
                  </SelectTrigger>
                  <SelectContent>
                    {FK_ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={c.fk.onDelete}
                  onValueChange={(v) => update(i, { fk: { ...c.fk!, onDelete: v } })}
                  disabled={readOnly || !allowFk}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="on delete" />
                  </SelectTrigger>
                  <SelectContent>
                    {FK_ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {expanded.has(i) && (
              <div className="ml-4 flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
                {colEnum && (
                  <span className="flex items-center gap-1.5">
                    <span className="rounded bg-primary/15 px-1 text-[9px] uppercase text-primary">
                      enum
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {colEnum.values.join(' · ')}
                    </span>
                  </span>
                )}
                <span className="text-[10px] uppercase text-muted-foreground">
                  default
                </span>
                <Input
                  value={c.default ?? ''}
                  onChange={(e) => update(i, { default: e.target.value })}
                  placeholder="expr — 0, now(), 'active'"
                  className="h-7 w-56 text-xs"
                  disabled={typeNullLocked}
                />
                {!existing ? (
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={!!c.autoInc}
                      onCheckedChange={(v) => update(i, { autoInc: !!v })}
                      disabled={readOnly}
                    />
                    Auto-increment
                  </label>
                ) : (
                  <span className="text-muted-foreground/60">
                    auto-increment is set at create time
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
      {!readOnly && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() =>
            onChange([
              ...columns,
              { name: '', type: types[0] ?? '', nullable: true, pk: false }
            ])
          }
        >
          <Plus />
          Add column
        </Button>
      )}
    </div>
  )
}
