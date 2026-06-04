import { useState } from 'react'
import { ChevronsUpDown, Check, HardDrive } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { useConnections } from '@/store/connections'

/**
 * Searchable database switcher (combobox). Self-contained open/search state so
 * toggling it never re-renders the 580-row schema tree in AppSidebar.
 */
export function DatabaseSwitcher(): React.JSX.Element {
  const { connections, openConnectionId, databases, currentDb, switchDatabase } =
    useConnections()
  const [open, setOpen] = useState(false)

  const current = connections.find((c) => c.id === openConnectionId)
  const isSqlite = current?.driver === 'sqlite'
  const disabled = !current || isSqlite || databases.length === 0

  const label =
    currentDb ??
    (current
      ? current.driver === 'sqlite'
        ? (current.sqlitePath?.split(/[\\/]/).pop() ?? 'database')
        : current.database || '(no database)'
      : 'No database')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent disabled:opacity-50">
          <HardDrive className="size-4 shrink-0 opacity-70" />
          <span className="flex-1 truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search databases…" />
          <CommandList>
            <CommandEmpty>No databases.</CommandEmpty>
            {databases.map((db) => (
              <CommandItem
                key={db}
                value={db}
                onSelect={() => {
                  setOpen(false)
                  void switchDatabase(db)
                }}
              >
                <Check
                  className={cn(
                    'size-4 shrink-0',
                    db === currentDb ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="truncate">{db}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
