# 3. In-app MCP server with structured read-only tools, not SQL

Date: 2026-05-28

## Status

Accepted — but **post-MVP / nice-to-have**, explicitly not a main feature.
Build only after the core DB tool and the Captured-DDL/Changeset workflow are
solid. Recorded now so the design is captured; not prioritized.

## Context

A recurring pain: the author is pulled onto projects mid-stream and has to figure
out what unfamiliar tables mean. An AI assistant that can inspect both the
database (schema + sample data) and the code would shortcut this. The plan is to
expose Krust's connections to an AI client (Claude Code / Claude Desktop) via an
MCP server.

The hard requirement is strict scoping: the AI may read only specific tables (and
their data) that the user explicitly permits — nothing else.

Two design forks mattered:

1. **What the AI can run.** Arbitrary SQL is powerful (joins, aggregation) but
   cannot be safely bounded — subqueries, CTEs, functions, and joins can reach
   disallowed tables/columns, and a SQL parser would become the security
   boundary (hard to get right per dialect). Structured tools
   (`list_allowed_tables`, `describe_table`, `read_rows`) are less expressive but
   make the allowlist, column masks, and read-only guarantee trivially
   enforceable on every call.

2. **Where the server runs.** A standalone stdio binary works headless but must
   re-derive secrets (DPAPI) and duplicate allowlist state. An in-app HTTP/SSE
   server reuses the running app's already-decrypted connections and live
   enforcement.

## Decision

- Host the MCP server **inside the running Electron app** as a local HTTP/SSE
  endpoint bound to `127.0.0.1`, protected by a per-install auth token, and
  user-toggleable.
- Expose **only structured, read-only tools** — no arbitrary SQL.
- Gate every call through the **AI Read Allowlist** (default-deny, per-table,
  schema-only/schema+data, with column masking).

## Consequences

- The app must be open for MCP to work. Acceptable: it is a dev tool already open.
- The AI cannot perform joins or ad-hoc aggregation server-side; it must reason
  over `describe_table` (incl. FK metadata) + sampled rows. Accepted for safety.
- Read-only is structural: no tool can write, so the AI can never mutate data —
  consistent with the connection's normal use but absolute here.
- `read_rows` needs a default sample size and a hard max to prevent dumping entire
  tables into the AI context.
- Validated-SQL (parse-and-restrict) is explicitly deferred; revisit only if
  structured tools prove too limiting.
