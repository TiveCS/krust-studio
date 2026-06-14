import { cn } from '@/lib/utils'
import { useConnections, type TabView } from '@/store/connections'

const VIEWS: TabView[] = ['data', 'structure']

/** Data ⇄ Structure segmented switch, shown bottom-left of each view's footer. */
export function ViewSwitch({ view }: { view: TabView }): React.JSX.Element {
  const setTabView = useConnections((s) => s.setTabView)
  return (
    <div className="flex shrink-0 items-center rounded border border-border p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v}
          onClick={() => void setTabView(v)}
          className={cn(
            'rounded px-2 py-0.5 text-[11px] capitalize',
            view === v
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
