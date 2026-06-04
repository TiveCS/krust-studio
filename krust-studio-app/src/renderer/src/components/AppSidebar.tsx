import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Table2,
  Eye,
  Plus,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Pencil,
  RefreshCw,
  Trash2,
  Eraser,
  ChevronRight,
  ChevronDown,
  Tags,
  History as HistoryIcon,
  DatabaseBackup
} from 'lucide-react'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInput
} from '@/components/ui/sidebar'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DatabaseSwitcher } from '@/components/DatabaseSwitcher'
import { ConnectionSwitcher } from '@/components/ConnectionSwitcher'
import { BackupDialog } from '@/components/BackupDialog'
import { useConnections } from '@/store/connections'
import type { EntityRef, EntityType, EnumType } from '../../../shared/types'

export function AppSidebar(): React.JSX.Element {
  const {
    connections,
    openConnectionId,
    sessionStatus,
    sessionError,
    entities,
    enums,
    open,
    refreshEntities,
    openTable,
    openNewTable,
    openHistoryTab,
    dropEntity,
    renameTable,
    truncateTable,
    tabs,
    activeTabId
  } = useConnections()
  const historyActive = tabs.find((t) => t.id === activeTabId)?.kind === 'history'
  const [filter, setFilter] = useState('')
  const [renameTarget, setRenameTarget] = useState<EntityRef | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [destructive, setDestructive] = useState<{
    entity: EntityRef
    type: EntityType
    op: 'drop' | 'truncate'
  } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)

  const current = connections.find((c) => c.id === openConnectionId)
  const readOnly = current?.readOnly ?? false

  const startRename = (entity: EntityRef): void => {
    setRenameTarget(entity)
    setRenameValue(entity.name)
  }
  const doRename = async (): Promise<void> => {
    if (!renameTarget) return
    const next = renameValue.trim()
    if (!next || next === renameTarget.name) {
      setRenameTarget(null)
      return
    }
    setBusy(true)
    try {
      const [sql] = await renameTable(renameTarget, next)
      toast.success('Renamed table', { description: sql })
      setRenameTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const startDestructive = (
    entity: EntityRef,
    type: EntityType,
    op: 'drop' | 'truncate'
  ): void => {
    setDestructive({ entity, type, op })
    setConfirmText('')
  }
  const doDestructive = async (): Promise<void> => {
    if (!destructive) return
    const { entity, type, op } = destructive
    setBusy(true)
    try {
      const [sql] =
        op === 'drop'
          ? await dropEntity(entity, type)
          : await truncateTable(entity)
      toast.success(op === 'drop' ? `Dropped ${type}` : 'Truncated table', {
        description: sql
      })
      setDestructive(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const activeName = tabs.find((t) => t.id === activeTabId)?.entity.name

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const match = (n: string): boolean => !q || n.toLowerCase().includes(q)
    return {
      tables: entities.filter((e) => e.type === 'table' && match(e.name)),
      views: entities.filter((e) => e.type === 'view' && match(e.name)),
      enums: enums.filter((e) => match(e.name))
    }
  }, [entities, enums, filter])

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleSection = (k: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  return (
    <Sidebar>
      {/* database switcher (current connection's database) */}
      <SidebarHeader>
        <DatabaseSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {!openConnectionId && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Pick a connection below to browse its schema.
          </div>
        )}

        {sessionStatus === 'connecting' && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Connecting…
          </div>
        )}

        {sessionStatus === 'error' && (
          <div className="m-2 space-y-2 rounded-md border border-destructive/40 p-2 text-xs text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="break-all">{sessionError}</span>
            </div>
            <Button
              size="xs"
              variant="ghost"
              className="w-full"
              onClick={() => openConnectionId && void open(openConnectionId)}
            >
              <RefreshCw />
              Retry
            </Button>
          </div>
        )}

        {sessionStatus === 'connected' && (
          <>
            <div className="flex items-center gap-1 px-2 pt-2">
              <SidebarInput
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter tables…"
                className="h-7"
              />
              <button
                onClick={() => refreshEntities()}
                title="Refresh schema"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className="size-3.5" />
              </button>
              <button
                onClick={() => openNewTable()}
                title="New table"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
              <button
                onClick={() => openHistoryTab()}
                title="Query history"
                className={cn(
                  'rounded p-1 hover:bg-accent hover:text-foreground',
                  historyActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <HistoryIcon className="size-3.5" />
              </button>
              <button
                onClick={() => setBackupOpen(true)}
                title="Backup / Restore"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <DatabaseBackup className="size-3.5" />
              </button>
            </div>
            <EntityGroup
              label="Tables"
              type="table"
              count={grouped.tables.length}
              icon={Table2}
              items={grouped.tables}
              activeName={activeName}
              readOnly={readOnly}
              collapsed={collapsed.has('tables')}
              onToggle={() => toggleSection('tables')}
              onOpen={openTable}
              onRename={startRename}
              onDrop={(e) => startDestructive(e, 'table', 'drop')}
              onTruncate={(e) => startDestructive(e, 'table', 'truncate')}
            />
            <EntityGroup
              label="Views"
              type="view"
              count={grouped.views.length}
              icon={Eye}
              items={grouped.views}
              activeName={activeName}
              readOnly={readOnly}
              collapsed={collapsed.has('views')}
              onToggle={() => toggleSection('views')}
              onOpen={openTable}
              onDrop={(e) => startDestructive(e, 'view', 'drop')}
            />
            <EnumGroup
              items={grouped.enums}
              collapsed={collapsed.has('enums')}
              onToggle={() => toggleSection('enums')}
            />
          </>
        )}
      </SidebarContent>

      {/* connection switcher (searchable) + manage */}
      <SidebarFooter>
        <ConnectionSwitcher />
      </SidebarFooter>

      {/* Backup / Restore */}
      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />

      {/* Rename table */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename table</DialogTitle>
            <DialogDescription>
              Rename <span className="font-mono">{renameTarget?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void doRename()}
            placeholder="New table name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void doRename()}
              disabled={
                busy ||
                !renameValue.trim() ||
                renameValue.trim() === renameTarget?.name
              }
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destructive: drop / truncate (typed confirmation) */}
      <Dialog
        open={!!destructive}
        onOpenChange={(o) => !o && setDestructive(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              {destructive?.op === 'drop'
                ? `Drop ${destructive?.type}`
                : 'Truncate table'}
            </DialogTitle>
            <DialogDescription>
              {destructive?.op === 'drop' ? (
                <>
                  This permanently drops{' '}
                  <span className="font-mono">{destructive?.entity.name}</span>{' '}
                  and all its data. This cannot be undone.
                </>
              ) : (
                <>
                  This permanently deletes all rows in{' '}
                  <span className="font-mono">{destructive?.entity.name}</span>.
                  This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Type{' '}
              <span className="font-mono text-foreground">
                {destructive?.entity.name}
              </span>{' '}
              to confirm.
            </p>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                confirmText === destructive?.entity.name &&
                void doDestructive()
              }
              placeholder={destructive?.entity.name}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDestructive(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void doDestructive()}
              disabled={busy || confirmText !== destructive?.entity.name}
            >
              {destructive?.op === 'drop' ? 'Drop' : 'Truncate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}

function EntityGroup({
  label,
  type,
  count,
  icon: Icon,
  items,
  activeName,
  readOnly,
  collapsed,
  onToggle,
  onOpen,
  onRename,
  onDrop,
  onTruncate
}: {
  label: string
  type: EntityType
  count: number
  icon: typeof Table2
  items: { name: string; schema?: string }[]
  activeName?: string
  readOnly?: boolean
  collapsed?: boolean
  onToggle?: () => void
  onOpen: (entity: EntityRef) => void
  onRename?: (entity: EntityRef) => void
  onDrop: (entity: EntityRef) => void
  onTruncate?: (entity: EntityRef) => void
}): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-1 hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          {label} ({count})
        </button>
      </SidebarGroupLabel>
      {collapsed ? null : (
      <SidebarMenu>
        {items.map((e) => {
          const ref: EntityRef = { name: e.name, schema: e.schema }
          return (
            <SidebarMenuItem key={`${e.schema ?? ''}.${e.name}`}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <SidebarMenuButton
                    isActive={activeName === e.name}
                    className="font-mono text-xs"
                    onDoubleClick={() => onOpen(ref)}
                  >
                    <Icon />
                    <span className="flex-1 truncate">{e.name}</span>
                    {e.schema && e.schema !== 'public' && (
                      <span className="text-[10px] text-muted-foreground">
                        {e.schema}
                      </span>
                    )}
                  </SidebarMenuButton>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => onOpen(ref)}>
                    Show Data
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => void navigator.clipboard.writeText(e.name)}
                  >
                    Copy name
                  </ContextMenuItem>
                  {type === 'table' && onRename && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        disabled={readOnly}
                        onSelect={() => onRename(ref)}
                      >
                        <Pencil />
                        Rename…
                      </ContextMenuItem>
                      {onTruncate && (
                        <ContextMenuItem
                          variant="destructive"
                          disabled={readOnly}
                          onSelect={() => onTruncate(ref)}
                        >
                          <Eraser />
                          Truncate…
                        </ContextMenuItem>
                      )}
                    </>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    disabled={readOnly}
                    onSelect={() => onDrop(ref)}
                  >
                    <Trash2 />
                    Drop {type}…
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
      )}
    </SidebarGroup>
  )
}

function EnumGroup({
  items,
  collapsed,
  onToggle
}: {
  items: EnumType[]
  collapsed?: boolean
  onToggle?: () => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState<Set<string>>(new Set())
  if (items.length === 0) return null
  const toggle = (name: string): void =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-1 hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          Enums ({items.length})
        </button>
      </SidebarGroupLabel>
      {collapsed ? null : (
        <SidebarMenu>
          {items.map((en) => {
            const isOpen = open.has(en.name)
            return (
              <SidebarMenuItem key={`${en.schema ?? ''}.${en.name}`}>
                <SidebarMenuButton
                  className="font-mono text-xs"
                  onClick={() => toggle(en.name)}
                  title="Show values"
                >
                  {isOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                  <Tags className="size-3.5" />
                  <span className="flex-1 truncate">{en.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {en.values.length}
                  </span>
                </SidebarMenuButton>
                {isOpen && (
                  <div className="ml-7 flex flex-col gap-0.5 py-1">
                    {en.values.map((v) => (
                      <span
                        key={v}
                        className="truncate font-mono text-[11px] text-muted-foreground"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      )}
    </SidebarGroup>
  )
}
