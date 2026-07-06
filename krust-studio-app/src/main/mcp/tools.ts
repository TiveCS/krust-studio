import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listConnections } from '../store/connections'
import { getMcpGrant } from '../store/mcp'
import { introspectSchema } from './introspect'

/** wrap a JSON payload as an MCP text-content tool result */
function json(payload: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

function fail(message: string): {
  content: { type: 'text'; text: string }[]
  isError: true
} {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/**
 * Register the MCP tool surface (ADR-0022). Default-deny: a connection appears /
 * is usable only for the capabilities it was granted. No raw SQL; no DB writes.
 */
export function registerMcpTools(server: McpServer): void {
  // ── list_connections ──────────────────────────────────────────────────────
  server.registerTool(
    'list_connections',
    {
      title: 'List connections',
      description:
        'List the database connections exposed to MCP, with the capabilities granted ' +
        '(data reads / schema introspection / accept proposals). Only connections with ' +
        'at least one grant appear. Names/engines only — no secrets.',
      inputSchema: {}
    },
    async () => {
      const rows = listConnections()
        .map((c) => {
          const g = getMcpGrant(c.id)
          return {
            id: c.id,
            name: c.name,
            engine: c.driver,
            readOnly: !!c.readOnly,
            database: c.database ?? null,
            grants: {
              dataReads: !!g.dataReads,
              introspection: !!g.introspection,
              propose: !!g.propose
            }
          }
        })
        .filter((c) => c.grants.dataReads || c.grants.introspection || c.grants.propose)
      return json({ connections: rows })
    }
  )

  // ── introspect_schema ─────────────────────────────────────────────────────
  server.registerTool(
    'introspect_schema',
    {
      title: 'Introspect schema',
      description:
        'Return the whole structure (tables, columns, types, PK/FK, indexes) of a ' +
        'connection — NO row data. Use this to diff a code model (e.g. EF Core ' +
        'entities) against the live DB. Internal tables matching the connection ' +
        "exclude globs (e.g. __EFMigrationsHistory) are omitted. Requires the connection's " +
        'introspection grant.',
      inputSchema: {
        connectionId: z.string().describe('connection id from list_connections')
      }
    },
    async ({ connectionId }) => {
      try {
        return json(await introspectSchema(connectionId))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    }
  )
}
