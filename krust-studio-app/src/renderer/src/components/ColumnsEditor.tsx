import { useState } from 'react'
import { Plus, X, Link2, ChevronRight, ChevronDown } from 'lucide-react'
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
import type { EnumType, NewColumnSpec } from '../../../shared/types'

/** a column row; `_orig` set => existing column (its original name) */
export type EditorColumn = NewColumnSpec & {
  _orig?: string
  /** last FK config, kept so toggling FK off then on restores it */
  _lastFk?: NewColumnSpec['fk']
}

const FK_ACTIONS = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']
const GRID =
  'grid grid-cols-[1fr_1fr_3.5rem_3.5rem_2.5rem_1.75rem_2rem] items-center gap-2'

export function ColumnsEditor({
  columns,
  onChange,
  types,
  tables,
  enums = [],
  readOnly = false,
  allowFk = true,
  canAlterExisting = true
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
}): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggleExpand = (i: number): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  const update = (i: number, p: Partial<EditorColumn>): void =>
    onChange(columns.map((c, idx) => (idx === i ? { ...c, ...p } : c)))
  const remove = (i: number): void =>
    onChange(columns.filter((_, idx) => idx !== i))
  const toggleFk = (i: number): void => {
    const c = columns[i]
    if (c.fk) update(i, { fk: undefined, _lastFk: c.fk })
    else update(i, { fk: c._lastFk ?? { refTable: '', refColumn: 'id' } })
  }

  return (
    <div className="space-y-1.5">
      <div className={cn(GRID, 'text-[10px] font-medium uppercase text-muted-foreground')}>
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
        const typeNullLocked = readOnly || (existing && !canAlterExisting)
        const pkLocked = readOnly || existing
        const colEnum = enumForType(c.type, enums)
        return (
          <div key={i} className="space-y-1.5">
            <div className={GRID}>
              <Input
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="column"
                className="h-7 text-xs"
                disabled={readOnly}
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
                  disabled={readOnly || !allowFk}
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
                    disabled={columns.length === 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <X className="size-3.5" />
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
