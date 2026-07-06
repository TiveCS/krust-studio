import { create } from 'zustand'
import { toast } from 'sonner'
import type { SchemaSyncProposal } from '../../../shared/types'

/**
 * Schema Sync proposals pushed from the MCP server (ADR-0022). Transient — the
 * main process holds the authoritative pending list; this mirrors it for the tab
 * + the sidebar badge. Initialised once from `subscribe()`.
 */
interface SchemaSyncState {
  proposals: SchemaSyncProposal[]
  started: boolean
  notify: boolean
  /** wire the main→renderer proposal push + load the current pending list */
  start: () => void
  refresh: () => Promise<void>
  dismiss: (id: string) => Promise<void>
}

export const useSchemaSync = create<SchemaSyncState>((set, get) => ({
  proposals: [],
  started: false,
  notify: true,

  start: () => {
    if (get().started) return
    set({ started: true })
    void window.api.mcp.getConfig().then((c) => set({ notify: c.notifyOnProposal }))
    void get().refresh()
    window.api.schemaSync.onProposal((p) => {
      set((s) => ({ proposals: [p, ...s.proposals.filter((x) => x.id !== p.id)] }))
      if (get().notify) {
        const n = p.createTables.length + p.alters.length
        toast.message(`${p.client} proposed ${n} schema op${n === 1 ? '' : 's'}`, {
          description: `${p.connectionName} — open Schema Sync to review`
        })
      }
    })
  },

  refresh: async () => {
    const proposals = await window.api.schemaSync.list()
    set({ proposals })
  },

  dismiss: async (id) => {
    await window.api.schemaSync.dismiss(id)
    set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) }))
  }
}))
