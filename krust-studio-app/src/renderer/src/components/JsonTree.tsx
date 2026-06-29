import React, { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Read-only collapsible JSON viewer. Renders objects/arrays as expandable nodes
 * with a one-line collapsed summary; primitives are colour-coded. Used by the
 * Redis string editor's JSON view alongside the editable raw textarea.
 */
export function JsonTree({ data }: { data: unknown }): React.JSX.Element {
  return (
    <div className="font-mono text-xs leading-5">
      <Node value={data} name={null} depth={0} defaultOpen />
    </div>
  )
}

function Node({
  value,
  name,
  depth,
  defaultOpen = false
}: {
  value: unknown
  name: string | null
  depth: number
  defaultOpen?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen || depth < 1)
  const isArray = Array.isArray(value)
  const isObject = value !== null && typeof value === 'object'

  if (!isObject) {
    return (
      <div style={{ paddingLeft: depth * 14 + 14 }}>
        {name !== null && <span className="text-sky-400">{name}: </span>}
        <Primitive value={value} />
      </div>
    )
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>)
  const open0 = isArray ? '[' : '{'
  const close0 = isArray ? ']' : '}'
  const summary = `${entries.length} ${isArray ? 'item' : 'key'}${entries.length === 1 ? '' : 's'}`

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 14 }}
        className="flex cursor-pointer items-center gap-0.5 rounded hover:bg-accent/40"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        {name !== null && <span className="text-sky-400">{name}: </span>}
        <span className="text-muted-foreground">
          {open0}
          {!open && <span className="opacity-70">{summary}</span>}
          {!open && close0}
        </span>
      </div>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <Node key={k} value={v} name={isArray ? null : k} depth={depth + 1} />
          ))}
          <div style={{ paddingLeft: depth * 14 }} className="text-muted-foreground">
            {close0}
          </div>
        </>
      )}
    </div>
  )
}

function Primitive({ value }: { value: unknown }): React.JSX.Element {
  let cls = 'text-foreground'
  let text: string
  if (value === null) {
    cls = 'text-muted-foreground'
    text = 'null'
  } else if (typeof value === 'string') {
    cls = 'text-emerald-400'
    text = JSON.stringify(value)
  } else if (typeof value === 'number') {
    cls = 'text-amber-400'
    text = String(value)
  } else if (typeof value === 'boolean') {
    cls = 'text-violet-400'
    text = String(value)
  } else {
    text = String(value)
  }
  return <span className={cn('break-all', cls)}>{text}</span>
}
