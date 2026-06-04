import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// Palette tuned to the app's dark theme (teal accent, JetBrains Mono).
// Shared between SqlEditor (editable) and SqlDisplay (read-only).
export const krustHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: '#2dd4bf', fontWeight: '500' },
  { tag: [t.string, t.special(t.string)], color: '#6ee7b7' },
  { tag: [t.number, t.bool, t.null], color: '#7dd3fc' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6b7280', fontStyle: 'italic' },
  { tag: [t.typeName, t.className], color: '#c4b5fd' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#fbbf24' },
  { tag: [t.variableName, t.propertyName, t.name], color: '#e5e7eb' },
  { tag: [t.operator, t.punctuation, t.separator], color: '#9ca3af' }
])

export const krustTheme = EditorView.theme({
  '&': { color: 'var(--foreground)', backgroundColor: 'transparent', fontSize: '12px', height: '100%' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
  '.cm-content': { caretColor: 'var(--foreground)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted-foreground)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  // drawSelection() renders the visible selection as .cm-selectionBackground divs.
  // Keep native ::selection transparent so the two layers don't stack and wash out
  // the syntax colors. Subtle slate so highlighted text stays readable.
  '.cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'rgba(120,130,170,0.28) !important' },
  '&.cm-focused .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'rgba(120,130,170,0.32) !important' },
  '.cm-content ::selection': { backgroundColor: 'transparent' },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)'
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)'
  }
})

export const krustSyntax = syntaxHighlighting(krustHighlight)
