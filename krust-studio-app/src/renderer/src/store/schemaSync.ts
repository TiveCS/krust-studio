import { create } from 'zustand'
import { toast } from 'sonner'
import type { DataProposal, SchemaSyncProposal } from '../../../shared/types'

/**
 * **AI Proposals** — everything an agent has staged but not applied (ADR-0024).
 * Holds both kinds: Schema proposals from a Schema Sync run (ADR-0022) and Data
 * proposals from `propose_data_changes`. The main process holds the
 * authoritative list (persisted in `history.db`); this mirrors it for the tab
 * and the sidebar badge. Initialised once from `start()`.
 */
interface SchemaSyncState {
  proposals: SchemaSyncProposal[]
  dataProposals: DataProposal[]
  started: boolean
  notify: boolean
  /** total across both kinds — what the sidebar badge shows */
  count: () => number
  /** wire the main→renderer proposal pushes + load the current pending lists */
  start: () => void
  refresh: () => Promise<void>
  dismiss: (id: string) => Promise<void>
  dismissData: (id: string) => Promise<void>
}

export const useSchemaSync = create<SchemaSyncState>((set, get) => ({
  proposals: [],
  dataProposals: [],
  started: false,
  notify: true,

  count: () => get().proposals.length + get().dataProposals.length,

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
          description: `${p.connectionName} — open AI Proposals to review`
        })
      }
    })

    window.api.schemaSync.onDataProposal((p) => {
      set((s) => ({
        dataProposals: [p, ...s.dataProposals.filter((x) => x.id !== p.id)]
      }))
      if (get().notify) {
        const n = p.changes.length
        toast.message(`${p.client} proposed ${n} row change${n === 1 ? '' : 's'}`, {
          description: `${p.connectionName} — open AI Proposals to review`
        })
      }
    })
  },

  refresh: async () => {
    const [proposals, dataProposals] = await Promise.all([
      window.api.schemaSync.list(),
      window.api.schemaSync.listData()
    ])
    set({ proposals, dataProposals })
  },

  dismiss: async (id) => {
    await window.api.schemaSync.dismiss(id)
    set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) }))
  },

  dismissData: async (id) => {
    await window.api.schemaSync.dismissData(id)
    set((s) => ({ dataProposals: s.dataProposals.filter((p) => p.id !== id) }))
  }
}))
