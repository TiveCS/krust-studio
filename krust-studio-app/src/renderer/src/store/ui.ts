import { create } from 'zustand'

interface UiState {
  paletteOpen: boolean
  togglePalette: () => void
  setPaletteOpen: (open: boolean) => void
  /** bumped by the filter.add command; FilterBar watches it to expand + add a row */
  filterAddNonce: number
  requestAddFilter: () => void
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  filterAddNonce: 0,
  requestAddFilter: () => set((s) => ({ filterAddNonce: s.filterAddNonce + 1 }))
}))
