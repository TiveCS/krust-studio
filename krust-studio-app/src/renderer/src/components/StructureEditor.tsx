import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Undo2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ColumnsEditor, type EditorColumn } from '@/components/ColumnsEditor'
import { useConnections, type Tab } from '@/store/connections'
import type {
  DriverType,
  SchemaOp,
  StructureColumn
} from '../../../shared/types'

const TYPES: Record<DriverType, string[]> = {
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
  mysql: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DATETIME', 'DATE', 'DECIMAL(10,2)', 'BOOLEAN', 'FLOAT'],
  postgres: ['integer', 'bigint', 'serial', 'text', 'varchar(255)', 'boolean', 'timestamp', 'date', 'numeric', 'real']
}

const LIMITS: Record<DriverType, string> = {
  sqlite:
    'SQLite can only add, rename, or drop columns on an existing table. Changing a column’s type or nullability is not supported by SQLite’s ALTER (would need a full table rebuild).',
  postgres:
    'Postgres: introspected types like “USER-DEFINED” (enums) or “timestamp without time zone” are descriptive labels — committing a column to those literal strings can fail. Pick a concrete type (e.g. varchar, timestamptz, the enum’s name) before changing type.',
  mysql: 'MySQL: renaming a column requires MySQL 8.0+.'
}

function seed(cols: StructureColumn[]): EditorColumn[] {
  return cols.map((c) => ({
    name: c.name,
    type: c.type ?? '',
    nullable: c.nullable,
    pk: c.pk,
    default: c.default ?? undefined,
    fk: c.fk
      ? {
          refTable: c.fk.refTable,
          refColumn: c.fk.refColumn,
          onUpdate: c.fk.onUpdate,
          onDelete: c.fk.onDelete,
          constraint: c.fk.constraint
        }
      : undefined,
    _orig: c.name
  }))
}

type Fk = NonNullable<EditorColumn['fk']>
function fkSame(a: Fk, b: Fk): boolean {
  return (
    a.refTable === b.refTable &&
    a.refColumn === b.refColumn &&
    (a.onUpdate || '') === (b.onUpdate || '') &&
    (a.onDelete || '') === (b.onDelete || '')
  )
}
function addFkOp(col: string, fk: Fk): SchemaOp {
  return {
    kind: 'addForeignKey',
    column: col,
    refTable: fk.refTable,
    refColumn: fk.refColumn,
    onUpdate: fk.onUpdate,
    onDelete: fk.onDelete
  }
}

function diff(
  orig: StructureColumn[],
  draft: EditorColumn[],
  canAlter: boolean
): SchemaOp[] {
  const ops: SchemaOp[] = []
  for (const o of orig)
    if (!draft.some((d) => d._orig === o.name))
      ops.push({ kind: 'dropColumn', name: o.name })
  for (const d of draft) {
    if (!d._orig) {
      if (d.name.trim() && d.type.trim()) {
        ops.push({
          kind: 'addColumn',
          column: {
            name: d.name,
            type: d.type,
            nullable: d.nullable,
            pk: d.pk,
            default: d.default?.trim() || undefined
          }
        })
        if (canAlter && d.fk?.refTable && d.fk.refColumn)
          ops.push(addFkOp(d.name, d.fk))
      }
      continue
    }
    const o = orig.find((x) => x.name === d._orig)
    if (!o) continue
    if (d.name !== d._orig && d.name.trim())
      ops.push({ kind: 'renameColumn', from: d._orig, to: d.name })
    if (canAlter) {
      const typeChanged = (d.type || '') !== (o.type || '')
      const nullChanged = d.nullable !== o.nullable
      if (typeChanged || nullChanged)
        ops.push({
          kind: 'alterColumn',
          name: d.name,
          type: d.type,
          nullable: d.nullable
        })
      // default change → set/drop (pg + mysql; sqlite is gated by canAlter)
      const origDef = (o.default ?? '').trim()
      const draftDef = (d.default ?? '').trim()
      if (draftDef !== origDef) {
        if (draftDef)
          ops.push({ kind: 'setDefault', name: d.name, default: draftDef })
        else ops.push({ kind: 'dropDefault', name: d.name })
      }
      // foreign key diff
      const of = o.fk
      const df = d.fk
      if (of && !df && of.constraint)
        ops.push({ kind: 'dropForeignKey', constraint: of.constraint })
      else if (!of && df?.refTable && df.refColumn) ops.push(addFkOp(d.name, df))
      else if (of && df && !fkSame(of, df)) {
        if (of.constraint)
          ops.push({ kind: 'dropForeignKey', constraint: of.constraint })
        if (df.refTable && df.refColumn) ops.push(addFkOp(d.name, df))
      }
    }
  }
  return ops
}

export function StructureEditor({ tab }: { tab: Tab }): React.JSX.Element | null {
  const { connections, openConnectionId, entities, enums, refreshStructure, refreshEntities } =
    useConnections()
  const driver = connections.find((c) => c.id === openConnectionId)?.driver
  const st = tab.structure
  const canAlter = driver !== 'sqlite'
  const types = [...(driver ? TYPES[driver] : []), ...enums.map((e) => e.name)]
  const tableNames = entities.filter((e) => e.type === 'table').map((e) => e.name)

  const [draft, setDraft] = useState<EditorColumn[]>(() => (st ? seed(st.columns) : []))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (st) setDraft(seed(st.columns))
  }, [st])

  const ops = useMemo(
    () => (st ? diff(st.columns, draft, canAlter) : []),
    [st, draft, canAlter]
  )

  // pg types are now canonical (format_type — enums/arrays resolved, ALTER-safe),
  // so the descriptive-type banner is only needed for SQLite's ALTER limits
  const showBanner = driver === 'sqlite'

  if (!st) return null

  const commit = async (): Promise<void> => {
    if (!openConnectionId || ops.length === 0) return
    setBusy(true)
    try {
      const { statements } = await window.api.sessions.alterTable(
        openConnectionId,
        tab.entity,
        ops
      )
      toast.success('Schema updated', { description: statements.join(';\n') })
      await refreshStructure()
      await refreshEntities()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {driver && showBanner && (
          <Alert className="mb-3">
            <Info className="size-4" />
            <AlertDescription className="text-xs text-muted-foreground">
              {LIMITS[driver]}
            </AlertDescription>
          </Alert>
        )}
        <ColumnsEditor
          columns={draft}
          onChange={setDraft}
          types={types}
          tables={tableNames}
          enums={enums}
          allowFk={canAlter}
          canAlterExisting={canAlter}
        />
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3 text-xs text-muted-foreground">
        <span>{ops.length} pending change(s)</span>
        <div className="flex-1" />
        <Button size="xs" onClick={commit} disabled={busy || ops.length === 0}>
          <Check />
          Commit
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setDraft(seed(st.columns))}
          disabled={busy || ops.length === 0}
        >
          <Undo2 />
          Discard
        </Button>
      </div>
    </div>
  )
}
