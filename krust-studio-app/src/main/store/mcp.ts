import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import type { McpConfig, McpGrant } from '../../shared/types'

/**
 * MCP server config (userData/mcpConfig.json). Holds the master enable, bound
 * port, per-install auth token, and per-connection capability grants
 * (default-deny — ADR-0022). Main-process owned, like connections.json; the
 * token is local + user-owned so it round-trips to the Settings panel.
 */

const DEFAULT_PORT = 7071
/** seeded into every new connection's introspection excludes — EF's own table */
const SEED_EXCLUDES = ['__EFMigrationsHistory']

function freshToken(): string {
  return randomBytes(24).toString('base64url')
}

function defaults(): McpConfig {
  return {
    enabled: false,
    port: DEFAULT_PORT,
    token: freshToken(),
    notifyOnProposal: true,
    readSampleDefault: 50,
    readSampleMax: 500,
    grants: {}
  }
}

const file = (): string => join(app.getPath('userData'), 'mcpConfig.json')

let cache: McpConfig | null = null

function load(): McpConfig {
  if (cache) return cache
  try {
    const parsed = JSON.parse(readFileSync(file(), 'utf-8')) as Partial<McpConfig>
    cache = { ...defaults(), ...parsed, grants: parsed.grants ?? {} }
    // a persisted config with no token (older file) gets one
    if (!cache.token) cache.token = freshToken()
  } catch {
    cache = defaults()
  }
  return cache
}

function persist(): void {
  try {
    writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch {
    // best-effort; a failed write just means the change isn't remembered
  }
}

export function getMcpConfig(): McpConfig {
  return load()
}

export function setMcpEnabled(on: boolean): void {
  cache = { ...load(), enabled: on }
  persist()
}

export function setMcpPort(port: number): void {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Port must be an integer in 1024–65535')
  }
  cache = { ...load(), port }
  persist()
}

export function regenerateMcpToken(): string {
  const token = freshToken()
  cache = { ...load(), token }
  persist()
  return token
}

export function setNotifyOnProposal(on: boolean): void {
  cache = { ...load(), notifyOnProposal: on }
  persist()
}

/** the per-connection grant, with excludes seeded on first read (default-deny) */
export function getMcpGrant(connectionId: string): McpGrant {
  const g = load().grants[connectionId]
  if (g) return g
  return { introspectExcludes: [...SEED_EXCLUDES] }
}

export function setMcpGrant(connectionId: string, grant: McpGrant): void {
  const cfg = load()
  cache = { ...cfg, grants: { ...cfg.grants, [connectionId]: grant } }
  persist()
}

export function mcpToken(): string {
  return load().token
}
