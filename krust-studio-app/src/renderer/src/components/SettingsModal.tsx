import { useEffect, useState } from 'react'
import { RotateCcw, Keyboard } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useSettings } from '@/store/settings'
import {
  COMMANDS,
  formatBinding,
  serializeKey,
  scopesOverlap
} from '@/lib/commands'
import type { CommandId, KeybindingScope } from '@/lib/commands'

const SCOPE_LABELS: Record<KeybindingScope, string> = {
  global: 'Global',
  'table-tab': 'Table',
  'data-view': 'Data',
  'structure-view': 'Structure'
}

export function SettingsModal({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}): React.JSX.Element {
  const { keybindings, setKeybinding, resetKeybinding, resetAll } = useSettings()
  const [recording, setRecording] = useState<CommandId | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      // modifier-only presses — wait for actual key
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      setKeybinding(recording, serializeKey(e))
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, setKeybinding])

  // Cancel recording when modal closes
  useEffect(() => {
    if (!open) setRecording(null)
  }, [open])

  const filtered = COMMANDS.filter(
    (cmd) => !search.trim() || cmd.label.toLowerCase().includes(search.toLowerCase()) || cmd.description.toLowerCase().includes(search.toLowerCase())
  )

  function getConflicts(cmdId: CommandId, binding: string): string[] {
    return COMMANDS.filter((other) => {
      if (other.id === cmdId) return false
      const otherBinding = keybindings[other.id] ?? other.defaultKey
      return otherBinding === binding && scopesOverlap(COMMANDS.find(c => c.id === cmdId)!.scope, other.scope)
    }).map((c) => c.label)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] w-[80vw] max-w-none! flex-col gap-0 overflow-hidden p-0 sm:max-w-none!">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Configure keybindings for Krust Studio
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* left nav */}
          <div className="w-52 shrink-0 border-r p-2">
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-medium bg-accent text-foreground">
              <Keyboard className="size-3.5" />
              Keybindings
            </button>
          </div>

          {/* keybindings content */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
            <Input
              placeholder="Search commands…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
            />

            <div className="space-y-0.5">
              {filtered.map((cmd) => {
                const binding = keybindings[cmd.id] ?? cmd.defaultKey
                const isOverride = !!keybindings[cmd.id]
                const isRecording = recording === cmd.id
                const conflicts = isRecording ? [] : getConflicts(cmd.id, binding)

                return (
                  <div
                    key={cmd.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{cmd.label}</span>
                        {isOverride && (
                          <span className="text-[9px] text-primary">modified</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {cmd.description}
                      </div>
                    </div>

                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      {SCOPE_LABELS[cmd.scope]}
                    </span>

                    <div className="flex shrink-0 items-center gap-1">
                      {conflicts.length > 0 && (
                        <span
                          className="text-[9px] text-destructive"
                          title={`Conflicts with: ${conflicts.join(', ')}`}
                        >
                          ⚠
                        </span>
                      )}
                      <button
                        onClick={() => setRecording(isRecording ? null : cmd.id)}
                        className={cn(
                          'min-w-[96px] rounded border px-2 py-0.5 text-left font-mono text-xs',
                          isRecording
                            ? 'animate-pulse border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background hover:border-primary/40'
                        )}
                      >
                        {isRecording ? 'Press a key…' : formatBinding(binding)}
                      </button>
                      {isOverride && (
                        <button
                          onClick={() => resetKeybinding(cmd.id)}
                          title="Reset to default"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t pt-2">
              <button
                onClick={resetAll}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Reset all keybindings to defaults
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
