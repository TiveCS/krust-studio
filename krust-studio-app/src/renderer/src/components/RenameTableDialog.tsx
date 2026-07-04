import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { SqlDisplay } from '@/components/SqlDisplay'
import { useConnections } from '@/store/connections'
import type { DriverType, EntityRef } from '../../../shared/types'

/**
 * Shared rename-table dialog: name input + a hideable SQL preview sourced from a
 * server dry-run (real driver-generated SQL, not a client-built string), and an
 * immediate apply via the store's `renameTable`. Used by both the sidebar
 * context menu and the Structure-view footer so the preview benefits both.
 */
export function RenameTableDialog({
  entity,
  onClose,
  onRenamed
}: {
  /** table being renamed; `null` closes the dialog */
  entity: EntityRef | null
  onClose: () => void
  /** notified with the new name after a successful rename */
  onRenamed?: (newName: string) => void
}): React.JSX.Element {
  const { connections, openConnectionId, renameTable } = useConnections()
  const driver = connections.find((c) => c.id === openConnectionId)?.driver as
    | DriverType
    | undefined

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewSql, setPreviewSql] = useState<string | null>(null)

  // seed the input + reset preview each time a new target opens
  useEffect(() => {
    if (entity) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(entity.name)
      setShowPreview(false)
      setPreviewSql(null)
    }
  }, [entity])

  const next = value.trim()
  const changed = !!next && next !== entity?.name

  // fetch the dry-run SQL only while the preview is expanded, debounced on input
  useEffect(() => {
    // clearing here would flash stale SQL; the JSX shows a `-- …` placeholder
    // while `previewSql` is null, and the async fetch below overwrites it.
    if (!entity || !showPreview || !changed) return
    let cancelled = false
    const handle = setTimeout(() => {
      void renameTable(entity, next, true)
        .then((statements) => {
          if (!cancelled) setPreviewSql(statements.join('\n'))
        })
        .catch((err) => {
          if (!cancelled) setPreviewSql(`-- ${err instanceof Error ? err.message : String(err)}`)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [entity, showPreview, changed, next, renameTable])

  const doRename = async (): Promise<void> => {
    if (!entity || !changed) {
      onClose()
      return
    }
    setBusy(true)
    try {
      const [sql] = await renameTable(entity, next)
      toast.success('Renamed table', { description: sql })
      onRenamed?.(next)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!entity} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename table</DialogTitle>
          <DialogDescription>
            Rename <span className="font-mono">{entity?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && changed && void doRename()}
          placeholder="New table name"
        />
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            disabled={!changed}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {showPreview ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            Preview SQL
          </button>
          {showPreview && changed && (
            <div className="rounded border">
              <SqlDisplay value={previewSql ?? '-- …'} driver={driver} className="p-2 text-xs" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void doRename()} disabled={busy || !changed}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
