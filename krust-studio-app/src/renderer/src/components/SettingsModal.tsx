import { useEffect, useState } from 'react'
import { RotateCcw, Keyboard, Pin, X, History, Table2, AlignLeft } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  const {
    pinnedColumns,
    pinPrimaryKey,
    addPinnedColumn,
    removePinnedColumn,
    setPinnedColumnSide,
    setPinPrimaryKey,
    virtualizeThreshold,
    setVirtualizeThreshold,
    prettySql,
    setPrettySql
  } = useSettings()
  const [recording, setRecording] = useState<CommandId | null>(null)
  const [search, setSearch] = useState('')
  const [section, setSection] = useState<'keybindings' | 'pinned' | 'history' | 'grid' | 'sql'>(
    'keybindings'
  )
  const [pinName, setPinName] = useState('')
  // History settings live in history.db meta (main process), not localStorage.
  const [autoAttachDestructive, setAutoAttachDestructive] = useState<
    boolean | null
  >(null)

  useEffect(() => {
    if (!open) return
    void window.api.history
      .getAutoAttachDestructive()
      .then(setAutoAttachDestructive)
  }, [open])

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
          <div className="w-52 shrink-0 space-y-0.5 border-r p-2">
            <button
              onClick={() => setSection('keybindings')}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-medium',
                section === 'keybindings'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/40'
              )}
            >
              <Keyboard className="size-3.5" />
              Keybindings
            </button>
            <button
              onClick={() => setSection('pinned')}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-medium',
                section === 'pinned'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/40'
              )}
            >
              <Pin className="size-3.5" />
              Pinned Columns
            </button>
            <button
              onClick={() => setSection('history')}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-medium',
                section === 'history'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/40'
              )}
            >
              <History className="size-3.5" />
              History
            </button>
            <button
              onClick={() => setSection('grid')}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-medium',
                section === 'grid'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/40'
              )}
            >
              <Table2 className="size-3.5" />
              Data Grid
            </button>
            <button
              onClick={() => setSection('sql')}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-medium',
                section === 'sql'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/40'
              )}
            >
              <AlignLeft className="size-3.5" />
              SQL
            </button>
          </div>

          {/* grid content */}
          {section === 'grid' && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Virtualization threshold</label>
                <p className="text-[11px] text-muted-foreground">
                  Pages with more rows than this render virtualized (only visible rows
                  in the DOM) for speed; smaller pages render every row directly. Lower
                  it if you hit rendering glitches; raise it to virtualize less.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={0}
                    value={virtualizeThreshold}
                    onChange={(e) => setVirtualizeThreshold(Number(e.target.value))}
                    className="h-7 w-28 text-xs"
                  />
                  <span className="text-[11px] text-muted-foreground">rows</span>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  Default 150: small pages render plainly, big pages virtualize.
                  0 = always virtualize. Page size caps the rows fetched.
                </p>
              </div>
            </div>
          )}

          {/* sql content */}
          {section === 'sql' && (
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <Checkbox
                    checked={prettySql}
                    onCheckedChange={(c) => setPrettySql(c === true)}
                  />
                  Pretty-print SQL by default
                </label>
                <p className="text-[11px] text-muted-foreground">
                  When on, object tabs (CREATE statement, generated DDL) open with the
                  display-only Pretty toggle already enabled. Each tab can still flip its
                  own toggle to override this default for that tab. Copied, executed, and
                  exported SQL is never reformatted — only the on-screen display changes.
                </p>
                <p className="text-[11px] text-muted-foreground/70">Default off.</p>
              </div>
            </div>
          )}

          {/* keybindings content */}
          {section === 'keybindings' && (
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
          )}

          {/* pinned columns content */}
          {section === 'pinned' && (
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
              <div className="space-y-2">
                <div className="text-xs font-medium">Pin by column name</div>
                <p className="text-[11px] text-muted-foreground">
                  Columns with these exact names are frozen to the left or right
                  edge of every table's data grid while scrolling horizontally.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!pinName.trim()) return
                    addPinnedColumn(pinName, 'left')
                    setPinName('')
                  }}
                  className="flex gap-2"
                >
                  <Input
                    placeholder="Column name (e.g. id, RecordStatus)…"
                    value={pinName}
                    onChange={(e) => setPinName(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!pinName.trim()}
                    className="shrink-0 rounded border border-border px-3 py-0.5 text-xs hover:border-primary/40 disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {pinnedColumns.length === 0 && (
                    <span className="text-[11px] text-muted-foreground/60">
                      No name rules yet.
                    </span>
                  )}
                  {pinnedColumns.map((rule) => (
                    <span
                      key={rule.name}
                      className="flex items-center gap-1 rounded border border-border bg-accent/30 py-0.5 pr-1 pl-2 text-xs"
                    >
                      <Pin className="size-2.5 text-primary" />
                      <span className="font-mono">{rule.name}</span>
                      <span className="ml-1 flex overflow-hidden rounded border border-border">
                        {(['left', 'right'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setPinnedColumnSide(rule.name, s)}
                            className={cn(
                              'px-1.5 py-px text-[10px] capitalize',
                              rule.side === s
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent'
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </span>
                      <button
                        onClick={() => removePinnedColumn(rule.name)}
                        title="Remove"
                        className="ml-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <Checkbox
                    checked={pinPrimaryKey.enabled}
                    onCheckedChange={(c) =>
                      setPinPrimaryKey({
                        ...pinPrimaryKey,
                        enabled: c === true
                      })
                    }
                  />
                  Auto-pin primary key column(s)
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Freezes each table's primary key column(s) automatically.
                </p>
                {pinPrimaryKey.enabled && (
                  <RadioGroup
                    value={pinPrimaryKey.side}
                    onValueChange={(v) =>
                      setPinPrimaryKey({ ...pinPrimaryKey, side: v as 'left' | 'right' })
                    }
                    className="flex gap-4"
                  >
                    {(['left', 'right'] as const).map((s) => (
                      <label key={s} className="flex items-center gap-1.5 text-[11px] capitalize">
                        <RadioGroupItem value={s} /> {s}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground/70">
                Tip: right-click any column header in the grid to pin, unpin, or
                override these rules for that tab only.
              </p>
            </div>
          )}

          {/* history content */}
          {section === 'history' && (
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <Checkbox
                    checked={autoAttachDestructive ?? true}
                    disabled={autoAttachDestructive === null}
                    onCheckedChange={(c) => {
                      const on = c === true
                      setAutoAttachDestructive(on)
                      void window.api.history.setAutoAttachDestructive(on)
                    }}
                  />
                  Auto-attach destructive DDL to the active changeset
                </label>
                <p className="text-[11px] text-muted-foreground">
                  When on (default), destructive schema statements
                  (<span className="font-mono">DROP TABLE</span> /{' '}
                  <span className="font-mono">DROP VIEW</span>) attach to the
                  active changeset like other DDL, so you do not forget to
                  include them. When off, they go to the Unassigned inbox and must be
                  moved in manually. Either way they stay in execution order on
                  export. <span className="font-mono">TRUNCATE</span> and row
                  deletes are never auto-attached.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
