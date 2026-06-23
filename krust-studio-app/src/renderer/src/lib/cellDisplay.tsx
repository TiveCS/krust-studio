// Type-aware data-cell rendering shared by the main grid (DataGrid) and the
// FK inline picker's mini table, so values read the same in both: numbers sky,
// booleans green/red, JSON violet, timestamps amber, and FK values indigo.

// looks like an ISO timestamp → render the readable part
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDateOnlyType(type?: string): boolean {
  return type?.trim().toLowerCase() === 'date'
}

/** tooltip: local + UTC, readable, for hovering a timestamp cell */
function dateTip(d: Date): string {
  return `Local: ${d.toLocaleString()}\nUTC:   ${d.toUTCString()}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dateLiteral(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function dateTimeLiteral(d: Date): string {
  const ms = d.getMilliseconds()
  const base = `${dateLiteral(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  return ms ? `${base}.${String(ms).padStart(3, '0')}` : base
}

function dateText(v: Date, columnType?: string): string {
  return isDateOnlyType(columnType) ? dateLiteral(v) : dateTimeLiteral(v)
}

export function cellText(v: unknown, columnType?: string): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return dateText(v, columnType)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function dateSpan(text: string, d: Date): React.ReactNode {
  return (
    <span title={dateTip(d)} className="text-amber-300/90">
      {text}
    </span>
  )
}

/** Render a cell value with type-aware colour. `fk` forces indigo (relations). */
export function display(v: unknown, fk = false, columnType?: string): React.ReactNode {
  if (v === null || v === undefined)
    return <span className="italic text-muted-foreground/50">NULL</span>
  if (v === '') return <span className="italic text-muted-foreground/50">EMPTY</span>
  // FK values get one consistent colour (indigo) regardless of underlying type,
  // so relations read the same whether the key is a number, string, or uuid.
  if (fk) {
    const s = cellText(v, columnType)
    return <span className="text-indigo-400">{s}</span>
  }
  if (v instanceof Date) return dateSpan(dateText(v, columnType), v)
  if (typeof v === 'boolean')
    return <span className={v ? 'text-emerald-400' : 'text-rose-400'}>{String(v)}</span>
  if (typeof v === 'object') return <span className="text-violet-300">{JSON.stringify(v)}</span>
  if (typeof v === 'number') return <span className="text-sky-300 tabular-nums">{String(v)}</span>
  const s = String(v)
  if (isDateOnlyType(columnType) && ISO_DATE_RE.test(s)) {
    const d = new Date(`${s}T00:00:00`)
    return isNaN(d.getTime()) ? <span className="text-amber-300/90">{s}</span> : dateSpan(s, d)
  }
  if (ISO_RE.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? <span className="text-amber-300/90">{s}</span> : dateSpan(s, d)
  }
  return s
}
