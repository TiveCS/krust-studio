import { listHistory, listChangesets } from '../store/history'
import { getConnectionConfig } from '../store/connections'
import { getMcpGrant } from '../store/mcp'
import { matchesGlobs } from './introspect'
import type { HistoryStream, HistorySource } from '../../shared/types'

/**
 * History Read scope (ADR-0024). Kept separate from the AI Read Allowlist
 * because history is a **side channel around it**: ADR-0008 stores DML as
 * display-rendered SQL with values inlined, so a raw history read would return
 * `UPDATE users SET password_hash='…'` — bypassing the allowlist and its masks.
 *
 * Within a granted connection history is **open** (the change story is only
 * useful whole), narrowed by a per-connection redact list of table globs. A
 * redacted entry keeps every field except `statement`: the agent learns *that*
 * something changed and *when*, never *what to*. Hiding the entry outright was
 * rejected — silent gaps make an agent reason from an incomplete timeline.
 */

function requireHistoryReads(connectionId: string): string[] {
  const config = getConnectionConfig(connectionId)
  if (!config) throw new Error(`Unknown connection: ${connectionId}`)
  const grant = getMcpGrant(connectionId)
  if (!grant.historyReads) throw new Error('History reads are not granted for this connection')
  return grant.historyRedact ?? []
}

/** the verb/keyword head of a statement — kept when the text itself is withheld */
function statementHead(sql: string): string {
  const body = sql.replace(/^\s*(\/\*[\s\S]*?\*\/|--[^\n]*\n)*\s*/, '').trimStart()
  return (body.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase()
}

export interface McpHistoryQuery {
  stream?: HistoryStream
  changesetId?: number
  unassigned?: boolean
  source?: HistorySource
  limit?: number
  offset?: number
}

/** the two mutation streams — the default when the caller names none */
const MUTATION_STREAMS: HistoryStream[] = ['data_mutation', 'table_mutation']

export async function readHistory(
  connectionId: string,
  q: McpHistoryQuery
): Promise<{ entries: unknown[]; redactedCount: number }> {
  const redact = requireHistoryReads(connectionId)
  const limit = Math.max(1, Math.min(500, q.limit ?? 100))

  // No stream given → the two mutation streams (the audit-valuable ones), which
  // needs two queries since the store filters one stream at a time.
  const streams: (HistoryStream | undefined)[] = q.stream
    ? [q.stream]
    : q.changesetId != null
      ? [undefined]
      : MUTATION_STREAMS

  const rows = (
    await Promise.all(
      streams.map((stream) =>
        listHistory({
          connectionId,
          stream,
          changesetId: q.changesetId,
          unassigned: q.unassigned,
          source: q.source,
          limit,
          offset: q.offset ?? 0
        })
      )
    )
  )
    .flat()
    .sort((a, b) => b.ts - a.ts || b.id - a.id)
    .slice(0, limit)

  let redactedCount = 0
  const entries = rows.map((r) => {
    const hidden =
      // an entry with no recorded table cannot be checked against the list, so
      // it is treated as redacted rather than assumed safe
      !r.entity || matchesGlobs(r.entity, undefined, redact)
    const base = {
      id: r.id,
      ts: r.ts,
      stream: r.stream,
      source: r.source,
      table: r.entity,
      status: r.status,
      affected: r.affected,
      destructive: r.destructive,
      changesetId: r.changesetId
    }
    if (!hidden) return { ...base, statement: r.statement }
    redactedCount++
    return {
      ...base,
      statement: null,
      verb: statementHead(r.statement),
      redacted: true,
      redactedReason: r.entity
        ? 'table is on the history redact list'
        : 'entry has no recorded table'
    }
  })
  return { entries, redactedCount }
}

export async function listConnectionChangesets(
  connectionId: string
): Promise<{ changesets: unknown[] }> {
  requireHistoryReads(connectionId)
  const rows = await listChangesets(connectionId)
  return {
    changesets: rows.map((c) => ({
      id: c.id,
      name: c.name,
      ticket: c.ticket,
      kind: c.kind,
      status: c.status,
      count: c.count,
      active: c.active,
      createdAt: c.createdAt,
      exportedAt: c.exportedAt
    }))
  }
}
