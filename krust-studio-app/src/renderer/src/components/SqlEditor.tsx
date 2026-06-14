import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { sql, MySQL, PostgreSQL, SQLite, type SQLDialect } from '@codemirror/lang-sql'
import { syntaxHighlighting } from '@codemirror/language'
import { krustHighlight, krustTheme } from '@/lib/cm-theme'
import type { DriverType } from '../../../shared/types'

// Per-engine dialect → correct identifier quoting (MySQL backtick vs ANSI "..."),
// keyword set, and string-escape rules.
const DIALECTS: Record<DriverType, SQLDialect> = {
  mysql: MySQL,
  postgres: PostgreSQL,
  sqlite: SQLite
}

interface Props {
  value: string
  onChange: (v: string) => void
  /** Ctrl/Cmd-Enter — passes the selection if any, else the whole doc */
  onRun: (sql: string) => void
  /** table -> columns, for autocomplete; updates dynamically via Compartment */
  schema?: Record<string, string[]>
  /** connection engine — picks the SQL dialect (quoting/keywords) */
  driver?: DriverType
}

export function SqlEditor({ value, onChange, onRun, schema, driver }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onRunRef = useRef(onRun)
  const sqlCompartment = useRef(new Compartment())
  onChangeRef.current = onChange
  onRunRef.current = onRun

  const dialect = (driver && DIALECTS[driver]) || MySQL

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        // Highest precedence so basicSetup's keymap can't swallow Ctrl/Cmd-Enter
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-Enter',
              preventDefault: true,
              run: (v) => {
                const sel = v.state.selection.main
                const text = sel.empty
                  ? v.state.doc.toString()
                  : v.state.sliceDoc(sel.from, sel.to)
                onRunRef.current(text)
                return true
              }
            }
          ])
        ),
        basicSetup,
        // Wrapped in a Compartment so schema/dialect can update without remounting
        sqlCompartment.current.of(
          sql({ dialect, schema, upperCaseKeywords: true })
        ),
        syntaxHighlighting(krustHighlight),
        krustTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        })
      ]
    })
    const v = new EditorView({ state, parent: host.current })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dynamically update schema/dialect without destroying the editor
  useEffect(() => {
    const v = view.current
    if (!v) return
    v.dispatch({
      effects: sqlCompartment.current.reconfigure(
        sql({ dialect, schema, upperCaseKeywords: true })
      )
    })
  }, [schema, dialect])

  // Keep editor in sync when `value` is set externally (tab switch, programmatic
  // set). Skip while the editor is focused: the parent keeps SQL in a ref during
  // typing and only writes it to the store on run, so `value` (= store SQL) lags
  // the live doc. Overwriting a focused editor with that stale value wipes what
  // the user just typed and makes the editor feel frozen / uneditable.
  useEffect(() => {
    const v = view.current
    if (!v || v.hasFocus) return
    if (value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={host} className="h-full overflow-auto" />
}
