import { useState } from 'react'
import { X, Table2, SquareTerminal, Plus, History, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnections, tabIsDirty } from '@/store/connections'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

function TabIcon({ tab }: { tab: { kind?: string; query: unknown; draft: unknown } }): React.JSX.Element {
  if (tab.kind === 'history') return <History className="size-3.5 opacity-60" />
  if (tab.kind === 'connection-editor') return <Plug className="size-3.5 opacity-60" />
  if (tab.query) return <SquareTerminal className="size-3.5 opacity-60" />
  return <Table2 className="size-3.5 opacity-60" />
}

export function TabBar(): React.JSX.Element | null {
  const {
    tabs,
    activeTabId,
    openConnectionId,
    setActiveTab,
    closeTab,
    openQuery,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs
  } = useConnections()
  // a pending close that needs confirmation because it would discard edits
  const [confirm, setConfirm] = useState<{ run: () => void; names: string[] } | null>(null)

  if (tabs.length === 0 && !openConnectionId) return null

  /** run a close action, first confirming if any targeted tab has unsaved work */
  const requestClose = (targetIds: string[], run: () => void): void => {
    const names = tabs
      .filter((t) => targetIds.includes(t.id) && tabIsDirty(t))
      .map((t) => t.entity.name)
    if (names.length) setConfirm({ run, names })
    else run()
  }

  const idsOf = (pred: (id: string, i: number) => boolean): string[] =>
    tabs.filter((_, i) => pred(tabs[i].id, i)).map((t) => t.id)

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card/30">
      {tabs.map((t, i) => {
        const dirty = tabIsDirty(t)
        const isLast = i === tabs.length - 1
        return (
          <ContextMenu key={t.id}>
            <ContextMenuTrigger asChild>
              <div
                onClick={() => setActiveTab(t.id)}
                onAuxClick={(e) => {
                  // middle-click closes
                  if (e.button === 1) {
                    e.preventDefault()
                    requestClose([t.id], () => closeTab(t.id))
                  }
                }}
                className={cn(
                  'group flex cursor-pointer items-center gap-1.5 border-r border-border px-3 text-xs whitespace-nowrap',
                  activeTabId === t.id
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-accent/40'
                )}
              >
                <TabIcon tab={t} />
                <span className="font-mono">{t.entity.name}</span>
                {dirty && (
                  <span
                    title="Unsaved changes"
                    className="size-1.5 shrink-0 rounded-full bg-amber-400 group-hover:hidden"
                  />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    requestClose([t.id], () => closeTab(t.id))
                  }}
                  className={cn(
                    'ml-1 rounded p-0.5 hover:bg-accent',
                    dirty
                      ? 'hidden group-hover:inline-flex'
                      : 'opacity-0 group-hover:opacity-100'
                  )}
                  title="Close tab"
                >
                  <X className="size-3" />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => requestClose([t.id], () => closeTab(t.id))}>
                Close
              </ContextMenuItem>
              <ContextMenuItem
                disabled={tabs.length <= 1}
                onSelect={() =>
                  requestClose(
                    idsOf((id) => id !== t.id),
                    () => closeOtherTabs(t.id)
                  )
                }
              >
                Close others
              </ContextMenuItem>
              <ContextMenuItem
                disabled={isLast}
                onSelect={() =>
                  requestClose(
                    idsOf((_, j) => j > i),
                    () => closeTabsToRight(t.id)
                  )
                }
              >
                Close to the right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => requestClose(idsOf(() => true), () => closeAllTabs())}
              >
                Close all
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
      <button
        onClick={() => openQuery()}
        disabled={!openConnectionId}
        title="New SQL query"
        className="flex items-center gap-1 px-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
      >
        <Plus className="size-3.5" />
        <SquareTerminal className="size-3.5" />
      </button>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              {confirm?.names.length === 1
                ? `"${confirm.names[0]}" has uncommitted changes that will be lost.`
                : `${confirm?.names.length} tabs have uncommitted changes that will be lost: ${confirm?.names.join(', ')}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                confirm?.run()
                setConfirm(null)
              }}
            >
              Discard &amp; close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
