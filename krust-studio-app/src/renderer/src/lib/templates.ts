import type { EditorColumn } from '@/components/ColumnsEditor'
import type { NewColumnSpec, TableTemplate } from '../../../shared/types'

/** deep-ish clone of template columns for seeding a brand-new table draft (PK kept) */
export function templateToDraftColumns(t: TableTemplate): NewColumnSpec[] {
  return t.columns.map((c) => ({ ...c, fk: c.fk ? { ...c.fk } : undefined }))
}

/**
 * Insert a template's columns into an existing table's column draft as new
 * columns. The table already has its primary key, so PK flags are stripped; FKs
 * are dropped too (the template's refs may not exist on this table). Columns
 * whose name already exists are skipped.
 */
export function insertTemplateColumns(
  existing: EditorColumn[],
  t: TableTemplate
): { next: EditorColumn[]; added: string[]; skipped: string[] } {
  const taken = new Set(existing.map((c) => c.name.toLowerCase()))
  const added: string[] = []
  const skipped: string[] = []
  const toAdd: EditorColumn[] = []
  for (const c of t.columns) {
    const name = c.name.trim()
    if (!name) continue
    if (taken.has(name.toLowerCase())) {
      skipped.push(name)
      continue
    }
    taken.add(name.toLowerCase())
    added.push(name)
    // new column: no _orig; strip pk + fk
    toAdd.push({
      name: c.name,
      type: c.type,
      nullable: c.nullable,
      pk: false,
      default: c.default,
      autoInc: c.autoInc
    })
  }
  return { next: [...existing, ...toAdd], added, skipped }
}
