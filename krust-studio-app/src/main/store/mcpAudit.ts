import { app } from 'electron'
import { join } from 'path'
import { appendFileSync, readFileSync } from 'fs'
import type { McpAuditEntry } from '../../shared/types'

/**
 * AI Access Audit (ADR-0022 / ADR-0003): every MCP call is appended to
 * userData/mcp-audit.jsonl (one JSON per line). Never auto-purged — the same
 * no-silent / control-everything instinct as Schema Mutation history, applied to
 * the AI's access. Append-only + tail-read; cheap and crash-safe.
 */

const file = (): string => join(app.getPath('userData'), 'mcp-audit.jsonl')

export function auditMcp(entry: Omit<McpAuditEntry, 'ts'>): void {
  const line = JSON.stringify({ ts: Date.now(), ...entry }) + '\n'
  try {
    appendFileSync(file(), line, 'utf-8')
  } catch {
    // best-effort; a failed audit write must never break the tool call
  }
}

export function readMcpAudit(limit = 200): McpAuditEntry[] {
  let text = ''
  try {
    text = readFileSync(file(), 'utf-8')
  } catch {
    return []
  }
  const lines = text.split('\n').filter(Boolean)
  const tail = lines.slice(Math.max(0, lines.length - limit))
  const out: McpAuditEntry[] = []
  for (const l of tail) {
    try {
      out.push(JSON.parse(l) as McpAuditEntry)
    } catch {
      // skip a corrupt line
    }
  }
  return out.reverse() // newest first
}
