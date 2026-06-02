import type { ColumnInfo } from '../../../shared/types'

type Row = Record<string, unknown>

function scalar(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** RFC-4180-ish CSV. Values quoted when they contain comma/quote/newline. */
export function toCsv(columns: ColumnInfo[], rows: Row[]): string {
  const esc = (v: unknown): string => {
    const s = scalar(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = columns.map((c) => esc(c.name)).join(',')
  const body = rows.map((r) => columns.map((c) => esc(r[c.name])).join(','))
  return [head, ...body].join('\n')
}

/** JSON array of row objects (only the given columns, in order). */
export function toJson(columns: ColumnInfo[], rows: Row[]): string {
  const out = rows.map((r) => {
    const o: Row = {}
    for (const c of columns) o[c.name] = r[c.name] ?? null
    return o
  })
  return JSON.stringify(out, null, 2)
}

export function formatRows(
  format: 'csv' | 'json',
  columns: ColumnInfo[],
  rows: Row[]
): string {
  return format === 'csv' ? toCsv(columns, rows) : toJson(columns, rows)
}
