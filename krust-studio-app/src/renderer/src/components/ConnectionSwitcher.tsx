import { useState } from 'react'
import { Database, ChevronsUpDown, Check, Plus, Pencil, Lock, Unplug, RefreshCw } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { useConnections } from '@/store/connections'

const DRIVER_LABEL: Record<string, string> = {
  mysql: 'MySQL',
  postgres: 'Postgres',
  sqlite: 'SQLite'
}

function StatusDot({ status }: { status: string }): React.JSX.Element | null {
  if (status === 'idle') return null
  const cls =
    status === 'connected'
      ? 'bg-teal-500'
      : status === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : status === 'disconnected'
          ? 'bg-muted-foreground/50'
          : /* error */ 'bg-destructive'
  return <span className={`size-1.5 shrink-0 rounded-full ${cls}`} />
}

/**
 * Searchable connection switcher (footer). Self-contained open state so toggling
 * it never re-renders the 580-row schema tree in AppSidebar.
 */
export function ConnectionSwitcher(): React.JSX.Element {
  const {
    connections,
    openConnectionId,
    sessionStatus,
    open,
    openConnectionEditorTab,
    disconnect,
    reconnect
  } = useConnections()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const current = connections.find((c) => c.id === openConnectionId)

  const canDisconnect =
    !!openConnectionId && (sessionStatus === 'connected' || sessionStatus === 'error')
  const canReconnect =
    !!openConnectionId &&
    (sessionStatus === 'disconnected' || sessionStatus === 'error')

  return (
    <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent">
          <Database className="size-4 shrink-0 opacity-70" />
          <span className="flex-1 truncate">
            {current?.name ?? 'Select a connection'}
          </span>
          {current?.readOnly && <Lock className="size-3 shrink-0 opacity-60" />}
          <StatusDot status={openConnectionId ? sessionStatus : 'idle'} />
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" side="top">
        <Command>
          <CommandInput placeholder="Search connections…" />
          <CommandList>
            <CommandEmpty>No connections.</CommandEmpty>
            <CommandGroup>
              {connections.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    setSwitcherOpen(false)
                    void open(c.id)
                  }}
                >
                  <Database className="size-4 opacity-70" />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {DRIVER_LABEL[c.driver]}
                  </span>
                  {openConnectionId === c.id && <Check className="size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setSwitcherOpen(false)
                  openConnectionEditorTab(null)
                }}
              >
                <Plus className="size-4" />
                New connection…
              </CommandItem>
              {current && (
                <CommandItem
                  onSelect={() => {
                    setSwitcherOpen(false)
                    openConnectionEditorTab(current.id)
                  }}
                >
                  <Pencil className="size-4" />
                  Edit "{current.name}"
                </CommandItem>
              )}
            </CommandGroup>
            {(canDisconnect || canReconnect) && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {canReconnect && (
                    <CommandItem
                      onSelect={() => {
                        setSwitcherOpen(false)
                        void reconnect()
                      }}
                    >
                      <RefreshCw className="size-4" />
                      Reconnect
                    </CommandItem>
                  )}
                  {canDisconnect && (
                    <CommandItem
                      onSelect={() => {
                        setSwitcherOpen(false)
                        void disconnect()
                      }}
                      className="text-muted-foreground"
                    >
                      <Unplug className="size-4" />
                      Disconnect
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
