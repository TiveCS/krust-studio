import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ColumnsEditor } from '@/components/ColumnsEditor'
import { TemplateManager } from '@/components/TemplateManager'
import { useConnections, type Tab } from '@/store/connections'
import type { DriverType } from '../../../shared/types'

const TYPES: Record<DriverType, string[]> = {
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
  mysql: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL(10,2)', 'BOOLEAN', 'FLOAT'],
  postgres: ['integer', 'bigint', 'serial', 'text', 'varchar(255)', 'boolean', 'timestamp', 'date', 'numeric', 'real']
}

export function NewTableEditor({ tab }: { tab: Tab }): React.JSX.Element {
  const { connections, openConnectionId, entities, enums, patchDraft, createTable, closeTab, openTable } =
    useConnections()
  const driver = connections.find((c) => c.id === openConnectionId)?.driver
  const types = [...(driver ? TYPES[driver] : []), ...enums.map((e) => e.name)]
  const tables = entities.filter((e) => e.type === 'table').map((e) => e.name)
  const [busy, setBusy] = useState(false)
  const [tmplOpen, setTmplOpen] = useState(false)
  const draft = tab.draft!

  const create = async (): Promise<void> => {
    const valid = draft.columns.filter((c) => c.name.trim() && c.type.trim())
    if (!draft.name.trim() || valid.length === 0) {
      toast.error('Table name and at least one named column required')
      return
    }
    setBusy(true)
    try {
      const ddl = await createTable({ name: draft.name.trim(), columns: valid })
      toast.success('Table created', { description: ddl })
      closeTab(tab.id)
      await openTable({ name: draft.name.trim() })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Table name
            </label>
            <Input
              value={draft.name}
              onChange={(e) => patchDraft({ name: e.target.value })}
              placeholder="my_table"
              className="h-8"
            />
          </div>
          <ColumnsEditor
            columns={draft.columns}
            onChange={(columns) => patchDraft({ columns })}
            types={types}
            tables={tables}
            enums={enums}
            allowFk
            reorderable
          />
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3">
        <span className="text-xs text-muted-foreground">New table draft</span>
        <div className="flex-1" />
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setTmplOpen(true)}
          disabled={draft.columns.every((c) => !c.name.trim() || !c.type.trim())}
          title="Save these columns as a reusable template"
        >
          <Bookmark />
          Save as template
        </Button>
        <Button size="xs" onClick={create} disabled={busy}>
          <Check />
          Create
        </Button>
        <Button size="xs" variant="ghost" onClick={() => closeTab(tab.id)}>
          Discard
        </Button>
      </div>

      <TemplateManager
        open={tmplOpen}
        onOpenChange={setTmplOpen}
        initialColumns={draft.columns.filter((c) => c.name.trim() && c.type.trim())}
      />
    </div>
  )
}
