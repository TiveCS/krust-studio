import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { sql, MySQL, PostgreSQL, SQLite, type SQLDialect } from '@codemirror/lang-sql'
import { syntaxHighlighting } from '@codemirror/language'
import { krustHighlight, krustTheme } from '@/lib/cm-theme'
import { formatSql } from '@/lib/sqlFormat'
import type { DriverType } from '../../../shared/types'

// Per-engine dialect → correct identifier quoting (MySQL backtick vs ANSI "..."),
// keyword set, and string-escape rules.
const DIALECTS: Partial<Record<DriverType, SQLDialect>> = {
  mysql: MySQL,
  postgres: PostgreSQL,
  sqlite: SQLite
}

interface Props {
  value: string
  onChange: (v: string) => void
  /** fired when the editor loses focus — used to flush the SQL draft (ADR-0018) */
  onBlur?: () => void
  /** Ctrl/Cmd-Enter — passes the selection if any, else the whole doc */
  onRun: (sql: string) => void
  /** table -> columns, for autocomplete; updates dynamically via Compartment */
  schema?: Record<string, string[]>
  /** connection engine — picks the SQL dialect (quoting/keywords) */
  driver?: DriverType
  onFormatError?: (message: string) => void
}

export interface SqlEditorHandle {
  format: () => void
}

export const SqlEditor = forwardRef<SqlEditorHandle, Props>(function SqlEditor(
  { value, onChange, onBlur, onRun, schema, driver, onFormatError },
  ref
): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  const onRunRef = useRef(onRun)
  const onFormatErrorRef = useRef(onFormatError)
  const sqlCompartment = useRef(new Compartment())
  onChangeRef.current = onChange
  onBlurRef.current = onBlur
  onRunRef.current = onRun
  onFormatErrorRef.current = onFormatError

  const dialect = (driver && DIALECTS[driver]) || MySQL
  const driverRef = useRef(driver)
  driverRef.current = driver

  const formatCurrent = (): boolean => {
    const v = view.current
    if (!v) return false
    try {
      const current = v.state.doc.toString()
      const formatted = formatSql(current, driverRef.current)
      if (formatted !== current) {
        const cursor = Math.min(v.state.selection.main.head, formatted.length)
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: formatted },
          selection: { anchor: cursor }
        })
      }
      return true
    } catch (err) {
      onFormatErrorRef.current?.(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  useImperativeHandle(ref, () => ({ format: () => void formatCurrent() }))

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
            },
            {
              key: 'Shift-Alt-f',
              preventDefault: true,
              run: () => formatCurrent()
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
        }),
        EditorView.domEventHandlers({
          blur: () => {
            onBlurRef.current?.()
            return false
          }
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
})
