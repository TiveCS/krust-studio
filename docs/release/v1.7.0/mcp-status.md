# MCP Server + AI Schema Sync — Implementation Status (1.7.0)

Autonomous build on `feat/v1.7.0`, 2026-07-07. Implements the in-app MCP server
and AI Schema Sync per [ADR-0022](../../adr/0022-mcp-schema-sync-proposed-ops.md)
(amending [ADR-0003](../../adr/0003-mcp-read-only-structured-tools.md)) and
CONTEXT.md (MCP Server / Schema Introspection / Schema Sync / Proposed Schema Op /
MCP Configuration / AI Access Allowlist / Audit). **Typecheck + full `pnpm build`
green.** SDK wiring verified standalone (token 401, initialize, tools/list,
tools/call all return JSON). Not yet exercised from a real agent against a real DB.

## Done (compiles + builds)

### Server + transport (phase 1 + 5)
- `@modelcontextprotocol/sdk` 1.29. `main/mcp/server.ts`: loopback HTTP on
  `127.0.0.1`, per-install bearer token, **stateless streamable-HTTP** transport
  with `enableJsonResponse`. Lifecycle start/stop wired into app ready /
  before-quit; off by default. `main/store/mcp.ts` = `mcpConfig.json`.
- **stdio bridge** (`resources/mcp-bridge.mjs`): a secretless pipe forwarding
  stdin JSON-RPC → the HTTP endpoint with the token, so Codex CLI / stdio-first
  agents reach the same enforced server. `mcp:bridgePath` (asarUnpack'd in prod).

### Tools
- `list_connections` — granted-only, names/engines, no secrets.
- `introspect_schema` — whole-connection structure, no rows, exclude globs
  (seeded `__EFMigrationsHistory`). Reuses `listEntities`/`describeTable`.
- `propose_schema_ops` — additive `createTables`/`alters` (SchemaOp) + `reportOnly`;
  computes best-effort DDL via `createTable` dryRun (added to 3 drivers) +
  `previewAlter`; stages a pending proposal, pushes it to the renderer.
- `list_allowed_tables` / `describe_table` / `read_rows` — AI Read Allowlist,
  default-deny per table, masked columns stripped, sample clamped to the max.

### Schema Sync (phase 2)
- `main/mcp/proposals.ts`: in-memory pending store; **commit re-introspects +
  reconciles** (skips satisfied ops idempotently, runs only missing, reports
  conflicts) through the normal `createTable`/`alterTable` capture path; **export**
  builds the handoff `.sql` from the draft (works read-only); read-only commit
  blocked.
- Schema Sync tab (`kind:'schema-sync'`, singleton): per-proposal review — additive
  ops with DDL preview + per-op checkbox, report-only section, changeset name,
  Commit / Export / Dismiss. Sidebar Bot button + proposal-count badge; app-wide
  subscription + notify toast (gated by the setting).

### Config + audit (phase 3 + 4)
- Settings → **AI / MCP**: master toggle, port, token (view/regen), notify toggle,
  client-setup snippets, per-connection grants (introspection + exclude globs,
  accept-proposals, data reads + allowlist editor with masks), and the
  **AI Access Audit** viewer.
- `main/store/mcpAudit.ts`: append-only `mcp-audit.jsonl`, never auto-purged;
  every tool logs ts/tool/connection/target/client/ok/detail.

## Not yet done / follow-ups
- **Live agent + live DB verification** (the real gate): connect Claude Code +
  Codex, introspect, propose from an EF Core diff, reconcile-commit, export.
- Changeset *binding* on commit is display-only — executed DDL captures via the
  normal active-changeset rule; a dedicated per-sync changeset is not yet created.
- Client identity in the audit is best-effort (request user-agent), not the MCP
  `initialize` `clientInfo` (stateless transport loses it across requests).
- Binary/enum/edge column-type inference is the agent's job; Krust only previews.
- `propose_schema_ops` op validation is loose (`passthrough`) — malformed ops
  surface at DDL-generation / commit time, not at the tool boundary.
