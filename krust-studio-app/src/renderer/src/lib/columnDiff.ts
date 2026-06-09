import type { EditorColumn } from '@/components/ColumnsEditor'
import type { SchemaOp, StructureColumn } from '../../../shared/types'

/** seed editor rows from the introspected columns (existing → `_orig` set) */
export function seed(cols: StructureColumn[]): EditorColumn[] {
  return cols.map((c) => ({
    name: c.name,
    type: c.type ?? '',
    nullable: c.nullable,
    pk: c.pk,
    default: c.default ?? undefined,
    fk: c.fk
      ? {
          refTable: c.fk.refTable,
          refColumn: c.fk.refColumn,
          onUpdate: c.fk.onUpdate,
          onDelete: c.fk.onDelete,
          constraint: c.fk.constraint
        }
      : undefined,
    _orig: c.name
  }))
}

type Fk = NonNullable<EditorColumn['fk']>
function fkSame(a: Fk, b: Fk): boolean {
  return (
    a.refTable === b.refTable &&
    a.refColumn === b.refColumn &&
    (a.onUpdate || '') === (b.onUpdate || '') &&
    (a.onDelete || '') === (b.onDelete || '')
  )
}
function addFkOp(col: string, fk: Fk): SchemaOp {
  return {
    kind: 'addForeignKey',
    column: col,
    refTable: fk.refTable,
    refColumn: fk.refColumn,
    onUpdate: fk.onUpdate,
    onDelete: fk.onDelete
  }
}

/** indices (into a reference order) that form a longest increasing subsequence */
function lisKeepSet(seq: number[]): Set<number> {
  const tails: number[] = []
  const prev: number[] = new Array(seq.length).fill(-1)
  const idxOfLen: number[] = []
  for (let i = 0; i < seq.length; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (seq[idxOfLen[mid]] < seq[i]) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo > 0 ? idxOfLen[lo - 1] : -1
    idxOfLen[lo] = i
    if (lo === tails.length) tails.push(i)
    else tails[lo] = i
  }
  const keep = new Set<number>()
  let k = idxOfLen.length ? idxOfLen[idxOfLen.length - 1] : -1
  while (k !== -1) {
    keep.add(k)
    k = prev[k]
  }
  return keep
}

/** emit minimal moveColumn ops to turn the DB column order into the draft order
 *  (existing columns only; MySQL-only — gated by canReorder). */
function diffMoves(orig: StructureColumn[], draft: EditorColumn[]): SchemaOp[] {
  const keptOrig = orig
    .filter((o) => draft.some((d) => d._orig === o.name && !d._drop))
    .map((o) => o.name)
  const targetOrig = draft
    .filter((d) => d._orig && !d._drop)
    .map((d) => d._orig as string)
  if (
    keptOrig.length !== targetOrig.length ||
    keptOrig.every((n, i) => n === targetOrig[i])
  )
    return []

  const origIndex = new Map(keptOrig.map((n, i) => [n, i]))
  const seq = targetOrig.map((n) => origIndex.get(n) ?? -1)
  const keep = lisKeepSet(seq)
  const newNameOf = (origName: string): string =>
    draft.find((d) => d._orig === origName)?.name ?? origName

  const ops: SchemaOp[] = []
  for (let i = 0; i < targetOrig.length; i++) {
    if (keep.has(i)) continue
    const after = i === 0 ? null : newNameOf(targetOrig[i - 1])
    ops.push({ kind: 'moveColumn', name: newNameOf(targetOrig[i]), after })
  }
  return ops
}

/** diff draft column rows against the original columns → SchemaOp[] */
export function diff(
  orig: StructureColumn[],
  draft: EditorColumn[],
  canAlter: boolean,
  canReorder: boolean
): SchemaOp[] {
  const ops: SchemaOp[] = []
  // dropped = original column missing from draft, OR present but staged `_drop`.
  // A dropped column that backs a foreign key must drop the FK first, or the
  // engine refuses the column drop ("needed in a foreign key constraint" on
  // MySQL). The backing index is removed by the engine together with the column.
  for (const o of orig) {
    const d = draft.find((x) => x._orig === o.name)
    if (!d || d._drop) {
      if (canAlter && o.fk?.constraint)
        ops.push({ kind: 'dropForeignKey', constraint: o.fk.constraint })
      ops.push({ kind: 'dropColumn', name: o.name })
    }
  }
  // running name of the previous non-dropped row, for positioning new columns
  let prevName: string | null = null
  for (const d of draft) {
    if (d._drop) continue
    if (!d._orig) {
      if (d.name.trim() && d.type.trim()) {
        ops.push({
          kind: 'addColumn',
          column: {
            name: d.name,
            type: d.type,
            nullable: d.nullable,
            pk: d.pk,
            default: d.default?.trim() || undefined
          },
          // position the new column only where the engine supports it (MySQL)
          ...(canReorder ? { after: prevName } : {})
        })
        if (canAlter && d.fk?.refTable && d.fk.refColumn)
          ops.push(addFkOp(d.name, d.fk))
      }
      prevName = d.name
      continue
    }
    prevName = d.name
    const o = orig.find((x) => x.name === d._orig)
    if (!o) continue
    if (d.name !== d._orig && d.name.trim())
      ops.push({ kind: 'renameColumn', from: d._orig, to: d.name })
    if (canAlter) {
      const typeChanged = (d.type || '') !== (o.type || '')
      const nullChanged = d.nullable !== o.nullable
      if (typeChanged || nullChanged)
        ops.push({
          kind: 'alterColumn',
          name: d.name,
          type: d.type,
          nullable: d.nullable
        })
      const origDef = (o.default ?? '').trim()
      const draftDef = (d.default ?? '').trim()
      if (draftDef !== origDef) {
        if (draftDef)
          ops.push({ kind: 'setDefault', name: d.name, default: draftDef })
        else ops.push({ kind: 'dropDefault', name: d.name })
      }
      const of = o.fk
      const df = d.fk
      if (of && !df && of.constraint)
        ops.push({ kind: 'dropForeignKey', constraint: of.constraint })
      else if (!of && df?.refTable && df.refColumn) ops.push(addFkOp(d.name, df))
      else if (of && df && !fkSame(of, df)) {
        if (of.constraint)
          ops.push({ kind: 'dropForeignKey', constraint: of.constraint })
        if (df.refTable && df.refColumn) ops.push(addFkOp(d.name, df))
      }
    }
  }
  if (canReorder) ops.push(...diffMoves(orig, draft))
  return ops
}
