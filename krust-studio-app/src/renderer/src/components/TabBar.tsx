import { useEffect, useRef, useState } from 'react'
import {
  X,
  Table2,
  SquareTerminal,
  Plus,
  History,
  Plug,
  Pin,
  PinOff,
  FolderOpen,
  FunctionSquare
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnections, tabIsDirty, type Tab } from '@/store/connections'
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
  if (tab.kind === 'routine') return <FunctionSquare className="size-3.5 opacity-60" />
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
    openSqlFile,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
    togglePinTab,
    moveTab
  } = useConnections()
  // a pending close that needs confirmation because it would discard edits
  const [confirm, setConfirm] = useState<{ run: () => void; names: string[] } | null>(null)
  // drag-reorder state: id being dragged + the id currently hovered over
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Vertical mouse-wheel scrolls the tab strip horizontally (VSCode-style).
  // Native non-passive listener so preventDefault actually works (React's
  // onWheel is passive); only hijacks when the strip actually overflows.
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (el.scrollWidth <= el.clientWidth) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [openConnectionId])

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

  const pinned = tabs.filter((t) => t.pinned)
  const unpinned = tabs.filter((t) => !t.pinned)

  const renderTab = (t: Tab, i: number): React.JSX.Element => {
    const dirty = tabIsDirty(t)
    const isLast = i === tabs.length - 1
    return (
          <ContextMenu key={t.id}>
            <ContextMenuTrigger asChild>
              <div
                draggable
                onDragStart={(e) => {
                  setDragId(t.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === t.id) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setOverId(t.id)
                }}
                onDragLeave={() => setOverId((o) => (o === t.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId && dragId !== t.id) moveTab(dragId, t.id)
                  setDragId(null)
                  setOverId(null)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setOverId(null)
                }}
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
                    : 'text-muted-foreground hover:bg-accent/40',
                  dragId === t.id && 'opacity-40',
                  overId === t.id && 'border-l-2 border-l-primary'
                )}
              >
                {t.pinned ? (
                  <Pin className="size-3 shrink-0 rotate-45 text-primary" />
                ) : (
                  <TabIcon tab={t} />
                )}
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
              <ContextMenuItem onSelect={() => togglePinTab(t.id)}>
                {t.pinned ? (
                  <>
                    <PinOff className="size-3.5" />
                    Unpin tab
                  </>
                ) : (
                  <>
                    <Pin className="size-3.5" />
                    Pin tab
                  </>
                )}
              </ContextMenuItem>
              <ContextMenuItem disabled={!openConnectionId} onSelect={() => openQuery()}>
                <SquareTerminal className="size-3.5" />
                New query tab
              </ContextMenuItem>
              <ContextMenuItem disabled={!openConnectionId} onSelect={() => void openSqlFile()}>
                <FolderOpen className="size-3.5" />
                Open SQL file…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => requestClose([t.id], () => closeTab(t.id))}>
                Close
              </ContextMenuItem>
              <ContextMenuItem
                disabled={tabs.length <= 1}
                onSelect={() =>
                  requestClose(
                    idsOf((id) => id !== t.id && !tabs.find((x) => x.id === id)?.pinned),
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
                    idsOf((_, j) => j > i && !tabs[j].pinned),
                    () => closeTabsToRight(t.id)
                  )
                }
              >
                Close to the right
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() =>
                  requestClose(
                    idsOf((id) => !tabs.find((x) => x.id === id)?.pinned),
                    () => closeAllTabs()
                  )
                }
              >
                Close all
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
    )
  }

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-border bg-card/30">
      <div ref={stripRef} className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {pinned.length > 0 && (
          <div className="sticky left-0 z-20 flex items-stretch bg-card shadow-[3px_0_5px_-2px_rgba(0,0,0,0.45)]">
            {pinned.map((t) => renderTab(t, tabs.indexOf(t)))}
          </div>
        )}
        {unpinned.map((t) => renderTab(t, tabs.indexOf(t)))}
      </div>
      <button
        onClick={() => openQuery()}
        disabled={!openConnectionId}
        title="New SQL query"
        className="flex shrink-0 items-center gap-1 border-l border-border px-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
      >
        <Plus className="size-3.5" />
        <SquareTerminal className="size-3.5" />
      </button>
      <button
        onClick={() => void openSqlFile()}
        disabled={!openConnectionId}
        title="Open SQL file…"
        className="flex shrink-0 items-center border-l border-border px-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
      >
        <FolderOpen className="size-3.5" />
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
