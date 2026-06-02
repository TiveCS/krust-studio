import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { sql, SQLDialect } from '@codemirror/lang-sql'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// palette tuned to the app's dark theme (teal accent, JetBrains Mono)
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: '#2dd4bf', fontWeight: '500' },
  { tag: [t.string, t.special(t.string)], color: '#6ee7b7' },
  { tag: [t.number, t.bool, t.null], color: '#7dd3fc' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6b7280', fontStyle: 'italic' },
  { tag: [t.typeName, t.className], color: '#c4b5fd' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#fbbf24' },
  { tag: [t.variableName, t.propertyName, t.name], color: '#e5e7eb' },
  { tag: [t.operator, t.punctuation, t.separator], color: '#9ca3af' }
])

const theme = EditorView.theme(
  {
    '&': { color: 'var(--foreground)', backgroundColor: 'transparent', fontSize: '12px', height: '100%' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
    '.cm-content': { caretColor: 'var(--foreground)' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted-foreground)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
    '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(45,212,191,0.25)' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(45,212,191,0.30)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--popover)',
      color: 'var(--popover-foreground)',
      border: '1px solid var(--border)'
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--accent)',
      color: 'var(--accent-foreground)'
    }
  },
  { dark: true }
)

interface Props {
  value: string
  onChange: (v: string) => void
  /** Ctrl/Cmd-Enter — passes the selection if any, else the whole doc */
  onRun: (sql: string) => void
  /** table -> columns, for autocomplete */
  schema?: Record<string, string[]>
}

export function SqlEditor({ value, onChange, onRun, schema }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onRunRef = useRef(onRun)
  onChangeRef.current = onChange
  onRunRef.current = onRun

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        keymap.of([
          {
            key: 'Mod-Enter',
            run: (v) => {
              const sel = v.state.selection.main
              const text = sel.empty
                ? v.state.doc.toString()
                : v.state.sliceDoc(sel.from, sel.to)
              onRunRef.current(text)
              return true
            }
          }
        ]),
        sql({ dialect: SQLDialect.define({}), schema, upperCaseKeywords: true }),
        syntaxHighlighting(highlight),
        theme,
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
    // schema baked in at mount; remount via key when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep editor in sync if value is set externally
  useEffect(() => {
    const v = view.current
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={host} className="h-full overflow-auto" />
}
