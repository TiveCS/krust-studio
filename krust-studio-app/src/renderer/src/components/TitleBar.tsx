import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, ChevronDown, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

type UpdateResult = {
  status: 'dev' | 'up-to-date' | 'available' | 'unknown' | 'error'
  version?: string
  current?: string
  error?: string
}

async function checkForUpdates(): Promise<void> {
  toast.loading('Checking for updates…', { id: 'upd' })
  const r = (await window.electron.ipcRenderer.invoke('update:check')) as UpdateResult
  switch (r.status) {
    case 'available':
      toast.info(`Update v${r.version} found — downloading…`, { id: 'upd' })
      break
    case 'up-to-date':
      toast.success(`You're up to date (v${r.current})`, { id: 'upd' })
      break
    case 'dev':
      toast.info('Updates are disabled in development', { id: 'upd' })
      break
    case 'error':
      toast.error(`Update check failed: ${r.error}`, { id: 'upd' })
      break
    default:
      toast.message('Could not determine update status', { id: 'upd' })
  }
}

// @electron-toolkit/preload exposes process info on window.electron
const isMac =
  (window as unknown as { electron?: { process?: { platform?: string } } }).electron
    ?.process?.platform === 'darwin'

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.window.isMaximized().then(setMaximized)
    return window.api.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <div className="app-drag flex h-8 shrink-0 items-center border-b border-border bg-card/40 select-none">
      {/* left: room for macOS traffic lights, then app menu */}
      <div className={cn('app-no-drag flex items-center px-1', isMac && 'pl-[72px]')}>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground">
            Krust Studio
            <ChevronDown className="size-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onSelect={() => void checkForUpdates()}>
              <RefreshCw className="size-4" />
              Check for updates
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* draggable filler */}
      <div className="h-full flex-1" />

      {/* right: window controls (Windows/Linux only — macOS uses native lights) */}
      {!isMac && (
        <div className="app-no-drag flex h-full items-stretch">
          <button
            onClick={() => window.api.window.minimize()}
            title="Minimize"
            className="flex w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            onClick={() => window.api.window.toggleMaximize()}
            title={maximized ? 'Restore' : 'Maximize'}
            className="flex w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {maximized ? (
              <Copy className="size-3 -scale-x-100" />
            ) : (
              <Square className="size-3" />
            )}
          </button>
          <button
            onClick={() => window.api.window.close()}
            title="Close"
            className="flex w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
