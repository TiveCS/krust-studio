import { create } from 'zustand'

const STORAGE_KEY = 'krust-settings-keybindings'

function loadKeybindings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

interface SettingsState {
  keybindings: Record<string, string>
  setKeybinding: (commandId: string, key: string) => void
  resetKeybinding: (commandId: string) => void
  resetAll: () => void
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
  }
}))
