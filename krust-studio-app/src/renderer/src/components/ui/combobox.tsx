import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  /** allow committing a typed value not in the list */
  creatable?: boolean
  disabled?: boolean
  className?: string
  /** open the popover immediately on mount (inline editors) */
  autoOpen?: boolean
  /** notified when the popover opens/closes */
  onOpenChange?: (open: boolean) => void
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  creatable = false,
  disabled = false,
  className,
  autoOpen = false,
  onOpenChange
}: ComboboxProps): React.JSX.Element {
  const [open, setOpenState] = useState(autoOpen)
  const [query, setQuery] = useState('')
  const q = query.trim()
  const hasExact = options.some((o) => o.toLowerCase() === q.toLowerCase())

  const setOpen = (o: boolean): void => {
    setOpenState(o)
    onOpenChange?.(o)
  }

  const commit = (v: string): void => {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  if (disabled)
    return (
      <div
        className={cn(
          'flex h-7 w-full items-center px-2.5 text-xs text-muted-foreground',
          className
        )}
      >
        <span className="truncate">{value || placeholder}</span>
      </div>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          className={cn(
            'flex h-7 w-full items-center justify-between rounded-md border border-input bg-transparent px-2.5 text-xs shadow-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
            className
          )}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search…"
            className="h-8"
          />
          <CommandList>
            {creatable && q && !hasExact && (
              <CommandItem value={q} onSelect={() => commit(q)}>
                Use “{q}”
              </CommandItem>
            )}
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => commit(o)}>
                  {o}
                  {value === o && <Check className="ml-auto size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
