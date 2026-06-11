import { useEffect, useMemo, useState } from 'react'
import { Table2, Eye } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem
} from '@/components/ui/command'
import { useConnections } from '@/store/connections'
import { useUi } from '@/store/ui'

const MAX_RESULTS = 50

/**
 * Ctrl/Cmd+P table switcher (VSCode-style). Lists tables/views on the current
 * connection. Filtering is done here (shouldFilter=false) — contains match,
 * startsWith ranked first, capped to MAX_RESULTS — so 500+ tables stay snappy
 * (cmdk's built-in filter renders & re-scores ALL items every keystroke).
 */
export function CommandPalette(): React.JSX.Element {
  const { entities, openConnectionId, openTable } = useConnections()
  const { paletteOpen: open, setPaletteOpen } = useUi()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!openConnectionId && open) setPaletteOpen(false)
  }, [openConnectionId, open, setPaletteOpen])

  // reset search each time it opens
  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entities.slice(0, MAX_RESULTS)
    const starts: typeof entities = []
    const contains: typeof entities = []
    for (const e of entities) {
      const name = e.name.toLowerCase()
      const i = name.indexOf(q)
      if (i === 0) starts.push(e)
      else if (i > 0) contains.push(e)
      if (starts.length >= MAX_RESULTS) break
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS)
  }, [search, entities])

  return (
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search tables</DialogTitle>
        <DialogDescription>
          Search and open a table or view on the current connection
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="top-[18%] translate-y-0 overflow-hidden p-0" showCloseButton={false}>
        <Command shouldFilter={false} className="[&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2">
          <CommandInput
            placeholder="Search tables…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No tables found.</CommandEmpty>
            <CommandGroup
              heading={
                search.trim()
                  ? `${results.length}${results.length >= MAX_RESULTS ? '+' : ''} match`
                  : `${entities.length} objects`
              }
            >
              {results.map((e) => (
                <CommandItem
                  key={`${e.schema ?? ''}.${e.name}`}
                  value={`${e.schema ?? ''}.${e.name}`}
                  onSelect={() => {
                    void openTable({ name: e.name, schema: e.schema })
                    setPaletteOpen(false)
                  }}
                >
                  {e.type === 'view' ? (
                    <Eye className="text-muted-foreground" />
                  ) : (
                    <Table2 className="text-muted-foreground" />
                  )}
                  <span className="font-mono">{e.name}</span>
                  {e.schema && (
                    <span className="ml-auto text-xs text-muted-foreground/60">
                      {e.schema}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
