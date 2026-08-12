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
- `list_tables` — table/view **names only** (name, schema, type); no columns,
  keys, rows or counts. Available on any connection with at least one grant, so
  it does not need the introspection grant; exclude globs still apply. Built for
  diffing which tables exist between two connections (call once per connection).
  See the ADR-0022 amendment on why this reads under any grant.
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

## Data proposals + history reads + auto-attach verbs (ADR-0024, 2026-08-11)

Typecheck + `pnpm build` green; `pnpm test` passes (5/5).

### Tools (9 total now)
- **`propose_data_changes`** — staged row changes (insert/update/delete),
  predicate-targeted (`Filter[]`, never PK, because the `.sql` runs on a
  different DB where surrogate keys differ). Gated by the **AI Write Allowlist**
  (`McpGrant.dataWrites` + per-table `McpAllowEntry.write[]`). Rejects an empty
  predicate and exposes no TRUNCATE, so Destructive DML cannot be staged at all.
- **`read_history`** / **`list_changesets`** — behind a new `historyReads` grant;
  open within the connection, narrowed by a `historyRedact` glob list that
  withholds statement text but keeps metadata.
- `list_connections` now reports the two new grants.

### Main process
- `driver.ts`: `buildPredicateUpdate` / `buildPredicateDelete` /
  `buildRowChangeSql`; `TabularMutCapable` gains `applyRowChanges` (with
  `dryRun`) + `countPredicate`, implemented in all three SQL drivers.
- `session.ts`: `applyRowChanges` / `countPredicate`; captures as **`source:
  'ai'`** bound to the proposal's changeset.
  **Bug fixed:** `captureAll` defaulted `destructive` to `false`, so
  `applyChanges` never flagged one — it now detects per statement.
- `CaptureInput.changesetId` overrides auto-attach for a proposal commit, which
  also closes ADR-0022's "changeset binding is display-only" follow-up.
- `history.ts`: `proposals` table (durable proposals), `dmlVerbOf`, the
  per-connection auto-attach gate, `source` filter, `resolveChangesetFor`.
- `mcp/writes.ts`, `mcp/history.ts` new; `mcp/proposals.ts` moved off the
  in-memory `Map` onto `history.db` for **both** kinds.

### Renderer
- `SchemaSyncView` → **`AiProposalsView`**: Schema and Data sections, per-change
  checkbox, rendered SQL, affected-row estimate, Commit / Export / Dismiss. Tab
  label is "AI Proposals"; the internal tab kind stays `'schema-sync'` (it is
  never persisted, but the string is load-bearing in three files).
- Settings → AI / MCP rebuilt **tall**: stacked full-width sections (Schema /
  Table data / Query history / Auto-attach), a per-table per-verb grant grid, and
  plain-language auto-attach copy that never uses the word "destructive".

### Verified against a real DB (not just typecheck)
- **Backward compat** — a 250-row pre-ADR-0023 `history.db` migrates with 0 rows
  lost: `source='ai'` accepted (no CHECK constraint), old sources intact,
  changesets default to `kind='schema'`, the legacy `active_cs:<conn>` slot moves
  to `active_cs:schema:<conn>`, `proposals` created.
- **Auto-attach gate** — 15 cases. Critically: a connection with **no**
  `dataAttachVerbs` still collects all three verbs (the silent-stop trap), while
  unscoped `DELETE`/`UPDATE`/`TRUNCATE` still go to Unassigned unless the wipes
  box is ticked.
- **Generated DML** — `buildRowChangeSql` output executed against SQLite:
  predicate UPDATE hit exactly the matching rows, scoped DELETE removed one,
  INSERT round-tripped a value containing a quote, executed SQL stayed
  parameterized while the rendered export form inlined and escaped correctly,
  and the builder refuses an empty predicate.

### Known gaps in this slice
- **No live agent / live MySQL-Postgres run yet** — the same gate as the 1.7.0
  MCP work above.
- Proposals for a deleted connection are only pruned by an explicit
  `pruneOrphanProposals` call, which nothing invokes yet.
- History `source` is not yet surfaced or filterable in the History view UI; the
  column and the IPC query field exist, the UI affordance does not.
- The per-connection auto-attach panel lives in Settings → AI / MCP alongside the
  grants. It governs *all* row changes on that connection, not only the AI's, so
  it arguably belongs in Settings → History too.

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
