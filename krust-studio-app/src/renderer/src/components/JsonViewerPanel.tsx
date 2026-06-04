import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronRight,
  ChevronDown,
  Copy,
  CornerDownRight,
  Loader2,
  Regex,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ColumnInfo, ForeignKey } from '../../../shared/types'

const MIN_W = 280
const MAX_W = 900

/** Classify a value for tree rendering: object, array, or primitive. */
function classify(v: unknown): { kind: 'obj' | 'arr' | 'prim'; data: unknown } {
  // Date objects have no enumerable own-props → treat as primitive ISO string
  if (v instanceof Date)
    return { kind: 'prim', data: v.toISOString() }
  if (v && typeof v === 'object')
    return { kind: Array.isArray(v) ? 'arr' : 'obj', data: v }
  if (typeof v === 'string') {
    const t = v.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const parsed = JSON.parse(v)
        if (parsed && typeof parsed === 'object')
          return { kind: Array.isArray(parsed) ? 'arr' : 'obj', data: parsed }
      } catch {
        /* not JSON */
      }
    }
  }
  return { kind: 'prim', data: v }
}

function prim(v: unknown): React.ReactNode {
  if (v === null || v === undefined)
    return <span className="text-muted-foreground/50 italic">null</span>
  if (v === '') return <span className="text-muted-foreground/50 italic">empty</span>
  if (typeof v === 'number' || typeof v === 'bigint')
    return <span className="text-sky-400">{String(v)}</span>
  if (typeof v === 'boolean')
    return <span className="text-amber-400">{String(v)}</span>
  return <span className="text-emerald-300 break-all">{String(v)}</span>
}

/** Recursive renderer for plain JSON values (no FK awareness). */
function JsonValue({ value }: { value: unknown }): React.JSX.Element {
  const { kind, data } = classify(value)
  const [open, setOpen] = useState(false)
  if (kind === 'prim') return <>{prim(data)}</>
  const entries =
    kind === 'arr'
      ? (data as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(data as Record<string, unknown>)
  return (
    <span>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <span className="text-muted-foreground/60">
          {kind === 'arr' ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border/40 pl-2">
          {entries.map(([k, v]) => (
            <div key={k} className="py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span className="text-muted-foreground/40">: </span>
              <JsonValue value={v} />
            </div>
          ))}
        </div>
      )}
    </span>
  )
}

/** An FK field: raw value + caret that lazily expands the parent row inline. */
function FkExpand({
  connId,
  fk,
  value
}: {
  connId: string
  fk: ForeignKey
  value: unknown
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [parent, setParent] = useState<{
    columns: ColumnInfo[]
    row: Record<string, unknown> | null
    fks: ForeignKey[]
  } | null>(null)

  const toggle = async (): Promise<void> => {
    const next = !open
    setOpen(next)
    if (next && !parent) {
      setLoading(true)
      try {
        const res = await window.api.sessions.readRows(
          connId,
          { name: fk.refTable, schema: fk.refSchema },
          1,
          0,
          [{ column: fk.refColumn, op: 'eq', value: String(value) }]
        )
        setParent({
          columns: res.columns,
          row: res.rows[0] ?? null,
          fks: res.foreignKeys
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <>
      <span className="inline-flex items-center gap-1">
        {prim(value)}
        <button
          onClick={() => void toggle()}
          title={`Expand ${fk.refTable}`}
          className="text-primary/70 hover:text-primary"
        >
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <CornerDownRight className="size-3" />
          )}
        </button>
        {loading && <Loader2 className="size-3 animate-spin" />}
      </span>
      {open && parent && (
        <div className="mt-1 ml-3 rounded border border-border/50 bg-muted/20 p-1.5">
          <div className="mb-1 text-[10px] uppercase text-muted-foreground/60">
            {fk.refTable}
          </div>
          {parent.row ? (
            <RowFields
              connId={connId}
              columns={parent.columns}
              row={parent.row}
              foreignKeys={parent.fks}
            />
          ) : (
            <span className="text-xs text-muted-foreground">No matching row.</span>
          )}
        </div>
      )}
    </>
  )
}

function RowFields({
  connId,
  columns,
  row,
  foreignKeys,
  filter,
  isRegex
}: {
  connId: string
  columns: ColumnInfo[]
  row: Record<string, unknown>
  foreignKeys: ForeignKey[]
  filter?: string
  isRegex?: boolean
}): React.JSX.Element {
  const fkByCol = new Map(foreignKeys.map((f) => [f.column, f]))
  let test: (name: string) => boolean = () => true
  if (filter && filter.trim()) {
    if (isRegex) {
      try {
        const re = new RegExp(filter, 'i')
        test = (n) => re.test(n)
      } catch {
        test = () => true
      }
    } else {
      const q = filter.toLowerCase()
      test = (n) => n.toLowerCase().includes(q)
    }
  }
  const cols = columns.filter((c) => test(c.name))
  return (
    <div className="font-mono text-xs">
      {cols.map((c) => {
        const v = row[c.name]
        const fk = fkByCol.get(c.name)
        const hasVal = v !== null && v !== undefined && v !== ''
        const cls = classify(v)
        return (
          <div key={c.name} className="py-0.5">
            <span className="text-foreground/80">{c.name}</span>
            <span className="text-muted-foreground/40">: </span>
            {fk && hasVal ? (
              <FkExpand connId={connId} fk={fk} value={v} />
            ) : cls.kind === 'prim' ? (
              prim(v)
            ) : (
              <JsonValue value={v} />
            )}
          </div>
        )
      })}
      {cols.length === 0 && (
        <div className="text-muted-foreground">No matching keys.</div>
      )}
    </div>
  )
}

interface Props {
  connId: string
  columns: ColumnInfo[]
  row: Record<string, unknown>
  foreignKeys: ForeignKey[]
  title: string
  onClose: () => void
}

export function JsonViewerPanel({
  connId,
  columns,
  row,
  foreignKeys,
  title,
  onClose
}: Props): React.JSX.Element {
  const [width, setWidth] = useState(380)
  const [filter, setFilter] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = drag.current
      if (!d) return
      setWidth(Math.max(MIN_W, Math.min(MAX_W, d.startW - (e.clientX - d.startX))))
    }
    const onUp = (): void => {
      drag.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const copyJson = (): void => {
    const obj: Record<string, unknown> = {}
    for (const c of columns) obj[c.name] = row[c.name] ?? null
    void navigator.clipboard
      .writeText(JSON.stringify(obj, null, 2))
      .then(() => toast.success('Copied row JSON'))
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-l border-border bg-background"
      style={{ width }}
    >
      <span
        onMouseDown={(e) => {
          e.preventDefault()
          drag.current = { startX: e.clientX, startW: width }
        }}
        className="absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize hover:bg-ring"
      />
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="truncate text-xs font-medium">{title}</span>
        <div className="flex-1" />
        <Button size="icon-sm" variant="ghost" onClick={copyJson} title="Copy row JSON">
          <Copy />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClose} title="Close (Esc)">
          <X />
        </Button>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter keys…"
          className="w-full bg-transparent text-xs outline-none"
        />
        <button
          onClick={() => setIsRegex((r) => !r)}
          title="Regex"
          className={cn(
            'rounded p-0.5 hover:bg-accent',
            isRegex ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <Regex className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <RowFields
          connId={connId}
          columns={columns}
          row={row}
          foreignKeys={foreignKeys}
          filter={filter}
          isRegex={isRegex}
        />
      </div>
    </div>
  )
}
