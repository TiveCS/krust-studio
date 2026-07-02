import { useEffect } from 'react'
import { Table2, Plug } from 'lucide-react'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { ConnectionForm } from '@/components/ConnectionForm'
import { TitleBar } from '@/components/TitleBar'
import { TabBar } from '@/components/TabBar'
import { TableTabView } from '@/components/TableTabView'
import { HistoryView } from '@/components/HistoryView'
import { BackupView } from '@/components/BackupView'
import { RedisKeyView } from '@/components/RedisKeyView'
import { RoutineView } from '@/components/RoutineView'
import { CommandPalette } from '@/components/CommandPalette'
import { Toaster } from '@/components/ui/sonner'
import { useConnections } from '@/store/connections'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { COMMANDS, matchesBinding } from '@/lib/commands'

function App(): React.JSX.Element {
  const {
    connections,
    openConnectionId,
    tabs,
    activeTabId,
    closeTab,
    patchEditorTabConnection,
    load,
    loadWorkspace,
    loadTemplates,
    autoOpenLast
  } = useConnections()
  const toastPosition = useSettings((s) => s.toastPosition)

  useEffect(() => {
    void (async () => {
      await load()
      await loadWorkspace()
      void loadTemplates() // non-blocking; local templates for the create-table flow
      autoOpenLast() // land back on the last-used connection
    })()
  }, [load, loadWorkspace, loadTemplates, autoOpenLast])

  // Flush the workspace to disk on quit so an abrupt close doesn't drop the last
  // <800ms of edits sitting in the save debounce (ADR-0018). The editor's own
  // blur flush lands unsaved SQL in the store first (window-close blurs the
  // focused element before beforeunload fires).
  useEffect(() => {
    const onBeforeUnload = (): void => {
      useConnections.getState().flushWorkspaceNow()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    const ipc = window.electron.ipcRenderer
    const offAvailable = ipc.on('update:available', (_, version: string) => {
      toast.info(`Update v${version} downloading…`, { duration: 5000 })
    })
    const offDownloaded = ipc.on('update:downloaded', (_, version: string) => {
      toast.success(`v${version} ready — restart to update`, {
        duration: Infinity,
        action: {
          label: 'Restart now',
          onClick: () => window.electron.ipcRenderer.send('update:install')
        }
      })
    })
    return () => {
      offAvailable()
      offDownloaded()
    }
  }, [])

  // Central keyboard dispatcher — reads store state at event time (no stale closures)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      const { keybindings } = useSettings.getState()
      const { tabs: currentTabs, activeTabId: currentActiveId, openConnectionId: connId } =
        useConnections.getState()
      const activeTab = currentTabs.find((t) => t.id === currentActiveId) ?? null
      const isTableTab = activeTab !== null && !activeTab.kind
      const isDataView = isTableTab && activeTab.view === 'data'
      const isStructureView = isTableTab && activeTab.view === 'structure'

      for (const cmd of COMMANDS) {
        const binding = keybindings[cmd.id] ?? cmd.defaultKey
        if (!matchesBinding(e, binding)) continue

        const { scope } = cmd
        const scopeActive =
          scope === 'global' ||
          (scope === 'table-tab' && isTableTab) ||
          (scope === 'data-view' && isDataView) ||
          (scope === 'structure-view' && isStructureView)
        if (!scopeActive) continue

        // Don't intercept inputs for non-global shortcuts
        if (inInput && scope !== 'global') continue

        e.preventDefault()

        switch (cmd.id) {
          case 'palette.open':
            if (connId) useUi.getState().togglePalette()
            break
          case 'table.commit':
            void useConnections.getState().commitChanges()
            break
          case 'table.addRow':
            useConnections.getState().addRow()
            break
          case 'table.refresh':
            if (isStructureView) {
              void useConnections.getState().refreshStructure()
            } else {
              void useConnections.getState().gotoPage(activeTab?.pageIndex ?? 0)
            }
            break
          case 'table.toggleView':
            void useConnections
              .getState()
              .setTabView(activeTab?.view === 'data' ? 'structure' : 'data')
            break
          case 'filter.add':
            useUi.getState().requestAddFilter()
            break
          case 'find.open':
            useUi.getState().requestFind()
            break
          case 'sidebar.toggle':
            // handled by SidebarProvider's own listener; preventDefault here so
            // the binding is still claimed/listed in the command registry
            break
        }
        break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  let content: React.JSX.Element
  if (activeTab?.kind === 'connection-editor') {
    const connId = activeTab.connectionEditor?.connectionId ?? null
    const existing = connId ? (connections.find((c) => c.id === connId) ?? null) : null
    content = (
      <ConnectionForm
        key={connId ?? 'new'}
        existing={existing}
        onSaved={(saved) => patchEditorTabConnection(activeTab.id, saved.id)}
        onConnected={() => closeTab(activeTab.id)}
      />
    )
  } else if (activeTab?.kind === 'history') {
    content = <HistoryView />
  } else if (activeTab?.kind === 'backup') {
    content = <BackupView />
  } else if (activeTab?.kind === 'redis-key') {
    content = <RedisKeyView />
  } else if (activeTab?.kind === 'routine') {
    content = <RoutineView key={activeTab.id} />
  } else if (activeTab) {
    content = <TableTabView />
  } else {
    content = (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        {openConnectionId ? (
          <>
            <Table2 className="size-10 opacity-30" />
            <p className="text-sm">Double-click a table in the sidebar</p>
          </>
        ) : (
          <>
            <Plug className="size-10 opacity-30" />
            <p className="text-sm">Pick or create a connection to begin</p>
          </>
        )}
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-svh flex-col overflow-hidden">
        <TitleBar />
        <div className="min-h-0 flex-1">
          <SidebarProvider className="h-full min-h-0 overflow-hidden">
            <AppSidebar />
            <SidebarInset className="min-w-0">
              <TabBar />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {content}
              </div>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </div>
      <CommandPalette />
      <Toaster position={toastPosition} />
    </TooltipProvider>
  )
}

export default App
