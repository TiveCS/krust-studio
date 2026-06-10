import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight'
import { StandardSQL, MySQL, PostgreSQL, SQLite } from '@codemirror/lang-sql'
import type { LRLanguage } from '@codemirror/language'
import type { DriverType } from '../../../shared/types'

// token class → colour, matching the CodeMirror theme in cm-theme.ts so the
// static (no-editor) highlight used in the History list looks identical to the
// editor / SqlDisplay highlight.
const COLORS: Record<string, string> = {
  kw: '#2dd4bf',
  str: '#6ee7b7',
  num: '#7dd3fc',
  com: '#6b7280',
  type: '#c4b5fd',
  fn: '#fbbf24',
  punc: '#9ca3af'
}

const highlighter = tagHighlighter([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], class: 'kw' },
  { tag: [t.string, t.special(t.string)], class: 'str' },
  { tag: [t.number, t.bool, t.null], class: 'num' },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'com' },
  { tag: [t.typeName, t.className], class: 'type' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'fn' },
  { tag: [t.operator, t.punctuation, t.separator], class: 'punc' }
])

function dialectFor(driver?: DriverType): LRLanguage {
  switch (driver) {
    case 'mysql':
      return MySQL.language
    case 'postgres':
      return PostgreSQL.language
    case 'sqlite':
      return SQLite.language
    default:
      return StandardSQL.language
  }
}

function styleFor(cls: string): React.CSSProperties {
  return {
    color: COLORS[cls] ?? undefined,
    fontStyle: cls === 'com' ? 'italic' : undefined,
    fontWeight: cls === 'kw' ? 500 : undefined
  }
}

/**
 * Static (no EditorView) syntax highlight → React nodes. Cheap enough to render
 * per row in a long list because it parses with the lezer SQL grammar once and
 * never mounts an editor. Callers should pass a bounded-length string for list
 * previews (parsing a 10 KB statement ×500 rows would be wasteful).
 */
export function highlightSql(code: string, driver?: DriverType): React.ReactNode[] {
  if (!code) return []
  const tree = dialectFor(driver).parser.parse(code)
  const nodes: React.ReactNode[] = []
  let pos = 0
  let key = 0
  highlightTree(tree, highlighter, (from, to, classes) => {
    if (from > pos) nodes.push(code.slice(pos, from))
    nodes.push(
      <span key={key++} style={styleFor(classes)}>
        {code.slice(from, to)}
      </span>
    )
    pos = to
  })
  if (pos < code.length) nodes.push(code.slice(pos))
  return nodes
}
