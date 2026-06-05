import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
      {/* left: room for macOS traffic lights, then app identity / future menu slot */}
      <div
        className={cn('flex items-center gap-2 px-3', isMac && 'pl-[72px]')}
      >
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          Krust Studio
        </span>
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
