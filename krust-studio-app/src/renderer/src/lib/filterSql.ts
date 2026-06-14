import type { DriverType, Filter, FilterOp } from '../../../shared/types'

/**
 * Client-side rendering of a structured `Filter[]` into an inlined WHERE
 * predicate string — the one-way seed for Builder → Raw mode (ADR-0017). This
 * is *display/seed* SQL (literals inlined, never parameterized); the user edits
 * it and the engine validates on Apply. It deliberately mirrors the grouping
 * logic of the backend `buildWhere` so the seed matches what Builder would run.
 */

const SQL_OP: Record<FilterOp, string> = {
  eq: '=',
  neq: '<>',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  like: 'LIKE',
  notlike: 'NOT LIKE',
  in: 'IN',
  between: 'BETWEEN',
  isnull: 'IS NULL',
  notnull: 'IS NOT NULL'
}

/** Engine-correct identifier quoting (backtick for mysql, double-quote else). */
export function quoteIdent(name: string, dialect: DriverType): string {
  if (dialect === 'mysql') return '`' + name.replace(/`/g, '``') + '`'
  return '"' + name.replace(/"/g, '""') + '"'
}

/** Inline a value as a SQL literal. Bare for finite numbers, else single-quoted. */
export function sqlLiteral(value: string): string {
  const t = value.trim()
  if (t !== '' && !Number.isNaN(Number(t))) return t
  return `'${value.replace(/'/g, "''")}'`
}

/** Render one structured condition (column · op · value) as an inlined predicate. */
function renderCondition(f: Filter, dialect: DriverType): string | null {
  if (!f.column) return null
  const col = quoteIdent(f.column, dialect)
  if (f.op === 'isnull' || f.op === 'notnull') return `${col} ${SQL_OP[f.op]}`
  if (f.op === 'in') {
    const vals = f.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
    if (!vals.length) return null
    return `${col} IN (${vals.map(sqlLiteral).join(', ')})`
  }
  if (f.op === 'between') {
    if (f.value === '' || (f.value2 ?? '') === '') return null
    return `${col} BETWEEN ${sqlLiteral(f.value)} AND ${sqlLiteral(f.value2 ?? '')}`
  }
  if (f.value === '') return null
  return `${col} ${SQL_OP[f.op]} ${sqlLiteral(f.value)}`
}

/**
 * Build the inlined WHERE predicate (no leading "WHERE") for a `Filter[]`,
 * bucketing contiguous segments by group and wrapping multi-row groups in
 * parens — the same single-level bracketing as the backend builder.
 */
export function filtersToWhere(filters: Filter[], dialect: DriverType): string {
  type Seg = { sql: string; conj: string; group: number; groupConj: string }
  const segs: Seg[] = []
  for (const f of filters) {
    const sql = renderCondition(f, dialect)
    if (!sql) continue
    segs.push({
      sql,
      conj: f.conj === 'or' ? 'OR' : 'AND',
      group: f.group ?? 0,
      groupConj: f.groupConj === 'or' ? 'OR' : 'AND'
    })
  }
  if (!segs.length) return ''
  const buckets: { groupConj: string; parts: Seg[] }[] = []
  for (const s of segs) {
    const last = buckets[buckets.length - 1]
    if (last && last.parts[0].group === s.group) last.parts.push(s)
    else buckets.push({ groupConj: s.groupConj, parts: [s] })
  }
  return buckets
    .map((b, bi) => {
      const inner = b.parts
        .map((p, pi) => (pi === 0 ? p.sql : ` ${p.conj} ${p.sql}`))
        .join('')
      const wrapped = b.parts.length > 1 ? `(${inner})` : inner
      return bi === 0 ? wrapped : ` ${b.groupConj} ${wrapped}`
    })
    .join('')
}

/**
 * Append an engine-quoted ` AND col = value` (or ` AND col IS NULL`) to an
 * existing raw predicate — the Raw-mode form of "Filter by this value".
 */
export function appendCellCondition(
  rawWhere: string,
  column: string,
  value: unknown,
  dialect: DriverType
): string {
  const col = quoteIdent(column, dialect)
  const cond =
    value === null || value === undefined
      ? `${col} IS NULL`
      : `${col} = ${sqlLiteral(String(value))}`
  return rawWhere.trim() ? `${rawWhere.trim()} AND ${cond}` : cond
}
