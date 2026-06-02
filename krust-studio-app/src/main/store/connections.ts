import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { connectionsFile } from './paths'
import type {
  ConnectionConfig,
  ConnectionSummary,
  SaveConnectionInput
} from '../../shared/types'

interface StoredConnection extends ConnectionConfig {
  /** base64 of safeStorage-encrypted password (DPAPI on Windows) */
  encryptedPassword?: string
}

function readStore(): StoredConnection[] {
  const file = connectionsFile()
  if (!existsSync(file)) return []
  try {
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStore(list: StoredConnection[]): void {
  writeFileSync(connectionsFile(), JSON.stringify(list, null, 2), 'utf-8')
}

function encryptPassword(password: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption (safeStorage) is not available')
  }
  return safeStorage.encryptString(password).toString('base64')
}

function decryptPassword(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

function toSummary(c: StoredConnection): ConnectionSummary {
  const { encryptedPassword, ...config } = c
  return { ...config, hasPassword: Boolean(encryptedPassword) }
}

export function listConnections(): ConnectionSummary[] {
  return readStore().map(toSummary)
}

export function saveConnection(input: SaveConnectionInput): ConnectionSummary {
  const list = readStore()
  const id = input.config.id || randomUUID()
  const existing = list.find((c) => c.id === id)

  const next: StoredConnection = {
    ...input.config,
    id,
    // keep existing secret when no new password is supplied
    encryptedPassword: existing?.encryptedPassword
  }
  if (input.password !== undefined && input.password !== '') {
    next.encryptedPassword = encryptPassword(input.password)
  }

  const idx = list.findIndex((c) => c.id === id)
  if (idx >= 0) list[idx] = next
  else list.push(next)
  writeStore(list)
  return toSummary(next)
}

export function removeConnection(id: string): void {
  writeStore(readStore().filter((c) => c.id !== id))
}

/** The stored config (without secret) for one connection. */
export function getConnectionConfig(id: string): ConnectionConfig | undefined {
  const c = readStore().find((x) => x.id === id)
  if (!c) return undefined
  const { encryptedPassword: _omit, ...config } = c
  return config
}

/** Resolve the plaintext password for a stored connection, if any. */
export function getStoredPassword(id: string): string | undefined {
  const c = readStore().find((x) => x.id === id)
  if (!c?.encryptedPassword) return undefined
  return decryptPassword(c.encryptedPassword)
}

/** Clone a connection under a new id, copying its encrypted password as-is. */
export function duplicateConnection(id: string): ConnectionSummary {
  const list = readStore()
  const src = list.find((c) => c.id === id)
  if (!src) throw new Error('Connection not found')
  const copy: StoredConnection = {
    ...src,
    id: randomUUID(),
    name: `${src.name} (copy)`
  }
  list.push(copy)
  writeStore(list)
  return toSummary(copy)
}
