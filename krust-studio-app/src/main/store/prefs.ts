import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

/**
 * Small main-process preferences file (userData/prefs.json). Holds settings the
 * main process needs before the renderer is up — currently the update channel
 * opt-in, which the auto-updater reads at launch (renderer localStorage isn't
 * reachable from main). Kept separate from the renderer's own settings.
 */
interface Prefs {
  /** opt in to pre-release (beta) auto-updates */
  betaUpdates: boolean
}

const DEFAULTS: Prefs = { betaUpdates: false }

const file = (): string => join(app.getPath('userData'), 'prefs.json')

let cache: Prefs | null = null

function load(): Prefs {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), 'utf-8')) as Partial<Prefs>) }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export function getBetaUpdates(): boolean {
  return load().betaUpdates
}

export function setBetaUpdates(on: boolean): void {
  cache = { ...load(), betaUpdates: on }
  try {
    writeFileSync(file(), JSON.stringify(cache), 'utf-8')
  } catch {
    // best-effort; a failed write just means the pref isn't remembered
  }
}
