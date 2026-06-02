import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatRows } from '@/lib/export'
import type { ColumnInfo, SearchResult } from '../../../shared/types'

type Data = { columns: ColumnInfo[]; rows: Record<string, unknown>[] }
type Scope = 'page' | 'selection' | 'all'
type Format = 'csv' | 'json'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityName: string
  page: Data
  selection: Data | null
  onFetchAll: () => Promise<SearchResult>
}

export function ExportDialog({
  open,
  onOpenChange,
  entityName,
  page,
  selection,
  onFetchAll
}: Props): React.JSX.Element {
  const [scope, setScope] = useState<Scope>('page')
  const [format, setFormat] = useState<Format>('csv')
  const [busy, setBusy] = useState(false)

  const eff: Scope = scope === 'selection' && !selection ? 'page' : scope

  const resolve = async (): Promise<Data> => {
    if (eff === 'selection' && selection) return selection
    if (eff === 'all') return onFetchAll()
    return page
  }

  const run = async (action: 'copy' | 'save'): Promise<void> => {
    setBusy(true)
    try {
      const { columns, rows } = await resolve()
      const text = formatRows(format, columns, rows)
      if (action === 'copy') {
        await navigator.clipboard.writeText(text)
        toast.success(`Copied ${rows.length} row(s)`)
      } else {
        const res = await window.api.dialog.saveText(
          `${entityName}.${format}`,
          text
        )
        if (res.saved)
          toast.success(`Exported ${rows.length} row(s)`, {
            description: res.path
          })
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const seg = (active: boolean): string =>
    cn(
      'rounded px-2.5 py-1 text-xs',
      active
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:text-foreground'
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Rows</p>
            <div className="inline-flex rounded-md border border-border p-0.5">
              <button onClick={() => setScope('page')} className={seg(eff === 'page')}>
                Current page ({page.rows.length})
              </button>
              <button
                onClick={() => selection && setScope('selection')}
                disabled={!selection}
                className={cn(seg(eff === 'selection'), !selection && 'opacity-40')}
              >
                Selection{selection ? ` (${selection.rows.length})` : ''}
              </button>
              <button onClick={() => setScope('all')} className={seg(eff === 'all')}>
                All matching filter
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">Format</p>
            <div className="inline-flex rounded-md border border-border p-0.5">
              <button onClick={() => setFormat('csv')} className={seg(format === 'csv')}>
                CSV
              </button>
              <button onClick={() => setFormat('json')} className={seg(format === 'json')}>
                JSON
              </button>
            </div>
          </div>

          {eff === 'all' && (
            <p className="text-xs text-muted-foreground/70">
              Fetches every row matching the current filter (capped at 500k).
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void run('copy')} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Copy />}
            Copy
          </Button>
          <Button onClick={() => void run('save')} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            Save…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
