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
  DatabaseBackup,
  TableProperties,
  Unplug,
  FunctionSquare,
  Cog,
  FileCode
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DatabaseSwitcher } from '@/components/DatabaseSwitcher'
import { RedisSidebar } from '@/components/RedisSidebar'
import { ConnectionSwitcher } from '@/components/ConnectionSwitcher'
import { TemplateManager } from '@/components/TemplateManager'
import { useConnections } from '@/store/connections'
import { capabilitiesFor } from '../../../shared/capabilities'
import type {
  EntityRef,
  EntityType,
  EnumType,
  RoutineInfo,
  RoutineRef
} from '../../../shared/types'

export function AppSidebar(): React.JSX.Element {
  const {
    connections,
    openConnectionId,
    sessionStatus,
    sessionError,
    entities,
    enums,
    routines,
    open,
    refreshEntities,
    openTable,
    openNewTable,
    openHistoryTab,
    openBackupTab,
    openRoutine,
    openNewRoutine,
    dropRoutine,
    dropEntity,
    renameTable,
    truncateTable,
    reconnect,
    tabs,
    activeTabId
  } = useConnections()
  const activeTabKind = tabs.find((t) => t.id === activeTabId)?.kind
  const historyActive = activeTabKind === 'history'
  const backupActive = activeTabKind === 'backup'
  const [filter, setFilter] = useState('')
  const [schemaFilter, setSchemaFilter] = useState('all')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<EntityRef | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [destructive, setDestructive] = useState<{
    entity: EntityRef
    type: EntityType
    op: 'drop' | 'truncate'
  } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [routineDrop, setRoutineDrop] = useState<RoutineInfo | null>(null)
  const [routineConfirm, setRoutineConfirm] = useState('')


  const current = connections.find((c) => c.id === openConnectionId)
  const readOnly = current?.readOnly ?? false
  const isRedis = current?.driver === 'redis'
  const hasRoutines = current ? capabilitiesFor(current.driver).routines : false

  const doDropRoutine = async (): Promise<void> => {
    if (!routineDrop) return
    setBusy(true)
    try {
      const ref: RoutineRef = {
        schema: routineDrop.schema,
        kind: routineDrop.kind,
        name: routineDrop.name,
        signature: routineDrop.signature
      }
      const [sql] = await dropRoutine(ref)
      toast.success(`Dropped ${routineDrop.kind}`, { description: sql })
      setRoutineDrop(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

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

  // distinct schemas across entities (pg lists multiple; mysql/sqlite have none)
  const schemas = useMemo(
    () => [...new Set(entities.map((e) => e.schema).filter((s): s is string => !!s))].sort(),
    [entities]
  )

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const match = (n: string): boolean => !q || n.toLowerCase().includes(q)
    const matchSchema = (s?: string): boolean =>
      schemaFilter === 'all' || (s ?? '') === schemaFilter
    return {
      tables: entities.filter((e) => e.type === 'table' && match(e.name) && matchSchema(e.schema)),
      views: entities.filter((e) => e.type === 'view' && match(e.name) && matchSchema(e.schema)),
      enums: enums.filter((e) => match(e.name) && matchSchema(e.schema)),
      procedures: routines.filter(
        (r) => r.kind === 'procedure' && match(r.name) && matchSchema(r.schema)
      ),
      functions: routines.filter(
        (r) => r.kind === 'function' && match(r.name) && matchSchema(r.schema)
      )
    }
  }, [entities, enums, routines, filter, schemaFilter])

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

        {sessionStatus === 'disconnected' && (
          <div className="m-2 space-y-2 rounded-md border border-border p-3 text-center text-xs text-muted-foreground">
            <Unplug className="mx-auto size-5 opacity-50" />
            <p>Disconnected. Your tabs are saved.</p>
            <Button
              size="xs"
              variant="secondary"
              className="w-full"
              onClick={() => void reconnect()}
            >
              <RefreshCw />
              Reconnect
            </Button>
          </div>
        )}

        {sessionStatus === 'connected' && isRedis && <RedisSidebar />}

        {sessionStatus === 'connected' && !isRedis && (
          <>
            {/* filter row (refresh sits at its right); actions move to their own
                row below so the filter input isn't cramped */}
            <div className="flex items-center gap-1 px-2 pt-2">
              <SidebarInput
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter tables…"
                className="h-7 flex-1"
              />
              <button
                onClick={() => refreshEntities()}
                title="Refresh schema"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className="size-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1 px-2 pt-1.5">
              <button
                onClick={() => openNewTable()}
                title="New table"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
              {hasRoutines && (
                <button
                  onClick={() => openNewRoutine()}
                  title="New routine"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <FileCode className="size-3.5" />
                </button>
              )}
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
                onClick={() => openBackupTab()}
                title="Backup / Restore"
                className={cn(
                  'rounded p-1 hover:bg-accent hover:text-foreground',
                  backupActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <DatabaseBackup className="size-3.5" />
              </button>
              <button
                onClick={() => setTemplatesOpen(true)}
                title="Table templates"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <TableProperties className="size-3.5" />
              </button>
            </div>
            {schemas.length > 1 && (
              <div className="px-2 pt-1.5">
                <Select value={schemaFilter} onValueChange={setSchemaFilter}>
                  <SelectTrigger className="h-7 w-full text-xs" title="Filter by schema">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">
                      All schemas
                    </SelectItem>
                    {schemas.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
            {hasRoutines && (
              <>
                <RoutineGroup
                  label="Procedures"
                  icon={Cog}
                  items={grouped.procedures}
                  activeName={activeName}
                  readOnly={readOnly}
                  collapsed={collapsed.has('procedures')}
                  onToggle={() => toggleSection('procedures')}
                  onOpen={openRoutine}
                  onDrop={setRoutineDrop}
                />
                <RoutineGroup
                  label="Functions"
                  icon={FunctionSquare}
                  items={grouped.functions}
                  activeName={activeName}
                  readOnly={readOnly}
                  collapsed={collapsed.has('functions')}
                  onToggle={() => toggleSection('functions')}
                  onOpen={openRoutine}
                  onDrop={setRoutineDrop}
                />
              </>
            )}
          </>
        )}
      </SidebarContent>

      {/* connection switcher (searchable) + manage */}
      <SidebarFooter>
        <ConnectionSwitcher />
      </SidebarFooter>

      {/* Table templates */}
      <TemplateManager open={templatesOpen} onOpenChange={setTemplatesOpen} />

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

      {/* Drop routine (typed confirmation) */}
      <Dialog open={!!routineDrop} onOpenChange={(o) => !o && setRoutineDrop(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              Drop {routineDrop?.kind}
            </DialogTitle>
            <DialogDescription>
              This permanently drops{' '}
              <span className="font-mono">{routineDrop?.name}</span>. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Type{' '}
              <span className="font-mono text-foreground">{routineDrop?.name}</span> to
              confirm.
            </p>
            <Input
              autoFocus
              value={routineConfirm}
              onChange={(e) => setRoutineConfirm(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                routineConfirm === routineDrop?.name &&
                void doDropRoutine()
              }
              placeholder={routineDrop?.name}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRoutineDrop(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void doDropRoutine()}
              disabled={busy || routineConfirm !== routineDrop?.name}
            >
              Drop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}

function RoutineGroup({
  label,
  icon: Icon,
  items,
  activeName,
  readOnly,
  collapsed,
  onToggle,
  onOpen,
  onDrop
}: {
  label: string
  icon: typeof Table2
  items: RoutineInfo[]
  activeName?: string
  readOnly?: boolean
  collapsed?: boolean
  onToggle?: () => void
  onOpen: (ref: RoutineRef, label?: string) => void
  onDrop: (r: RoutineInfo) => void
}): React.JSX.Element | null {
  if (items.length === 0) return null
  const refOf = (r: RoutineInfo): RoutineRef => ({
    schema: r.schema,
    kind: r.kind,
    name: r.name,
    signature: r.signature
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
          {label} ({items.length})
        </button>
      </SidebarGroupLabel>
      {collapsed ? null : (
        <SidebarMenu>
          {items.map((r) => (
            <SidebarMenuItem key={`${r.schema ?? ''}.${r.name}.${r.signature ?? ''}`}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <SidebarMenuButton
                    isActive={activeName === r.name}
                    className="font-mono text-xs"
                    onDoubleClick={() => onOpen(refOf(r), r.name)}
                    title={r.label}
                  >
                    <Icon />
                    <span className="flex-1 truncate">{r.name}</span>
                    {r.schema && r.schema !== 'public' && (
                      <span className="text-[10px] text-muted-foreground">{r.schema}</span>
                    )}
                  </SidebarMenuButton>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => onOpen(refOf(r), r.name)}>
                    Open
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => void navigator.clipboard.writeText(r.name)}
                  >
                    Copy name
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    disabled={readOnly}
                    onSelect={() => onDrop(r)}
                  >
                    <Trash2 />
                    Drop {r.kind}…
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      )}
    </SidebarGroup>
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
