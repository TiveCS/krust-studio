import { create } from 'zustand'

const STORAGE_KEY = 'krust-settings-keybindings'
const STORAGE_KEY_PINS = 'krust-settings-pinned-columns'
const STORAGE_KEY_GRID = 'krust-settings-grid'

/** rows on a page above which the data grid switches to virtualized rendering.
 *  Small pages (≤ this) render plainly — fast in a prod build and free of
 *  virtualizer edge-cases; big pages (e.g. 500/pg) virtualize. 0 = always. */
const DEFAULT_VIRTUALIZE_THRESHOLD = 150

function loadVirtualizeThreshold(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRID)
    const n = raw ? (JSON.parse(raw) as { virtualizeThreshold?: number }).virtualizeThreshold : null
    return typeof n === 'number' && n >= 0 ? n : DEFAULT_VIRTUALIZE_THRESHOLD
  } catch {
    return DEFAULT_VIRTUALIZE_THRESHOLD
  }
}

export type PinSide = 'left' | 'right'
/** a global name-based pin rule, applied to every table opened */
export interface PinRule {
  name: string
  side: PinSide
}
/** auto-pin the primary key column(s) of every table */
export interface PinPrimaryKey {
  enabled: boolean
  side: PinSide
}

interface PinSettings {
  pinnedColumns: PinRule[]
  pinPrimaryKey: PinPrimaryKey
}

const DEFAULT_PINS: PinSettings = {
  pinnedColumns: [],
  pinPrimaryKey: { enabled: false, side: 'left' }
}

function loadKeybindings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function loadPins(): PinSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PINS)
    if (!raw) return DEFAULT_PINS
    const parsed = JSON.parse(raw) as Partial<PinSettings>
    return {
      pinnedColumns: Array.isArray(parsed.pinnedColumns) ? parsed.pinnedColumns : [],
      pinPrimaryKey: parsed.pinPrimaryKey ?? DEFAULT_PINS.pinPrimaryKey
    }
  } catch {
    return DEFAULT_PINS
  }
}

interface SettingsState {
  keybindings: Record<string, string>
  setKeybinding: (commandId: string, key: string) => void
  resetKeybinding: (commandId: string) => void
  resetAll: () => void

  // ── pinned columns (freeze panes, ADR-0016) ──
  pinnedColumns: PinRule[]
  pinPrimaryKey: PinPrimaryKey
  addPinnedColumn: (name: string, side: PinSide) => void
  removePinnedColumn: (name: string) => void
  setPinnedColumnSide: (name: string, side: PinSide) => void
  setPinPrimaryKey: (v: PinPrimaryKey) => void

  // ── grid ──
  /** rows/page above which the grid virtualizes; below, all rows render in DOM */
  virtualizeThreshold: number
  setVirtualizeThreshold: (n: number) => void
}

function savePins(s: PinSettings): void {
  localStorage.setItem(STORAGE_KEY_PINS, JSON.stringify(s))
}

export const useSettings = create<SettingsState>((set) => ({
  keybindings: loadKeybindings(),

  setKeybinding: (commandId, key) =>
    set((s) => {
      const keybindings = { ...s.keybindings, [commandId]: key }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keybindings))
      return { keybindings }
    }),

  resetKeybinding: (commandId) =>
    set((s) => {
      const keybindings = { ...s.keybindings }
      delete keybindings[commandId]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keybindings))
      return { keybindings }
    }),

  resetAll: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ keybindings: {} })
  },

  ...loadPins(),

  addPinnedColumn: (name, side) =>
    set((s) => {
      const trimmed = name.trim()
      if (!trimmed) return {}
      // replace any existing rule for the same name (case-insensitive)
      const rest = s.pinnedColumns.filter(
        (r) => r.name.toLowerCase() !== trimmed.toLowerCase()
      )
      const pinnedColumns = [...rest, { name: trimmed, side }]
      savePins({ pinnedColumns, pinPrimaryKey: s.pinPrimaryKey })
      return { pinnedColumns }
    }),

  removePinnedColumn: (name) =>
    set((s) => {
      const pinnedColumns = s.pinnedColumns.filter(
        (r) => r.name.toLowerCase() !== name.toLowerCase()
      )
      savePins({ pinnedColumns, pinPrimaryKey: s.pinPrimaryKey })
      return { pinnedColumns }
    }),

  setPinnedColumnSide: (name, side) =>
    set((s) => {
      const pinnedColumns = s.pinnedColumns.map((r) =>
        r.name.toLowerCase() === name.toLowerCase() ? { ...r, side } : r
      )
      savePins({ pinnedColumns, pinPrimaryKey: s.pinPrimaryKey })
      return { pinnedColumns }
    }),

  setPinPrimaryKey: (pinPrimaryKey) =>
    set((s) => {
      savePins({ pinnedColumns: s.pinnedColumns, pinPrimaryKey })
      return { pinPrimaryKey }
    }),

  virtualizeThreshold: loadVirtualizeThreshold(),
  setVirtualizeThreshold: (n) =>
    set(() => {
      const virtualizeThreshold = Math.max(0, Math.floor(n) || 0)
      localStorage.setItem(STORAGE_KEY_GRID, JSON.stringify({ virtualizeThreshold }))
      return { virtualizeThreshold }
    })
}))
