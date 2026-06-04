import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { sql } from '@codemirror/lang-sql'
import { krustTheme, krustSyntax } from '@/lib/cm-theme'

interface Props {
  value: string
  className?: string
}

/**
 * Read-only syntax-highlighted SQL display (CodeMirror 6, no gutter, no cursor).
 * Used for DDL preview in StructureView. Shares theme with SqlEditor.
 */
export function SqlDisplay({ value, className }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Create editor once
  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          sql(),
          krustTheme,
          krustSyntax,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          // Override height so the editor fills its container naturally
          EditorView.theme({
            '&': { height: 'auto' },
            '.cm-scroller': { overflow: 'visible' }
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
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value }
    })
  }, [value])

  return <div ref={hostRef} className={className} />
}
