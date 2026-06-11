import { create } from 'zustand'

interface UiState {
  paletteOpen: boolean
  togglePalette: () => void
  setPaletteOpen: (open: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setPaletteOpen: (open) => set({ paletteOpen: open })
}))
