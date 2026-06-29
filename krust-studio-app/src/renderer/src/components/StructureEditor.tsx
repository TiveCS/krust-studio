import { Info, Search, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { ColumnsEditor, type EditorColumn } from '@/components/ColumnsEditor'
import { useConnections, type Tab } from '@/store/connections'
import type { DriverType } from '../../../shared/types'

// relational only — redis never opens the structure editor (no schema mutation)
const TYPES: Partial<Record<DriverType, string[]>> = {
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
  mysql: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL(10,2)', 'BOOLEAN', 'FLOAT'],
  postgres: ['integer', 'bigint', 'serial', 'text', 'varchar(255)', 'boolean', 'timestamp', 'date', 'numeric', 'real']
}

const LIMITS: Partial<Record<DriverType, string>> = {
  sqlite:
    'SQLite can only add, rename, or drop columns on an existing table. Changing a column’s type or nullability is not supported by SQLite’s ALTER (would need a full table rebuild).',
  postgres:
    'Postgres: introspected types like “USER-DEFINED” (enums) or “timestamp without time zone” are descriptive labels — committing a column to those literal strings can fail. Pick a concrete type (e.g. varchar, timestamptz, the enum’s name) before changing type.',
  mysql: 'MySQL: renaming a column requires MySQL 8.0+.'
}

/**
 * Column editor (controlled). The staged draft + commit/preview now live in
 * StructureView so columns and indexes commit together. This renders the
 * per-engine limitation banner + the column rows.
 */
export function StructureEditor({
  tab,
  draft,
  onDraftChange,
  movedNames,
  colFilter,
  onColFilterChange
}: {
  tab: Tab
  draft: EditorColumn[]
  onDraftChange: (cols: EditorColumn[]) => void
  movedNames: Set<string>
  colFilter: string
  onColFilterChange: (v: string) => void
}): React.JSX.Element | null {
  const { connections, openConnectionId, entities, enums } = useConnections()
  const driver = connections.find((c) => c.id === openConnectionId)?.driver
  const st = tab.structure
  const canAlter = driver !== 'sqlite'
  const canReorder = driver === 'mysql'
  const types = [...(driver ? TYPES[driver] ?? [] : []), ...enums.map((e) => e.name)]
  const tableNames = entities.filter((e) => e.type === 'table').map((e) => e.name)
  const showBanner = driver === 'sqlite'

  if (!st) return null

  // self-contained flex column so the list scrolls within its bounded area
  // regardless of the parent (StructureView content wrapper isn't a flex box).
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-3 pb-2">
        {driver && showBanner && (
          <Alert className="mb-3">
            <Info className="size-4" />
            <AlertDescription className="text-xs text-muted-foreground">
              {LIMITS[driver]}
            </AlertDescription>
          </Alert>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={colFilter}
            onChange={(e) => onColFilterChange(e.target.value)}
            placeholder="Filter columns…"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {colFilter && (
            <button
              onClick={() => onColFilterChange('')}
              title="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <ColumnsEditor
          columns={draft}
          onChange={onDraftChange}
          types={types}
          tables={tableNames}
          enums={enums}
          allowFk={canAlter}
          canAlterExisting={canAlter}
          reorderable={canReorder}
          original={st.columns}
          movedNames={movedNames}
          nameFilter={colFilter}
          hideAddButton
        />
      </div>
    </div>
  )
}
