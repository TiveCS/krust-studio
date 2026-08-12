# 22. MCP Schema Sync: AI proposes staged schema ops, never writes the DB

Date: 2026-07-06

## Status

Accepted — **implemented in 1.7.0** (see
[mcp-status.md](../release/v1.7.0/mcp-status.md); typecheck + build green, live
agent/DB verification pending). Amends
[ADR-0003](0003-mcp-read-only-structured-tools.md) — the MCP server is no longer
strictly read-only; it gains a **write-proposal** path that stages schema changes
but still **never commits to the database**.

## Context

Recurring pain (the author's own workflow): entities change in **.NET EF Core**,
and because the team applies schema by hand with no migration tooling (ADR-0002,
ADR-0005 — a deliberate data-loss-avoidance stance), it's easy to forget which
tables/columns the live DB is now missing. The ask was to let an AI agent (Claude
Code) reconcile the two.

The naive reading — "let the AI execute the changes" — directly reverses
ADR-0003 ("the AI can never write") and bypasses the human-commit gate of
ADR-0005. Several forks were resolved (via `/grill-with-docs`):

1. **Write scope.** Propose/stage only vs AI-executes vs report-only → **propose
   only**. The AI drafts into Krust; a human reviews and commits. (AI-execute may
   come later if propose proves insufficient.)
2. **Proposal form.** Structured schema ops vs raw AI-authored DDL → **structured
   ops**; Krust generates dialect-correct DDL (Krust owns dialect, ADR-0002).
3. **Read scope.** The per-table **AI Read Allowlist** is default-deny and governs
   *data* — useless for drift (can't see what's missing). → a **separate
   Schema Introspection scope**: whole-connection *structure*, no rows, one toggle.
4. **Code source of truth.** Entity classes + DbContext only (no EF
   migrations/snapshot) → the AI **infers** SQL types from C#, which is fuzzy and
   provider-specific. This reinforces propose-only: a human must vet the column
   spec.
5. **Stage vs report.** Only **additive** findings (missing table/column/index)
   auto-stage; type/nullability changes, drops of DB objects absent from code, and
   default/constraint diffs are **report-only** — fuzzy inference plus data-loss
   risk, so the human decides (consistent with ADR-0005 destructive guard and
   ADR-0002 destructive-never-auto-attaches).
6. **Diff boundary.** The AI owns the entire diff + mapping inference; Krust stays
   **.NET/EF-agnostic and stateless** (no stored "expected schema") — each run is
   recomputed from current code + current DB.

## Decision

- Add MCP tools in three separately-gated families: **data reads** (existing AI
  Read Allowlist), **schema introspection** (new structure-only scope), and
  **`propose_schema_ops`** (stages **Proposed Schema Ops**, never commits).
- The AI reads the code model itself, computes drift + SQL mapping, and sends
  Krust only structured, engine-agnostic ops. Krust generates the DDL.
- **`propose_schema_ops` reuses Krust's existing `SchemaOp` / `CreateTableSpec`
  types** (keyed by table) — no new op vocabulary; the existing DDL generator +
  preview path apply unchanged.
- **Connection targeting is conversational** (`list_connections` → the user
  picks) — no stored code↔connection binding, keeping the run stateless.
- Proposed ops land in a dedicated **Schema Sync** tab: additive ops
  (dependency-ordered, DDL-previewed) auto-staged; everything else **report-only**
  and **promotable per-item** (side-by-side code-vs-DB spec, behind the
  destructive/typed guard; promoted drops → Unassigned inbox).
- A run is **bound to one Changeset** (active or newly-named); both the draft
  export and committed DDL use it.
- **Commit re-introspects and reconciles** against the live DB: satisfied ops are
  skipped (idempotent), conflicting ops are re-reported, only missing ops run.
- **Read-only connections** still run the full diff + `.sql` **export** (from the
  panel draft, no execution needed); only Commit is blocked (ADR-0005 guard) —
  this is the "verify Prod drift + script the handoff" case.
- **Client-agnostic + universal transport.** Tools are plain MCP (no Claude-only
  features). The in-app HTTP/SSE server stays the single enforcement point; a thin
  **stdio bridge** (no secrets, no state) forwards stdio ↔ the local endpoint so
  stdio-first agents (Codex CLI, others) work alongside HTTP-native ones (Claude
  Code). This refines ADR-0003's transport choice without reopening its rejection
  of a *stateful* standalone binary — the bridge re-derives nothing.
- Every introspection and proposal call is logged to the **AI Access Audit**,
  including the calling client's identity from the MCP `initialize` handshake.
- **Configuration** is default-deny + three-tier: a global master switch (+ port,
  token, `read_rows` sizes, notify-on-proposal toast); per-connection capability
  grants (data reads, schema introspection with an exclusion-glob list seeded
  `__EFMigrationsHistory`, accept-proposals) persisted like `readOnly`; and locked
  safety invariants (audit always-on, no auto-commit, no raw SQL, no
  "auto-approve trusted agent"). Proposals surface via a Schema Sync tab badge +
  optional toast, never focus-steal.

## Consequences

- The read-only guarantee of ADR-0003 is preserved *for the database* but no
  longer describes the MCP surface as a whole — the accurate line is "the AI can
  propose staged schema ops but never commits." CONTEXT.md updated accordingly.
- Prerequisite is the base MCP server (ADR-0003), which is still unbuilt — this
  feature is really "build the MCP server" + "add the propose side" + "Schema Sync
  UI." Targeting 1.7.0 (author's call) is a large scope addition on a beta-3 tail;
  the release risk is recorded in the 1.7.0 plan.
- Because inference is fuzzy (no EF snapshot), proposed column specs *will*
  sometimes be wrong; the staged structure-editor review is the safety net, and
  the user can correct the AI in-conversation and re-propose.
- Krust never learns .NET/EF — the same Schema Sync surface works for any
  ORM/language whose model an AI can read.

## Amendment (1.7.0-beta.7): `list_tables` reads under any grant

`list_tables` returns table and view **names** — no columns, keys, rows or
counts — and is gated on the connection having *at least one* grant of any kind,
rather than on the introspection grant specifically.

This is a deliberate loosening of the rule above, recorded here so it is not
mistaken for an oversight. Default-deny still holds where it carries the weight:
a connection with no grants at all remains invisible to the AI, so opting a
production connection in is still an explicit act. What changes is which
capability lets an agent read names once a connection is already exposed.

The motivating case is comparing which tables exist between two connections — a
staging database against a dev audit database. Under the original rule that
required handing over full structure on both, which is a much larger disclosure
than the question needs. The connection's introspection exclude globs still
apply: they are an instruction the user typed, and a tool that ignored them
would be a surprise. Calls are audited under their own tool name, so a name
listing is distinguishable from a structure dump in the AI Access Audit.
