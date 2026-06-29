import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, TableProperties, ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ColumnsEditor } from '@/components/ColumnsEditor'
import { useConnections } from '@/store/connections'
import { templateToDraftColumns } from '@/lib/templates'
import type { DriverType, NewColumnSpec } from '../../../shared/types'

const TYPES: Partial<Record<DriverType, string[]>> = {
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
  mysql: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL(10,2)', 'BOOLEAN', 'FLOAT'],
  postgres: ['integer', 'bigint', 'serial', 'text', 'varchar(255)', 'boolean', 'timestamp', 'date', 'numeric', 'real']
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** when provided, opens straight into a new-template editor seeded with these */
  initialColumns?: NewColumnSpec[]
}

type Editing = { id: string | null; name: string; columns: NewColumnSpec[] }

const DEFAULT_COLS: NewColumnSpec[] = [{ name: 'id', type: '', nullable: false, pk: true }]

export function TemplateManager({ open, onOpenChange, initialColumns }: Props): React.JSX.Element {
  const {
    templates,
    connections,
    openConnectionId,
    enums,
    saveTemplate,
    removeTemplate,
    openNewTable
  } = useConnections()
  const driver = connections.find((c) => c.id === openConnectionId)?.driver
  const visible = templates.filter((t) => t.engine === driver)
  const [editing, setEditing] = useState<Editing | null>(null)

  // open straight into a seeded new-template editor (the "Save as template" flow)
  useEffect(() => {
    if (open && initialColumns && initialColumns.length > 0) {
      setEditing({ id: null, name: '', columns: initialColumns.map((c) => ({ ...c })) })
    } else if (!open) {
      setEditing(null)
    }
  }, [open, initialColumns])

  const types = [...(driver ? TYPES[driver] ?? [] : []), ...enums.map((e) => e.name)]

  const startNew = (): void =>
    setEditing({ id: null, name: '', columns: DEFAULT_COLS.map((c) => ({ ...c })) })

  const startEdit = (id: string): void => {
    const t = visible.find((x) => x.id === id)
    if (t) setEditing({ id: t.id, name: t.name, columns: t.columns.map((c) => ({ ...c })) })
  }

  const save = async (): Promise<void> => {
    if (!editing || !driver) return
    const name = editing.name.trim()
    const cols = editing.columns.filter((c) => c.name.trim() && c.type.trim())
    if (!name) {
      toast.error('Template name required')
      return
    }
    if (cols.length === 0) {
      toast.error('At least one named, typed column required')
      return
    }
    try {
      await saveTemplate({
        id: editing.id ?? '',
        name,
        engine: driver,
        columns: cols,
        createdAt: 0
      })
      toast.success(editing.id ? 'Template updated' : 'Template saved')
      setEditing(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const useInNewTable = (id: string): void => {
    const t = visible.find((x) => x.id === id)
    if (!t) return
    openNewTable({ name: t.name, columns: templateToDraftColumns(t) })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing && (
              <button
                onClick={() => setEditing(null)}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Back to list"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <TableProperties className="size-4" />
            {editing ? (editing.id ? 'Edit template' : 'New template') : 'Table templates'}
          </DialogTitle>
          <DialogDescription>
            {driver
              ? `Local column sets for ${driver} connections — used to scaffold new tables. Never applied to the database directly.`
              : 'Connect to a database to manage templates.'}
          </DialogDescription>
        </DialogHeader>

        {!driver ? null : editing ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                autoFocus
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. audit columns"
                className="h-8"
              />
            </div>
            <div className="max-h-[50vh] overflow-auto">
              <ColumnsEditor
                columns={editing.columns}
                onChange={(columns) => setEditing({ ...editing, columns })}
                types={types}
                tables={[]}
                enums={enums}
                allowFk={false}
                reorderable
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={() => void save()}>
                <Check />
                {editing.id ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {visible.length} template(s)
              </span>
              <Button size="xs" onClick={startNew}>
                <Plus />
                New template
              </Button>
            </div>
            <div className="max-h-[55vh] divide-y divide-border/40 overflow-auto rounded-md border border-border">
              {visible.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No templates yet. Create one, or use “Save as template” from a
                  table’s Structure view.
                </div>
              ) : (
                visible.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="flex-1 truncate font-medium">{t.name}</span>
                    <span className="text-muted-foreground/70">
                      {t.columns.length} col{t.columns.length === 1 ? '' : 's'}
                    </span>
                    <Button size="xs" variant="ghost" onClick={() => useInNewTable(t.id)}>
                      Use in new table
                    </Button>
                    <button
                      onClick={() => startEdit(t.id)}
                      title="Edit"
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => void removeTemplate(t.id)}
                      title="Delete"
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
