import { readFileSync, writeFileSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { templatesFile } from './paths'
import type { TableTemplate } from '../../shared/types'

function readStore(): TableTemplate[] {
  const file = templatesFile()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStore(list: TableTemplate[]): void {
  writeFileSync(templatesFile(), JSON.stringify(list, null, 2), 'utf-8')
}

export function listTemplates(): TableTemplate[] {
  return readStore()
}

/** Upsert by id (blank id => create). */
export function saveTemplate(input: TableTemplate): TableTemplate {
  const list = readStore()
  const id = input.id || randomUUID()
  const next: TableTemplate = {
    ...input,
    id,
    createdAt: input.createdAt || Date.now()
  }
  const idx = list.findIndex((t) => t.id === id)
  if (idx >= 0) list[idx] = next
  else list.push(next)
  writeStore(list)
  return next
}

export function removeTemplate(id: string): void {
  writeStore(readStore().filter((t) => t.id !== id))
}
