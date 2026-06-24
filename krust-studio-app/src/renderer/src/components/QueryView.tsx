import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Gauge,
  Save,
  AlignLeft
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { SqlEditor, type SqlEditorHandle } from '@/components/SqlEditor'
import { QueryPlanPanel } from '@/components/QueryPlanPanel'
import { useConnections } from '@/store/connections'
import type { QueryResult, EntityInfo } from '../../../shared/types'

const EDITOR_MIN = 60
const RESULTS_MIN = 80
const EDITOR_DEFAULT = 220

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
  )
}

export function QueryView(): React.JSX.Element | null {
  const {
    tabs,
    activeTabId,
    openConnectionId,
    entities,
    connections,
    setQuerySql,
    setQueryAutoLimit,
    runQuery,
    explainQuery,
    clearPlan,
    cancelRunningQuery
  } = useConnections()
  const tab = tabs.find((t) => t.id === activeTabId)
  const driver = connections.find((c) => c.id === openConnectionId)?.driver
  const q = tab?.query

  // Column schema for autocomplete. Seed table NAMES (empty columns) so table
  // completion works instantly; columns load lazily per table referenced in the
  // SQL (parse FROM/JOIN), so we never fire 100+ describeTable calls at once.
  const [colSchema, setColSchema] = useState<Record<string, string[]>>({})

  // entity name → ref (for case-insensitive lookup against the SQL)
  const entityByLower = useMemo(() => {
    const m = new Map<string, EntityInfo>()
    for (const e of entities) m.set(e.name.toLowerCase(), e)
    return m
  }, [entities])

  // Seed table names (empty cols) + columns from any already-open table tabs.
  useEffect(() => {
    setColSchema((prev) => {
      const next = { ...prev }
      for (const e of entities) if (!(e.name in next)) next[e.name] = []
      for (const t of tabs) {
        if (!t.query && t.structure)
          next[t.entity.name] = t.structure.columns.map((c) => c.name)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities])

  // Lazily load columns for tables referenced in the SQL (debounced, no churn).
  const colSchemaRef = useRef(colSchema)
  colSchemaRef.current = colSchema
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadReferencedTables = useCallback(
    (sql: string) => {
      if (loadTimer.current) clearTimeout(loadTimer.current)
      loadTimer.current = setTimeout(() => {
        if (!openConnectionId) return
        // table names after FROM / JOIN / UPDATE / INTO (optionally quoted)
        const re = /\b(?:from|join|update|into)\s+[`"[]?(\w+)[`"\]]?/gi
        const wanted = new Set<string>()
        let m: RegExpExecArray | null
        while ((m = re.exec(sql)) !== null) wanted.add(m[1].toLowerCase())

        const toLoad: EntityInfo[] = []
        for (const name of wanted) {
          const ent = entityByLower.get(name)
          if (ent && (colSchemaRef.current[ent.name]?.length ?? 0) === 0)
            toLoad.push(ent)
        }
        if (toLoad.length === 0) return

        const batch: Record<string, string[]> = {}
        Promise.allSettled(
          toLoad.map(async (e) => {
            try {
              const s = await window.api.sessions.describeTable(openConnectionId, e)
              batch[e.name] = s.columns.map((c) => c.name)
            } catch { /* skip */ }
          })
        ).then(() => {
          if (Object.keys(batch).length > 0)
            setColSchema((prev) => ({ ...prev, ...batch }))
        })
      }, 350)
    },
    [openConnectionId, entityByLower]
  )

  // Load tables referenced in the initial SQL on mount / tab switch
  useEffect(() => {
    if (q?.sql) loadReferencedTables(q.sql)
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.id])

  const schema = useMemo(() => colSchema, [colSchema])

  // SQL lives in a ref during typing — no re-renders on keystrokes.
  // Flushed to store on run (so re-renders from results use current SQL)
  // and on unmount (so tab-switch preserves unsaved SQL).
  // `hasSql` mirrors only the empty↔non-empty transition so Run/Explain enable
  // as you type (store `q.sql` lags behind the ref — setState bails on no change).
  const sqlRef = useRef(q?.sql ?? '')
  const editorRef = useRef<SqlEditorHandle>(null)
  const [hasSql, setHasSql] = useState((q?.sql ?? '').trim().length > 0)
  const setQuerySqlRef = useRef(setQuerySql)
  setQuerySqlRef.current = setQuerySql

  // This component is keyed by tab.id (TableTabView), so its tab identity is
  // fixed for its whole lifetime. Capture it once: every flush (blur/debounce/
  // unmount) targets THIS tab explicitly, never activeTabId — by flush time the
  // active tab may have already moved away (ADR-0018).
  const myTabIdRef = useRef(tab?.id)

  // Debounced flush of the typing ref → store (500ms idle). Covers "paste, then
  // sit on the focused tab" where neither blur nor unmount fires before quit.
  const sqlFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSqlFlush = useCallback((v: string) => {
    if (sqlFlushTimer.current) clearTimeout(sqlFlushTimer.current)
    sqlFlushTimer.current = setTimeout(() => {
      if (myTabIdRef.current) setQuerySqlRef.current(myTabIdRef.current, v)
    }, 500)
  }, [])

  const flushSqlNow = useCallback(() => {
    if (sqlFlushTimer.current) { clearTimeout(sqlFlushTimer.current); sqlFlushTimer.current = null }
    if (myTabIdRef.current) setQuerySqlRef.current(myTabIdRef.current, sqlRef.current)
  }, [])

  // When tab actually switches (id changes), sync ref from store
  const tabId = tab?.id
  useEffect(() => {
    sqlRef.current = q?.sql ?? ''
    setHasSql((q?.sql ?? '').trim().length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // Flush to store on unmount (tab close / tab switch) — explicit tabId
  useEffect(() => {
    return () => { flushSqlNow() }
  }, [flushSqlNow])

  // Resizable split ─────────────────────────────────────────────────────────
  // editorH drives initial render only; during drag we mutate the DOM directly
  // to avoid React re-renders on every mousemove pixel.
  const [editorH, setEditorH] = useState(EDITOR_DEFAULT)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startH: number; liveH: number } | null>(null)

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const h = editorPaneRef.current?.offsetHeight ?? editorH
    drag.current = { startY: e.clientY, startH: h, liveH: h }
  }, [editorH])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = drag.current
      if (!d || !containerRef.current || !editorPaneRef.current) return
      const containerH = containerRef.current.offsetHeight
      const next = Math.max(EDITOR_MIN, Math.min(containerH - RESULTS_MIN - 5, d.startH + (e.clientY - d.startY)))
      d.liveH = next
      // Direct DOM write — zero React overhead during drag
      editorPaneRef.current.style.height = `${next}px`
    }
    const onUp = (): void => {
      if (drag.current) setEditorH(drag.current.liveH) // single commit on release
      drag.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
  // ─────────────────────────────────────────────────────────────────────────

  if (!q) return null

  const run = (sql: string): void => {
    // Sync store once so re-renders triggered by results use current SQL
    if (myTabIdRef.current) setQuerySql(myTabIdRef.current, sql)
    sqlRef.current = sql
    void runQuery(sql)
  }

  // Save the editor SQL to a .sql file. Defaults to the opened filename (shown
  // as the tab label) when this tab came from a file, else `query.sql`.
  const saveSql = (): void => {
    const label = tab?.entity.name ?? ''
    const name = label.toLowerCase().endsWith('.sql') ? label : 'query.sql'
    void window.api.dialog.saveText(name, sqlRef.current)
  }

  const explain = (analyze: boolean): void => {
    if (myTabIdRef.current) setQuerySql(myTabIdRef.current, sqlRef.current)
    if (
      analyze &&
      !window.confirm(
        'ANALYZE actually executes the statement. On a write (INSERT/UPDATE/DELETE) this will modify data. Continue?'
      )
    )
      return
    void explainQuery(analyze)
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
        {q.running ? (
          <Button size="xs" variant="ghost" onClick={() => void cancelRunningQuery()}>
            <Square />
            Cancel
          </Button>
        ) : (
          <Button
            size="xs"
            onClick={() => run(sqlRef.current)}
            disabled={!openConnectionId || !hasSql}
            title="Run (Ctrl/Cmd+Enter runs the selection)"
          >
            <Play />
            Run
          </Button>
        )}
        {q.running && <Loader2 className="size-3.5 animate-spin" />}
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          size="xs"
          variant="ghost"
          onClick={() => explain(false)}
          disabled={!openConnectionId || !hasSql || q.planning}
          title="EXPLAIN — show the query plan without running the query"
        >
          {q.planning ? <Loader2 className="size-3.5 animate-spin" /> : <Gauge />}
          Explain
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => explain(true)}
          disabled={!openConnectionId || !hasSql || q.planning}
          title="EXPLAIN ANALYZE — runs the query and shows real timings"
        >
          Analyze
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          size="xs"
          variant="ghost"
          onClick={saveSql}
          disabled={!hasSql}
          title="Save the editor SQL to a .sql file"
        >
          <Save />
          Save .sql
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => editorRef.current?.format()}
          disabled={!hasSql}
          title="Format SQL (Shift+Alt+F)"
        >
          <AlignLeft />
          Format SQL
        </Button>
        <span className="text-muted-foreground/60">Ctrl+Enter runs selection</span>
        <div className="flex-1" />
        <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
          <Checkbox
            checked={q.autoLimit > 0}
            onCheckedChange={(v) => setQueryAutoLimit(v ? 500 : 0)}
          />
          Auto-LIMIT 500
        </label>
      </div>

      {/* editor pane — fixed height, user-resizable */}
      <div ref={editorPaneRef} className="shrink-0 overflow-hidden border-b border-border" style={{ height: editorH }}>
        <SqlEditor
          ref={editorRef}
          value={q.sql}
          onChange={(v) => {
            sqlRef.current = v
            setHasSql(v.trim().length > 0)
            loadReferencedTables(v)
            scheduleSqlFlush(v)
          }}
          onBlur={flushSqlNow}
          onRun={run}
          schema={schema}
          driver={driver}
          onFormatError={(message) => toast.error('Could not format SQL', { description: message })}
        />
      </div>

      {/* drag handle */}
      <div
        onMouseDown={onHandleMouseDown}
        className="group relative h-[5px] shrink-0 cursor-row-resize bg-border/0 hover:bg-primary/30 active:bg-primary/40 transition-colors"
        title="Drag to resize"
      >
        {/* visual indicator line */}
        <div className="absolute inset-x-0 top-[2px] h-px bg-border group-hover:bg-primary/50" />
      </div>

      {/* results pane — takes all remaining space; query plan takes over when set */}
      {q.plan ? (
        <div className="min-h-0 flex-1">
          <QueryPlanPanel plan={q.plan} onClose={clearPlan} />
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-auto">
        {q.results.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Results appear here. Write SQL above and Run.
          </div>
        ) : (
          q.results.map((r, i) => (
            <div key={i} className="border-b border-border">
              {r.kind === 'reconnected' ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-amber-500">
                  <RefreshCw className="size-3.5 shrink-0" />
                  Connection lost — reconnected. Re-run to execute.
                  <span className="truncate font-mono opacity-60">{r.statement}</span>
                </div>
              ) : r.kind === 'error' ? (
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
      )}
    </div>
  )
}
