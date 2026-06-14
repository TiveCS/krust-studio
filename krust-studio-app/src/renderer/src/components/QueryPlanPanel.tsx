import { useState } from 'react'
import { X, AlertTriangle, Database, CornerDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanNode, QueryPlan } from '../../../shared/types'

function fmtNum(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(n)
}

function ScanBadge({ node }: { node: PlanNode }): React.JSX.Element | null {
  if (node.scan === 'full')
    return (
      <span className="flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-px text-[10px] font-medium text-destructive">
        <AlertTriangle className="size-2.5" />
        FULL SCAN
      </span>
    )
  if (node.scan === 'index')
    return (
      <span className="rounded bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
        INDEX{node.index ? ` · ${node.index}` : ''}
      </span>
    )
  return null
}

function PlanRow({ node, depth }: { node: PlanNode; depth: number }): React.JSX.Element {
  return (
    <>
      <div
        className="flex items-start gap-2 border-b border-border/20 px-3 py-1.5 text-xs hover:bg-accent/30"
        style={{ paddingLeft: 12 + depth * 18 }}
      >
        {depth > 0 && (
          <CornerDownRight className="mt-0.5 size-3 shrink-0 text-muted-foreground/40" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-medium">{node.operation}</span>
            <ScanBadge node={node} />
          </div>
          {node.detail && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {node.detail}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-[10px] text-muted-foreground">
          {fmtNum(node.rows) != null && (
            <span title="estimated rows">~{fmtNum(node.rows)}</span>
          )}
          {fmtNum(node.actualRows) != null && (
            <span className="text-foreground" title="actual rows">
              ={fmtNum(node.actualRows)}
            </span>
          )}
          {fmtNum(node.cost) != null && (
            <span title="cost">cost {fmtNum(node.cost)}</span>
          )}
          {node.actualMs != null && (
            <span className="text-foreground" title="actual time">
              {node.actualMs.toFixed(1)} ms
            </span>
          )}
        </div>
      </div>
      {node.children.map((c, i) => (
        <PlanRow key={i} node={c} depth={depth + 1} />
      ))}
    </>
  )
}

export function QueryPlanPanel({
  plan,
  onClose
}: {
  plan: QueryPlan
  onClose: () => void
}): React.JSX.Element {
  const [raw, setRaw] = useState(false)
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent/20 px-3 py-1.5 text-xs">
        <Database className="size-3.5 text-primary" />
        <span className="font-medium">
          Query Plan · {plan.engine}
          {plan.analyze && <span className="text-amber-500"> · ANALYZE</span>}
        </span>
        {plan.planningMs != null && (
          <span className="text-muted-foreground">plan {plan.planningMs.toFixed(1)} ms</span>
        )}
        {plan.executionMs != null && (
          <span className="text-muted-foreground">exec {plan.executionMs.toFixed(1)} ms</span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setRaw((v) => !v)}
          className={cn(
            'rounded border px-1.5 py-0.5 text-[10px]',
            raw
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40'
          )}
        >
          {raw ? 'Tree' : 'Raw'}
        </button>
        <button
          onClick={onClose}
          title="Close plan"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {raw ? (
          <pre className="px-3 py-2 font-mono text-[10px] whitespace-pre-wrap text-muted-foreground">
            {plan.raw}
          </pre>
        ) : plan.nodes.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            No plan nodes returned.
          </div>
        ) : (
          plan.nodes.map((n, i) => <PlanRow key={i} node={n} depth={0} />)
        )}
      </div>
    </div>
  )
}
