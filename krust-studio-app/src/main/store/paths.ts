import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

/**
 * Resolve the Krust data directory. Defaults to Electron's userData path.
 * A configurable override (per CONTEXT "Data Location") can be layered in later.
 */
export function getDataDir(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function connectionsFile(): string {
  return join(getDataDir(), 'connections.json')
}
