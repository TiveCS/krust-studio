# Krust Studio 1.7.0-beta.3

The big one for the 1.7.0 beta line: **AI Schema Sync over MCP**, plus Redis and
routine polish. **Opt in via Settings → Updates.**

## New — AI / MCP (ADR-0022)

- **In-app MCP server.** Settings → **AI / MCP**: enable a local Model Context
  Protocol endpoint on `127.0.0.1` so an AI agent (Claude Code, Codex CLI,
  Cursor…) can inspect schema and propose schema fixes. Off by default; a
  connection is invisible to the AI until you grant it. Bearer-token auth;
  copy-paste client setup (HTTP + a bundled stdio bridge for stdio-first agents).
- **Schema Sync tab.** An agent diffs an external code model (e.g. .NET EF Core
  entities) against the live DB and proposes **additive** fixes — missing tables,
  columns, indexes — which stage here for you to review, then Commit or Export a
  `.sql` for a DevOps handoff. The AI **never writes the database**; commit
  re-checks the live DB and skips anything already applied. Read-only connections
  can still diff + export.
- **AI Read Allowlist + audit.** Default-deny per table with column masking for
  the read tools; every AI call is logged to an append-only access audit.

## Redis

- Binary collection members (hash/set/zset/list) are read-safe and removable;
  binary key names can be opened (read) and deleted.
- Live TTL re-sync corrects the countdown after an external `PERSIST`/`EXPIRE`.
- Deleting a key is now a simple Yes/No confirm (key name highlighted), not a
  type-the-name step.

## Procedures & functions

- SQL-editor autocomplete for routines (procedures after `CALL`, functions in
  expressions).
- The routine tab now surfaces grants and (PostgreSQL) overload signatures.

## Fixes

- Redis connections now show their engine badge in the connection switcher.
- Faster schema introspection for the AI (bulk catalog queries instead of one
  round-trip per table — a big win on remote/serverless Postgres).
