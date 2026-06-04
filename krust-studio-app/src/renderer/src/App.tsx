import { useEffect } from 'react'
import { Table2, Plug } from 'lucide-react'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { ConnectionForm } from '@/components/ConnectionForm'
import { TabBar } from '@/components/TabBar'
import { TableTabView } from '@/components/TableTabView'
import { HistoryView } from '@/components/HistoryView'
import { CommandPalette } from '@/components/CommandPalette'
import { Toaster } from '@/components/ui/sonner'
import { useConnections } from '@/store/connections'

function App(): React.JSX.Element {
  const {
    connections,
    openConnectionId,
    tabs,
    activeTabId,
    closeTab,
    patchEditorTabConnection,
    load
  } = useConnections()

  useEffect(() => {
    void load()
  }, [load])

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

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // Connection editor tab
  if (activeTab?.kind === 'connection-editor') {
    const connId = activeTab.connectionEditor?.connectionId ?? null
    const existing = connId ? (connections.find((c) => c.id === connId) ?? null) : null
    return (
      <TooltipProvider delayDuration={0}>
        <SidebarProvider className="h-svh overflow-hidden">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <TabBar />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ConnectionForm
                key={connId ?? 'new'}
                existing={existing}
                onSaved={(saved) => patchEditorTabConnection(activeTab.id, saved.id)}
                onConnected={() => closeTab(activeTab.id)}
              />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <CommandPalette />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    )
  }

  // History tab
  if (activeTab?.kind === 'history') {
    return (
      <TooltipProvider delayDuration={0}>
        <SidebarProvider className="h-svh overflow-hidden">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <TabBar />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <HistoryView />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <CommandPalette />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    )
  }

  // Regular table/query/new-table tabs or landing
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider className="h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <TabBar />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeTab ? (
              <TableTabView />
            ) : (
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
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <CommandPalette />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}

export default App
