import { X, Table2, SquareTerminal, Plus, History, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnections } from '@/store/connections'

function TabIcon({ tab }: { tab: { kind?: string; query: unknown; draft: unknown } }): React.JSX.Element {
  if (tab.kind === 'history') return <History className="size-3.5 opacity-60" />
  if (tab.kind === 'connection-editor') return <Plug className="size-3.5 opacity-60" />
  if (tab.query) return <SquareTerminal className="size-3.5 opacity-60" />
  return <Table2 className="size-3.5 opacity-60" />
}

export function TabBar(): React.JSX.Element | null {
  const { tabs, activeTabId, openConnectionId, setActiveTab, closeTab, openQuery } =
    useConnections()
  if (tabs.length === 0 && !openConnectionId) return null

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card/30">
      {tabs.map((t) => (
        <div
          key={t.id}
          onClick={() => setActiveTab(t.id)}
          className={cn(
            'group flex cursor-pointer items-center gap-1.5 border-r border-border px-3 text-xs whitespace-nowrap',
            activeTabId === t.id
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:bg-accent/40'
          )}
        >
          <TabIcon tab={t} />
          <span className="font-mono">{t.entity.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              closeTab(t.id)
            }}
            className="ml-1 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
            title="Close tab"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <button
        onClick={() => openQuery()}
        disabled={!openConnectionId}
        title="New SQL query"
        className="flex items-center gap-1 px-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
      >
        <Plus className="size-3.5" />
        <SquareTerminal className="size-3.5" />
      </button>
    </div>
  )
}
