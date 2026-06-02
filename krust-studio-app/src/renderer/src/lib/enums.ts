import type { EnumType } from '../../../shared/types'

/**
 * Reduce a pg `format_type` string to the bare type name for matching against
 * `pg_enum` names: drop a trailing `[]` (array), surrounding double-quotes (pg
 * quotes mixed-case identifiers, e.g. `"purchaseStatus"`), and any schema prefix.
 */
function bareTypeName(type: string): string {
  let t = type.trim().replace(/\[\]$/, '').trim()
  t = t.replace(/"/g, '')
  const dot = t.lastIndexOf('.')
  if (dot >= 0) t = t.slice(dot + 1)
  return t
}

/** The named (pg) enum a column's type refers to, if any. */
export function enumForType(
  type: string | undefined,
  enums: EnumType[]
): EnumType | null {
  if (!type) return null
  const bare = bareTypeName(type)
  return enums.find((e) => e.name === bare) ?? null
}

/** Values of a MySQL inline enum type string: `enum('a','b','c')`. */
export function inlineEnumValues(type?: string): string[] | null {
  if (!type) return null
  const m = /^enum\((.+)\)$/i.exec(type.trim())
  if (!m) return null
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'(.*)'$/s, '$1').replace(/''/g, "'"))
}

/** Allowed values for a column type — named pg enum or mysql inline enum. */
export function enumValues(
  type: string | undefined,
  enums: EnumType[]
): string[] | null {
  return enumForType(type, enums)?.values ?? inlineEnumValues(type)
}
