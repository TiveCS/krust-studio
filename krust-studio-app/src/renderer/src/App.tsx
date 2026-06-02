import { useEffect } from 'react'
import { Table2 } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { ConnectionForm } from '@/components/ConnectionForm'
import { TabBar } from '@/components/TabBar'
import { TableTabView } from '@/components/TableTabView'
import { HistoryView } from '@/components/HistoryView'
import { Toaster } from '@/components/ui/sonner'
import { useConnections } from '@/store/connections'

function App(): React.JSX.Element {
  const {
    connections,
    selectedId,
    creatingNew,
    openConnectionId,
    tabs,
    screen,
    load
  } = useConnections()

  useEffect(() => {
    void load()
  }, [load])

  const selected = connections.find((c) => c.id === selectedId) ?? null
  const showForm = creatingNew || selected !== null

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          {showForm ? (
            <ConnectionForm
              key={selected?.id ?? 'new'}
              existing={creatingNew ? null : selected}
            />
          ) : screen === 'history' ? (
            <HistoryView />
          ) : (
            <>
              <TabBar />
              {tabs.length > 0 ? (
                <TableTabView />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Table2 className="size-10 opacity-30" />
                  <p className="text-sm">
                    {openConnectionId
                      ? 'Double-click a table in the sidebar'
                      : 'Pick or create a connection to begin'}
                  </p>
                </div>
              )}
            </>
          )}
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}

export default App
