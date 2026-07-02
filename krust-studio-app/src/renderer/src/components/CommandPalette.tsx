import { useEffect, useMemo, useState } from 'react'
import { Table2, Eye, KeyRound } from 'lucide-react'
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
import { useRedis } from '@/store/redis'
import { useUi } from '@/store/ui'

const MAX_RESULTS = 50

/** contains-match, startsWith ranked first, capped — shared by tables + keys */
function rank<T>(items: T[], q: string, nameOf: (t: T) => string): T[] {
  if (!q) return items.slice(0, MAX_RESULTS)
  const starts: T[] = []
  const contains: T[] = []
  for (const it of items) {
    const name = nameOf(it).toLowerCase()
    const i = name.indexOf(q)
    if (i === 0) starts.push(it)
    else if (i > 0) contains.push(it)
    if (starts.length >= MAX_RESULTS) break
  }
  return [...starts, ...contains].slice(0, MAX_RESULTS)
}

/**
 * Ctrl/Cmd+P quick switcher (VSCode-style). On relational connections it lists
 * tables/views; on Redis it lists the currently-loaded (SCAN-paged) keys and
 * opens the picked one in a Redis Key tab. Filtering is done here
 * (shouldFilter=false) — contains match, startsWith first, capped — so large
 * schemas / key sets stay snappy.
 */
export function CommandPalette(): React.JSX.Element {
  const { entities, openConnectionId, openTable, openRedisKey, connections } = useConnections()
  const { paletteOpen: open, setPaletteOpen } = useUi()
  const [search, setSearch] = useState('')

  const isRedis = connections.find((c) => c.id === openConnectionId)?.driver === 'redis'
  const redisKeys = useRedis((s) => s.list.keys)
  const redisDb = useRedis((s) => s.dbInfo?.current ?? 0)

  useEffect(() => {
    if (!openConnectionId && open) setPaletteOpen(false)
  }, [openConnectionId, open, setPaletteOpen])

  // reset search each time it opens
  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  const q = search.trim().toLowerCase()
  const results = useMemo(() => rank(entities, q, (e) => e.name), [entities, q])
  const keyResults = useMemo(() => rank(redisKeys, q, (k) => k.key), [redisKeys, q])

  return (
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>{isRedis ? 'Search keys' : 'Search tables'}</DialogTitle>
        <DialogDescription>
          {isRedis
            ? 'Search and open a loaded key on the current Redis connection'
            : 'Search and open a table or view on the current connection'}
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="top-[18%] translate-y-0 overflow-hidden p-0" showCloseButton={false}>
        <Command shouldFilter={false} className="[&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2">
          <CommandInput
            placeholder={isRedis ? 'Search keys…' : 'Search tables…'}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isRedis
                ? redisKeys.length === 0
                  ? 'No keys loaded — scan more in the sidebar.'
                  : 'No matching keys.'
                : 'No tables found.'}
            </CommandEmpty>
            {isRedis ? (
              <CommandGroup
                heading={
                  q
                    ? `${keyResults.length}${keyResults.length >= MAX_RESULTS ? '+' : ''} match`
                    : `${redisKeys.length} loaded key${redisKeys.length === 1 ? '' : 's'}`
                }
              >
                {keyResults.map((k) => (
                  <CommandItem
                    key={k.key}
                    value={k.key}
                    disabled={k.binary}
                    onSelect={() => {
                      openRedisKey(k.key, k.type, redisDb)
                      setPaletteOpen(false)
                    }}
                  >
                    <KeyRound className="text-muted-foreground" />
                    <span className="truncate font-mono">{k.key}</span>
                    <span className="ml-auto text-xs text-muted-foreground/60">{k.type}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandGroup
                heading={
                  q
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
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
