import { X, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnections } from '@/store/connections'

export function TabBar(): React.JSX.Element | null {
  const { tabs, activeTabId, setActiveTab, closeTab } = useConnections()
  if (tabs.length === 0) return null

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
          <Table2 className="size-3.5 opacity-60" />
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
    </div>
  )
}
