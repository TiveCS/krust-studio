import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Plus, Trash2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from '@/components/ui/select'
import { StructureEditor } from '@/components/StructureEditor'
import { useConnections } from '@/store/connections'

type Sub = 'columns' | 'indexes' | 'relations' | 'ddl'
const SUBS: Sub[] = ['columns', 'indexes', 'relations', 'ddl']
const SUB_LABEL: Record<Sub, string> = {
  columns: 'Columns',
  indexes: 'Indexes',
  relations: 'Relations',
  ddl: 'DDL'
}

// index methods offered per engine (sqlite: none — btree only, no USING)
const INDEX_METHODS: Record<string, string[]> = {
  postgres: ['btree', 'hash', 'gist', 'gin', 'spgist', 'brin'],
  mysql: ['btree', 'hash']
}

const METHOD_DESC: Record<string, string> = {
  default: 'Engine default (B-tree on Postgres & MySQL).',
  btree: 'Balanced tree — general purpose: equality, range (<, >, BETWEEN), ORDER BY.',
  hash: 'Hash table — equality (=) only; fast exact match, no ranges or sorting.',
  gist: 'GiST — geometric, full-text, range & nearest-neighbour searches.',
  gin: 'Inverted index — multi-value columns: arrays, jsonb, full-text.',
  spgist: 'Space-partitioned GiST — non-balanced data: tries, quadtrees, IP ranges.',
  brin: 'Block-range — huge, naturally-ordered tables; tiny & cheap, coarse.'
}

function th(label: string): React.JSX.Element {
  return <th className="px-3 py-1.5 text-left font-medium">{label}</th>
}

