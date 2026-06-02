import { useMemo } from 'react'
import { Play, Square, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { SqlEditor } from '@/components/SqlEditor'
import { useConnections } from '@/store/connections'
import type { QueryResult } from '../../../shared/types'

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function ResultRows({ r }: { r: QueryResult }): React.JSX.Element {
  const cols = r.columns ?? []
  const rows = r.rows ?? []
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1 text-[11px] text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-primary" />
        {rows.length} row{rows.length === 1 ? '' : 's'}
        {r.ms != null && <span>· {r.ms} ms</span>}
        <span className="truncate font-mono opacity-60">{r.statement}</span>
      </div>
      <div className="max-h-64 overflow-auto">
        {rows.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">No rows.</div>
        ) : (
          <table className="border-collapse font-mono text-[11px]">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-left text-muted-foreground">
                {cols.map((c) => (
                  <th key={c.name} className="px-2.5 py-1 font-medium whitespace-nowrap">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/20">
                  {cols.map((c) => (
                    <td
                      key={c.name}
                      className="max-w-[22rem] truncate px-2.5 py-1 whitespace-nowrap"
                      title={cell(row[c.name])}
                    >
                      {row[c.name] === null ? (
                        <span className="italic text-muted-foreground/50">NULL</span>
                      ) : (
                        cell(row[c.name])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function QueryView(): React.JSX.Element | null {
  const {
    tabs,
    activeTabId,
    openConnectionId,
    entities,
    setQuerySql,
    setQueryAutoLimit,
    runQuery,
    cancelRunningQuery
  } = useConnections()
  const tab = tabs.find((t) => t.id === activeTabId)
  const q = tab?.query
  const schema = useMemo(
    () => Object.fromEntries(entities.map((e) => [e.name, [] as string[]])),
    [entities]
  )
  if (!q) return null

  const run = (sql: string): void => void runQuery(sql)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
        {q.running ? (
          <Button size="xs" variant="ghost" onClick={() => void cancelRunningQuery()}>
            <Square />
            Cancel
          </Button>
        ) : (
          <Button
            size="xs"
            onClick={() => run(q.sql)}
            disabled={!openConnectionId || !q.sql.trim()}
            title="Run (Ctrl/Cmd+Enter runs the selection)"
          >
            <Play />
            Run
          </Button>
        )}
        {q.running && <Loader2 className="size-3.5 animate-spin" />}
        <span className="text-muted-foreground/60">
          Ctrl+Enter runs selection
        </span>
        <div className="flex-1" />
        <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
          <Checkbox
            checked={q.autoLimit > 0}
            onCheckedChange={(v) => setQueryAutoLimit(v ? 500 : 0)}
          />
          Auto-LIMIT 500
        </label>
      </div>

      <div className="min-h-0 flex-1 border-b border-border">
        <SqlEditor value={q.sql} onChange={setQuerySql} onRun={run} schema={schema} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {q.results.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Results appear here. Write SQL above and Run.
          </div>
        ) : (
          q.results.map((r, i) => (
            <div key={i} className="border-b border-border">
              {r.kind === 'error' ? (
                <div className="flex items-start gap-2 px-3 py-2 text-xs text-destructive">
                  <XCircle className="mt-0.5 size-3.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono break-all opacity-70">{r.statement}</div>
                    <div className="break-all">{r.error}</div>
                  </div>
                </div>
              ) : r.kind === 'affected' ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-primary" />
                  {r.affected} row{r.affected === 1 ? '' : 's'} affected
                  {r.ms != null && <span>· {r.ms} ms</span>}
                  <span className="truncate font-mono opacity-60">{r.statement}</span>
                </div>
              ) : (
                <ResultRows r={r} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
