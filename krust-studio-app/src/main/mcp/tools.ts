import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listConnections } from '../store/connections'
import { getMcpGrant } from '../store/mcp'
import { introspectSchema } from './introspect'
import { addProposal, type ProposeInput } from './proposals'
import { listAllowedTables, describeAllowedTable, readAllowedRows } from './reads'
import type { CreateTableSpec, SchemaOp } from '../../shared/types'

const zColumn = z.object({
  name: z.string(),
  type: z.string().describe('SQL type in the target dialect, e.g. "int", "varchar(256)"'),
  nullable: z.boolean().default(true),
  pk: z.boolean().default(false),
  default: z.string().optional(),
  autoInc: z.boolean().optional(),
  unsigned: z.boolean().optional(),
  fk: z
    .object({
      refTable: z.string(),
      refColumn: z.string(),
      onUpdate: z.string().optional(),
      onDelete: z.string().optional()
    })
    .optional()
})
const zCreateTable = z.object({ name: z.string(), columns: z.array(zColumn) })
/** ops match Krust's SchemaOp — additive: addColumn/addIndex/addForeignKey */
const zOp = z.object({ kind: z.string() }).passthrough()
const zAlter = z.object({
  table: z.string(),
  schema: z.string().optional(),
  ops: z.array(zOp)
})
const zReport = z.object({
  table: z.string(),
  kind: z.string(),
  detail: z.string(),
  codeSpec: z.string().optional(),
  dbSpec: z.string().optional()
})

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

  // ── propose_schema_ops ────────────────────────────────────────────────────
  server.registerTool(
    'propose_schema_ops',
    {
      title: 'Propose schema ops',
      description:
        'Propose ADDITIVE schema fixes for a connection after diffing a code model ' +
        'against introspect_schema. These are STAGED into Krust for a human to review ' +
        'and commit — they are NEVER applied to the database by this call. Send only ' +
        'additive ops (createTables / addColumn / addIndex / addForeignKey). Put ' +
        'non-additive findings (type mismatches, columns to drop, nullability changes) ' +
        'in reportOnly so the human can decide. Requires the connection propose grant.',
      inputSchema: {
        connectionId: z.string(),
        changesetName: z.string().optional().describe('ticket/feature name for the changeset'),
        createTables: z.array(zCreateTable).optional().describe('tables missing from the DB'),
        alters: z
          .array(zAlter)
          .optional()
          .describe('per-table additive ops (SchemaOp: addColumn/addIndex/addForeignKey)'),
        reportOnly: z
          .array(zReport)
          .optional()
          .describe('non-additive findings — reported, never auto-staged')
      }
    },
    async (args, extra) => {
      const grant = getMcpGrant(args.connectionId)
      if (!grant.propose) {
        return fail('This connection does not accept schema-op proposals')
      }
      const input: ProposeInput = {
        connectionId: args.connectionId,
        changesetName: args.changesetName,
        createTables: (args.createTables as CreateTableSpec[] | undefined) ?? [],
        alters: (args.alters as { table: string; schema?: string; ops: SchemaOp[] }[] | undefined) ?? [],
        reportOnly: args.reportOnly ?? []
      }
      const client = clientName(extra)
      try {
        const res = await addProposal(input, client)
        return json({
          staged: true,
          message:
            'Proposal staged in Krust Studio → Schema Sync. A human will review and commit ' +
            'it; nothing was applied to the database.',
          ...res
        })
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    }
  )

  // ── data reads (ADR-0003 — AI Read Allowlist, default-deny) ───────────────
  server.registerTool(
    'list_allowed_tables',
    {
      title: 'List allowed tables',
      description:
        'List the tables an AI may read on a connection (the AI Read Allowlist), each ' +
        'marked schema-only or row-readable, with a masked-column count. Requires the ' +
        'data-reads grant.',
      inputSchema: { connectionId: z.string() }
    },
    async ({ connectionId }) => {
      try {
        return json(listAllowedTables(connectionId))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    }
  )

  server.registerTool(
    'describe_table',
    {
      title: 'Describe table',
      description:
        'Columns / indexes / relations for one allowlisted table (masked columns ' +
        'omitted). No row data. Requires the table to be on the AI Read Allowlist.',
      inputSchema: {
        connectionId: z.string(),
        table: z.string(),
        schema: z.string().optional()
      }
    },
    async ({ connectionId, table, schema }) => {
      try {
        return json(await describeAllowedTable(connectionId, table, schema))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    }
  )

  server.registerTool(
    'read_rows',
    {
      title: 'Read rows',
      description:
        'Read a bounded sample of rows from an allowlisted table (masked columns ' +
        'omitted). limit is capped by the server max. Requires a row-readable grant.',
      inputSchema: {
        connectionId: z.string(),
        table: z.string(),
        schema: z.string().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional()
      }
    },
    async ({ connectionId, table, schema, limit, offset }) => {
      try {
        return json(await readAllowedRows(connectionId, table, schema, limit, offset))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    }
  )
}

/** best-effort MCP client label from the request (stateless — headers only) */
function clientName(extra: unknown): string {
  const e = extra as { requestInfo?: { headers?: Record<string, unknown> } }
  const ua = e?.requestInfo?.headers?.['user-agent']
  if (typeof ua === 'string' && ua.trim()) return ua.slice(0, 60)
  return 'AI agent'
}
