/**
 * MySQL column-definition surgery for the "unified MODIFY" alter path
 * (ADR-0011). We take a column's *verbatim* definition line from
 * `SHOW CREATE TABLE` and splice in only the attributes the user changed —
 * type, nullability, default — leaving everything else (AUTO_INCREMENT,
 * COLLATE, COMMENT, ON UPDATE, generated exprs) untouched **by construction**.
 *
 * A pure reposition (no type/null/default change) uses the verbatim def as-is,
 * so the common reorder case carries zero rewrite risk.
 */

/** matches the leading type token: `int`, `varchar(50)`, `enum('a','b')`,
 *  `decimal(10,2) unsigned zerofill`, … (heuristic; exotic types may need the
 *  commit review as the safety net). */
const TYPE_RE = /^\s*([A-Za-z]\w*(?:\s*\([^)]*\))?(?:\s+unsigned)?(?:\s+zerofill)?)/i

/** a DEFAULT clause's value: quoted string, parenthesised expr, or bare token */
const DEFAULT_RE =
  /\s*\bDEFAULT\s+('(?:[^'\\]|\\.|'')*'|\([^)]*\)|[^\s,]+)/i

/** extract one column's verbatim definition (everything after the `name`) from
 *  a SHOW CREATE TABLE body. Returns null if the column line isn't found. */
export function extractColumnDef(
  createSql: string,
  columnName: string
): string | null {
  const escaped = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // each column line: `  \`name\` <definition>,`  (trailing comma optional on last)
  const re = new RegExp(
    '^\\s*`' + escaped + '`\\s+(.+?),?\\s*$',
    'mi'
  )
  const m = createSql.match(re)
  return m ? m[1].trim() : null
}

/** replace the leading type token */
export function spliceType(def: string, newType: string): string {
  if (!TYPE_RE.test(def)) return `${newType} ${def}`.trim()
  return def.replace(TYPE_RE, `${newType}`).replace(/^\s+/, '')
}

/**
 * Insert `clause` just before the first trailing attribute in `boundary`
 * (so it lands after the type + COLLATE/CHARACTER SET but in the canonical slot).
 * Falls back to appending at the end.
 */
function insertBefore(def: string, clause: string, boundary: RegExp): string {
  const m = def.match(boundary)
  if (m && m.index !== undefined) {
    const head = def.slice(0, m.index).trimEnd()
    const tail = def.slice(m.index).trimStart()
    return `${head} ${clause} ${tail}`
  }
  return `${def.trimEnd()} ${clause}`
}

// trailing attributes, in the order they may appear after type+collate
const AFTER_NULL = /\b(DEFAULT|COMMENT|AUTO_INCREMENT|GENERATED|STORED|VIRTUAL)\b|\bON\s+UPDATE\b/i
const AFTER_DEFAULT = /\b(COMMENT|AUTO_INCREMENT|GENERATED|STORED|VIRTUAL)\b|\bON\s+UPDATE\b/i

/** ensure the def carries the desired nullability */
export function spliceNullable(def: string, nullable: boolean): string {
  const hasNotNull = /\bNOT\s+NULL\b/i.test(def)
  if (nullable) {
    return hasNotNull ? def.replace(/\s*\bNOT\s+NULL\b/i, '').trim() : def
  }
  if (hasNotNull) return def
  // place NOT NULL after type+COLLATE, before DEFAULT/COMMENT/… (canonical order)
  return insertBefore(def, 'NOT NULL', AFTER_NULL)
}

/** set the DEFAULT clause to `value` (raw expr, as the user typed it) */
export function spliceDefault(def: string, value: string): string {
  if (DEFAULT_RE.test(def)) {
    return def.replace(DEFAULT_RE, ` DEFAULT ${value}`).trim()
  }
  // new DEFAULT goes after NOT NULL, before COMMENT/AUTO_INCREMENT/ON UPDATE/…
  return insertBefore(def, `DEFAULT ${value}`, AFTER_DEFAULT)
}

/** remove the DEFAULT clause entirely */
export function dropDefault(def: string): string {
  return def.replace(DEFAULT_RE, '')
}

/** position clause for a MODIFY: undefined = keep, null = FIRST, else AFTER x */
export function positionClause(
  after: string | null | undefined,
  quote: (s: string) => string
): string {
  if (after === undefined) return ''
  if (after === null) return ' FIRST'
  return ` AFTER ${quote(after)}`
}
