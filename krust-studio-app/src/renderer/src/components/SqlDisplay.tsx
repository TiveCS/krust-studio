import { useEffect, useMemo, useRef } from 'react'
import { EditorView, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { sql } from '@codemirror/lang-sql'
import { krustTheme, krustSyntax } from '@/lib/cm-theme'
import { displaySql } from '@/lib/sqlFormat'
import type { DriverType } from '../../../shared/types'

interface Props {
  value: string
  className?: string
  driver?: DriverType
  pretty?: boolean
}

/**
 * Read-only syntax-highlighted SQL display (CodeMirror 6, no gutter, no cursor).
 * Used for DDL preview in StructureView. Shares theme with SqlEditor.
 */
export function SqlDisplay({ value, className, driver, pretty = false }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const displayedValue = useMemo(
    () => displaySql(value, driver, pretty),
    [value, driver, pretty]
  )

  // Create editor once
  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: displayedValue,
        extensions: [
          sql(),
          krustTheme,
          krustSyntax,
          // read-only (no edits) but NOT `editable.of(false)` — keeping the view
          // editable lets CodeMirror run mouse selection + native copy, so users
          // can drag-select the statement. The caret is hidden below so it still
          // reads as a display, not an input.
          EditorState.readOnly.of(true),
          // draw the selection via CM's layer so the themed highlight shows — the
          // theme keeps native ::selection transparent (see cm-theme.ts)
          drawSelection(),
          EditorView.lineWrapping,
          // Override height so the editor fills its container naturally
          EditorView.theme({
            '&': { height: 'auto' },
            '.cm-scroller': { overflow: 'visible' },
            // selectable-but-caretless: read-only display you can still copy from
            '.cm-content': { caretColor: 'transparent' },
            '.cm-cursor, .cm-dropCursor': { display: 'none' },
            '&.cm-focused .cm-cursor': { display: 'none' }
          })
        ]
      }),
      parent: hostRef.current
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only on mount — value updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update content when value prop changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === displayedValue) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: displayedValue }
    })
  }, [displayedValue])

  return <div ref={hostRef} className={className} />
}
