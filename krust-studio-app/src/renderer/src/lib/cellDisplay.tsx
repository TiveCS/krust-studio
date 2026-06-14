// Type-aware data-cell rendering shared by the main grid (DataGrid) and the
// FK inline picker's mini table, so values read the same in both: numbers sky,
// booleans green/red, JSON violet, timestamps amber, and FK values indigo.

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

/** Render a cell value with type-aware colour. `fk` forces indigo (relations). */
export function display(v: unknown, fk = false): React.ReactNode {
  if (v === null || v === undefined)
    return <span className="italic text-muted-foreground/50">NULL</span>
  if (v === '')
    return <span className="italic text-muted-foreground/50">EMPTY</span>
  // FK values get one consistent colour (indigo) regardless of underlying type,
  // so relations read the same whether the key is a number, string, or uuid.
  if (fk) {
    const s =
      v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return <span className="text-indigo-400">{s}</span>
  }
  if (v instanceof Date) return dateSpan(v.toISOString(), v)
  if (typeof v === 'boolean')
    return <span className={v ? 'text-emerald-400' : 'text-rose-400'}>{String(v)}</span>
  if (typeof v === 'object')
    return <span className="text-violet-300">{JSON.stringify(v)}</span>
  if (typeof v === 'number')
    return <span className="text-sky-300 tabular-nums">{String(v)}</span>
  const s = String(v)
  if (ISO_RE.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? <span className="text-amber-300/90">{s}</span> : dateSpan(s, d)
  }
  return s
}
