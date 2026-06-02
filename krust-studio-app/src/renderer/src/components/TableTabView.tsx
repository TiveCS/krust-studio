import { cn } from '@/lib/utils'
import { DataGrid } from './DataGrid'
import { StructureView } from './StructureView'
import { NewTableEditor } from './NewTableEditor'
import { QueryView } from './QueryView'
import { useConnections, type TabView } from '@/store/connections'

const VIEWS: TabView[] = ['data', 'structure']

export function TableTabView(): React.JSX.Element | null {
  const { tabs, activeTabId, setTabView } = useConnections()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) return null

  if (tab.draft) return <NewTableEditor tab={tab} />
  if (tab.query) return <QueryView key={tab.id} />

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {tab.view === 'data' ? (
          <DataGrid key={tab.id} />
        ) : (
          <StructureView key={tab.id} />
        )}
      </div>
      <div className="flex h-8 shrink-0 items-center gap-1 border-t border-border px-2">
        {VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => setTabView(v)}
            className={cn(
              'rounded px-2.5 py-1 text-xs capitalize',
              tab.view === v
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}
