# 24. MCP Data Proposals, History Reads, and per-connection data auto-attach

Date: 2026-08-11

## Status

Accepted — **implemented** on `feat/v1.7.0` (2026-08-11). Typecheck + full
`pnpm build` green; existing test suite passes. Backward-compat migration, the
auto-attach gate, and the generated DML were each verified against a real SQLite
database (see [mcp-status.md](../release/v1.7.0/mcp-status.md)). **Not yet
exercised from a live agent against a live MySQL/Postgres DB** — that remains the
real gate. **Amends
[ADR-0003](0003-mcp-read-only-structured-tools.md)** (the MCP surface gains a
*data*-write proposal path and a history-read scope) and
**[ADR-0022](0022-mcp-schema-sync-proposed-ops.md)** (the Schema Sync tab becomes
the kind-agnostic **AI Proposals** tab; pending proposals become durable).
Refines **[ADR-0023](0023-typed-schema-and-data-changesets.md)** (data auto-attach
gains a per-connection verb filter). Everything in
[ADR-0005](0005-mutation-safety-model.md) — staged edits, human commit,
transactional apply, destructive guard — holds unchanged and is in fact the
mechanism this ADR leans on.

## Context

Three asks arrived together, all from live use of beta.5:

1. Let an agent **read** Query History and Changeset state over MCP.
2. Let an agent **change table rows** over MCP — full CRUD reach, but strictly
   scoped to chosen tables and chosen verbs — with every resulting change landing
   in Data Mutation history like any other write.