export function StructureView(): React.JSX.Element | null {
  const {
    tabs,
    activeTabId,
    refreshStructure,
    createIndex,
    dropIndex,
    connections,
    openConnectionId
  } = useConnections()
  const [sub, setSub] = useState<Sub>('columns')
  const [addOpen, setAddOpen] = useState(false)
  const [ixName, setIxName] = useState('')
  const [ixUnique, setIxUnique] = useState(false)
  const [ixCols, setIxCols] = useState<string[]>([])
  const [ixMethod, setIxMethod] = useState('')
  const [dropName, setDropName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ddl, setDdl] = useState<string | null>(null)
  const [ddlLoading, setDdlLoading] = useState(false)
  const tab = tabs.find((t) => t.id === activeTabId)

  const entityKey = tab ? `${tab.entity.schema ?? ''}.${tab.entity.name}` : ''
  useEffect(() => {
    if (sub !== 'ddl' || !openConnectionId || !tab) return
    let live = true
    setDdlLoading(true)
    setDdl(null)
    window.api.sessions
      .getCreateSql(openConnectionId, tab.entity)
      .then((s) => live && setDdl(s))
      .catch((e) => live && setDdl(`-- ${e instanceof Error ? e.message : e}`))
      .finally(() => live && setDdlLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, openConnectionId, entityKey])

  if (!tab) return null

  const st = tab.structure
  const connRow = connections.find((c) => c.id === openConnectionId)
  const readOnly = connRow?.readOnly ?? false
  const methods = INDEX_METHODS[connRow?.driver ?? ''] ?? []

  const toggleCol = (name: string): void =>
    setIxCols((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    )

  const submitIndex = async (): Promise<void> => {
    if (ixCols.length === 0) return
    setBusy(true)
    try {
      const [sql] = await createIndex({
        name: ixName.trim() || undefined,
        columns: ixCols,
        unique: ixUnique,
        method: ixMethod || undefined
      })
      toast.success('Index created', { description: sql })
      setAddOpen(false)
      setIxName('')
      setIxUnique(false)
      setIxCols([])
      setIxMethod('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const submitDrop = async (): Promise<void> => {
    if (!dropName) return
    setBusy(true)
    try {
      const [sql] = await dropIndex(dropName)
      toast.success('Index dropped', { description: sql })
      setDropName(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-2 text-xs">
        {SUBS.map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className={cn(
              'rounded px-2 py-1',
              sub === s
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
          >
            {SUB_LABEL[s]}
            {st && (s === 'indexes' || s === 'relations') && (
              <span className="ml-1 text-muted-foreground/50">
                {s === 'indexes' ? st.indexes.length : st.relations.length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => refreshStructure()}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Refresh structure"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 text-xs">
        {sub === 'ddl' ? (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center border-b border-border/60 px-3 py-1.5">
              <span className="text-muted-foreground">CREATE statement</span>
              <div className="flex-1" />
              <Button
                size="xs"
                variant="ghost"
                disabled={!ddl}
                onClick={() => {
                  if (ddl) {
                    void navigator.clipboard.writeText(ddl)
                    toast.success('Copied DDL')
                  }
                }}
              >
                <Copy />
                Copy
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {ddlLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : (
                <pre className="font-mono text-xs break-all whitespace-pre-wrap">
                  {ddl}
                </pre>
              )}
            </div>
          </div>
        ) : tab.structureLoading || !st ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : sub === 'columns' ? (
          <StructureEditor tab={tab} />
        ) : sub === 'indexes' ? (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center border-b border-border/60 px-3 py-1.5">
              <Button
                size="xs"
                variant="ghost"
                disabled={readOnly}
                onClick={() => setAddOpen(true)}
              >
                <Plus />
                Add index
              </Button>
              {readOnly && (
                <span className="ml-2 text-amber-500/80">read-only</span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {st.indexes.length === 0 ? (
                <div className="px-3 py-3 text-muted-foreground">No indexes.</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-background text-muted-foreground">
                    <tr className="border-b border-border">
                      {th('Name')}
                      {th('Unique')}
                      {th('Method')}
                      {th('Columns')}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {st.indexes.map((ix) => (
                      <tr
                        key={ix.name}
                        className="group border-b border-border/30"
                      >
                        <td className="px-3 py-1 font-mono">{ix.name}</td>
                        <td className="px-3 py-1">
                          <Checkbox checked={ix.unique} disabled />
                        </td>
                        <td className="px-3 py-1 font-mono lowercase text-muted-foreground">
                          {ix.method ?? '—'}
                        </td>
                        <td className="px-3 py-1 font-mono text-muted-foreground">
                          {ix.columns.join(', ')}
                        </td>
                        <td className="px-3 py-1">
                          <button
                            disabled={readOnly}
                            onClick={() => setDropName(ix.name)}
                            title="Drop index"
                            className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive disabled:opacity-0"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            {st.relations.length === 0 ? (
              <div className="px-3 py-3 text-muted-foreground">No relations.</div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-background text-muted-foreground">
                  <tr className="border-b border-border">
                    {th('Column')}
                    {th('References')}
                    {th('On Update')}
                    {th('On Delete')}
                  </tr>
                </thead>
                <tbody>
                  {st.relations.map((r, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-3 py-1 font-mono">{r.column}</td>
                      <td className="px-3 py-1 font-mono text-primary">
                        {r.refTable}.{r.refColumn}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {r.onUpdate || '—'}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {r.onDelete || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add index</DialogTitle>
            <DialogDescription>
              on <span className="font-mono">{tab.entity.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={ixName}
              onChange={(e) => setIxName(e.target.value)}
              placeholder="Index name (optional — auto if blank)"
            />
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Columns {ixCols.length > 0 && `· ${ixCols.join(', ')}`}
              </p>
              <div className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border p-2">
                {(st?.columns ?? []).map((c) => (
                  <label
                    key={c.name}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={ixCols.includes(c.name)}
                      onCheckedChange={() => toggleCol(c.name)}
                    />
                    <span className="font-mono">{c.name}</span>
                    <span className="text-muted-foreground/60">{c.type}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={ixUnique}
                  onCheckedChange={(v) => setIxUnique(v === true)}
                />
                Unique
              </label>
              {methods.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Method</span>
                  <Select
                    value={ixMethod || 'default'}
                    onValueChange={(v) => setIxMethod(v === 'default' ? '' : v)}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <span className="truncate">{ixMethod || 'default'}</span>
                    </SelectTrigger>
                    <SelectContent className="w-[22rem]">
                      {['default', ...methods].map((m) => (
                        <SelectItem key={m} value={m} className="items-start py-1.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium lowercase">{m}</span>
                            <span className="text-[11px] leading-snug text-muted-foreground">
                              {METHOD_DESC[m]}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitIndex()}
              disabled={busy || ixCols.length === 0}
            >
              Create index
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dropName} onOpenChange={(o) => !o && setDropName(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop index</DialogTitle>
            <DialogDescription>
              Drop <span className="font-mono">{dropName}</span>? This only removes
              the index, not data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDropName(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitDrop()}
              disabled={busy}
            >
              Drop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
