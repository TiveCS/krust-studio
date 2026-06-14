export type CommandId =
  | 'palette.open'
  | 'table.commit'
  | 'table.addRow'
  | 'table.refresh'
  | 'table.toggleView'
  | 'filter.add'
  | 'sidebar.toggle'

export type KeybindingScope = 'global' | 'table-tab' | 'data-view' | 'structure-view'

export interface CommandDef {
  id: CommandId
  label: string
  description: string
  defaultKey: string
  scope: KeybindingScope
}

export const COMMANDS: CommandDef[] = [
  {
    id: 'palette.open',
    label: 'Search Tables',
    description: 'Open the table search palette',
    defaultKey: 'ctrl+p',
    scope: 'global'
  },
  {
    id: 'table.toggleView',
    label: 'Toggle Data / Structure',
    description: 'Switch between data and structure views',
    defaultKey: 'ctrl+g',
    scope: 'table-tab'
  },
  {
    id: 'table.refresh',
    label: 'Refresh',
    description: 'Reload the current table or structure',
    defaultKey: 'f5',
    scope: 'table-tab'
  },
  {
    id: 'table.commit',
    label: 'Commit Changes',
    description: 'Save staged edits to the database',
    defaultKey: 'ctrl+s',
    scope: 'data-view'
  },
  {
    id: 'table.addRow',
    label: 'Add Row',
    description: 'Insert a new row in the current table',
    defaultKey: 'ctrl+n',
    scope: 'data-view'
  },
  {
    id: 'filter.add',
    label: 'Add Filter',
    description: 'Expand the filter bar and add a condition',
    defaultKey: 'ctrl+shift+f',
    scope: 'data-view'
  },
  {
    id: 'sidebar.toggle',
    label: 'Toggle Sidebar',
    description: 'Collapse or expand the table sidebar',
    defaultKey: 'ctrl+b',
    scope: 'global'
  }
]

export function scopesOverlap(a: KeybindingScope, b: KeybindingScope): boolean {
  if (a === b) return true
  if (a === 'global' || b === 'global') return true
  if (a === 'table-tab' && (b === 'data-view' || b === 'structure-view')) return true
  if (b === 'table-tab' && (a === 'data-view' || a === 'structure-view')) return true
  return false
}

export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const ctrl = parts.includes('ctrl')
  const meta = parts.includes('meta') || parts.includes('cmd')
  const shift = parts.includes('shift')
  const alt = parts.includes('alt')
  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === ctrl &&
    e.metaKey === meta &&
    e.shiftKey === shift &&
    e.altKey === alt
  )
}

export function serializeKey(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.metaKey) parts.push('meta')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

export function formatBinding(binding: string): string {
  return binding
    .split('+')
    .map((p) => {
      switch (p) {
        case 'ctrl': return 'Ctrl'
        case 'shift': return 'Shift'
        case 'alt': return 'Alt'
        case 'meta': return '⌘'
        default: return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)
      }
    })
    .join('+')
}