3. Make the ADR-0023 data auto-attach rule **configurable by verb** ("I want
   `UPDATE` collected, usually not `DELETE`, but sometimes `DELETE` too").

The motivating workflow is unattended: *"I need the AI doing the work while I
review or do something else."* That framing did more design work than any other
single fact — it argues for staging over direct execution (the human is not
watching at write time), and for durable proposals (the human may not return
before an auto-update restart).

The forks resolved (via `/grill-with-docs`):

1. **Write model.** Direct execute vs stage-for-review vs a per-connection
   autonomy flag → **stage**. ADR-0005's whole premise is that the edit path is
   where data loss happens, and an unattended agent is precisely when nobody is
   watching. Direct execution was rejected even though it is the smaller build.

2. **Staging surface.** A new Data Sync tab vs injecting into the grid's pending
   edits vs generalising Schema Sync → **generalise**. Grid injection was rejected
   outright: staged edits live in *renderer tab state* (`tab.edits` /
   `tab.inserts` / `tab.deletes`), so agent edits would mix into the same
   uncommitted buffer as the human's own with no provenance, vanish on tab close,
   and fail entirely when no tab is open.

3. **Proposal shape.** Mixed-kind vs single-kind → **single-kind**. A mixed
   proposal would have to bind to two changesets at once, dragging ADR-0023's
   "kinds never mix" invariant into the proposal object. Single-kind keeps both
   that invariant and ADR-0022's "one run, one changeset" untouched.

4. **Row targeting.** Primary key (matching Krust's existing `RowEdit`/`ChangeSet`
   and reusing `applyChanges` verbatim) vs a structured predicate → **predicate**.
   The decisive constraint is one PK-scoping cannot survive: the handoff `.sql` is
   applied to a *different database* (dev drafts it, prod runs it) where surrogate
   keys do not correspond — only a business identifier does. A pk-scoped script is
   worthless on the target. Secondary: one set-based `UPDATE` is a far better
   DevOps artifact than N key-scoped ones.

5. **Allowlist vs denylist.** A denylist mode ("allow everything except X") was
   requested, considered, and **withdrawn** — for both reads and writes.
   Default-deny stands. One forgotten exception in a denylist is a silent grant,
   and the mode is not legible at a glance.

6. **Destructive DML over MCP.** Stage-behind-typed-confirm vs reject at the tool
   boundary → **reject**, for this beta. The asymmetry is what settled it: a
   restrictive default can be *relaxed* later (a mooted per-connection "production
   flag" would do exactly that) without breaking anything, whereas tightening
   later breaks agent workflows already built on the permissive behaviour.

7. **History leak.** History stores DML as display-rendered SQL with values
   inlined (ADR-0008), so a history read walks straight around the AI Read
   Allowlist *and* its column masks. Resolved as **open-by-default within a
   granted connection, narrowed by a redact list**, with redacted entries reduced
   to metadata. Hiding entries entirely was rejected (silent gaps → wrong agent
   conclusions); scrubbing literals out of statement text was rejected because it
   requires the per-dialect SQL parser ADR-0003 refused to make a security
   boundary.

8. **Auto-attach verb filter placement.** Per-changeset vs global (matching the
   existing `auto_attach_destructive` precedent) vs per-connection →
   **per-connection**. It tracks the *database's* role, not the ticket's.

## Decision

### Data proposals

- New tool **`propose_data_changes`**: `inserts` (column→value maps), `updates`
  (structured `Filter[]` predicate + columns to set), `deletes` (predicate).
  Structured and engine-agnostic — Krust renders the DML, as it does for schema
  ops. Never raw AI-authored SQL, never executed by the call.
- Rows are targeted **by predicate, never by primary key** — the same `Filter[]`
  shape `read_rows` already accepts, compiled through the same `buildWhereClause`.
- **The predicate is required and must be non-empty**, and no `TRUNCATE` verb is
  exposed. A **Destructive** DML statement therefore cannot be staged over MCP at
  all — ADR-0005's guard is satisfied by construction rather than by a confirm
  dialog.
- Every column named in a predicate must be **allowlisted and unmasked**, exactly
  as for `read_rows` (ADR-0003's oracle-leak rule, unchanged).

### AI Write Allowlist

- Per-connection `dataWrites` master switch, plus per-verb CRUD on each existing
  `McpAllowEntry`. **Default-deny.** A table may be readable without being
  writable; never writable without being readable.

### History reads

- New tool **`read_history`** (by stream — any of the five — by `changesetId`, or
  the Unassigned inbox) and **`list_changesets`** (name, kind, status, count,
  active slot), behind a new per-connection **History Read** grant, default off.
- Within a granted connection, history is **open**, narrowed by a per-connection
  **redact list** of table globs. A redacted entry keeps full metadata (ts,
  stream, verb, table, affected, destructive, changeset) and **withholds the
  statement text**. Entries with no recorded table are metadata-only.

### AI Proposals

- The `schema-sync` tab is renamed **AI Proposals** and holds both proposal
  kinds. **Schema Sync** narrows to naming the *workflow* (reconciling a code
  model against live structure), which is what ADR-0022 actually described.
- Pending proposals become **durable** — a `proposals` table in `history.db`
  (id, connection, kind, client, created_at, changeset_name, payload JSON)
  replacing the in-memory `Map`. They survive quit, crash, and the unattended
  auto-update restart of ADR-0019.
- Read-only connections: **Commit blocked, Export works** — ADR-0022's
  "verify Prod drift + script the handoff" case, extended to data.

### History source

- `HistoryEntry.source` gains **`ai`** alongside `gui` / `manual`, applied to
  statements committed from an AI Proposal (both kinds). History becomes
  filterable by origin.

### Existing history is never touched

A hard constraint from the author: an existing `history.db` (years of captured
DDL on a work machine) must survive the upgrade intact. **Every change in this
ADR is additive** — no `UPDATE`, no `DELETE`, no rewrite of an existing row:

- `source='ai'` needs **no migration**: `history_entries.source` is `TEXT NOT
  NULL` with **no CHECK constraint**, so a new value is simply a new value. The
  `'gui' | 'manual'` union is compile-time only, and the history view does not
  render `source` today, so no existing code can trip on an unknown one.
- `proposals` is a new table via `CREATE TABLE IF NOT EXISTS`.
- `dataAttachVerbs` / `dataAttachUnscoped` live in `connections.json`, not
  `history.db`.
- **Downgrade stays safe**: older Krust opening a newer file reads `source='ai'`
  as ordinary text and ignores the unknown table.

**Unset must mean "all", never "none".** An existing connection has no
`dataAttachVerbs` value. Reading absent-as-empty would silently switch off data
auto-attach for every connection the user already has — discovered only when an
export came up empty. Absent reads as all three verbs (and
`dataAttachUnscoped` absent reads as `false`), following the
`kind TEXT NOT NULL DEFAULT 'schema'` and `default ON when unset` precedents
already in the store.

### Per-connection data auto-attach

- `ConnectionConfig` gains `dataAttachVerbs` (default `['insert','update',
  'delete']`) and `dataAttachUnscoped` (default `false`, covering `TRUNCATE` and
  no-`WHERE` `DELETE`/`UPDATE` together as "whole-table wipes").
- `capture()`'s data-mutation rule becomes: active Data slot set **and** verb ∈
  `dataAttachVerbs` **and** (`!destructive` **or** `dataAttachUnscoped`).
  Otherwise → Unassigned, never lost.
- Surfaced in Settings with plain-language copy that never uses the word
  "destructive" — a new user must be able to tell from the panel alone why their
  `DELETE` did not attach and where it went instead.

## Consequences

- ADR-0003's headline is narrower again. The accurate line is now: **the AI can
  propose staged schema ops and staged row changes, and can read history, but
  never writes the database.** The human-commit gate is the invariant that has
  survived every amendment — it, not "read-only", is the real guarantee.
- Predicate targeting means the matching row set **can drift** between drafting
  and approval. The review panel must show an affected-row count and **re-count
  at commit** (ADR-0005's affected-row preview), and the count is advisory, not a
  lock.
- Predicate DML does not fit `ChangeSet`/`applyChanges` (which is PK-based), so a
  new main-process commit path is needed. It must route through the same
  `capture()` choke point (ADR-0008) or the "changes appear in history"
  requirement silently fails.
- **Latent bug this surfaces:** `applyChanges` calls
  `captureAll(id, 'data_mutation', res.statements, entity.name)` with no
  `destructive` argument, so it defaults to `false`. Harmless today (grid edits
  are always pk-scoped) but wrong the moment arbitrary predicates flow through —
  the new path must pass `isDestructiveStatement(stmt)`, and the existing call
  should be corrected too.
- The redact list is a second table-glob list next to `introspectExcludes`, with
  different semantics (redact-statement vs hide-entirely). Naming them clearly in
  the UI matters more than sharing an implementation.
- Durable proposals need a lifecycle answer eventually: dismissed proposals are
  deleted, but nothing yet trims proposals for connections that were removed.
- Krust still is not a migration tool (ADR-0002). Data proposals are
  capture-and-handoff for seed/reference changes, not data migrations.
- A per-connection **production flag** (writes allowed, destructive blocked) was
  raised and explicitly deferred. When it lands it should *relax* fork 6, not
  reopen it.
