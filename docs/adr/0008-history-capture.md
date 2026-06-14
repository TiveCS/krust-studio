# 8. Query-history capture point and scope

Date: 2026-05-29

## Status

Accepted (Phase 1 of the Captured-DDL/Changeset feature, ADR 0002)

## Context

CONTEXT.md's core principle is "no silent mutations": every GUI change must
surface *and log* the exact SQL. Until now the SQL was only surfaced (a toast);
nothing was persisted. ADR 0002 defines the Captured-DDL → Changeset workflow;
this ADR covers the first slice — capturing statements into a persistent history
store — and the scoping choices made to keep that signal useful.

Three forks mattered:

1. **Where to capture.** The renderer calls mutations from several places
   (`createTable`/drop/rename/truncate/`applyChanges` via the store, but
   `alterTable` is called *directly* from `StructureEditor`). Capturing in the
   renderer would miss callers and duplicate logic.
2. **Whether to capture GUI reads.** The three-stream model (Data Retrieval /
   Data Mutation / Table Mutation) implies logging reads too. But GUI browsing
   fires `readRows`/`countRows`/`searchRows` constantly — pagination, typing in
   the FK picker — which would bury the audit-valuable mutation entries in noise.
3. **How to store DML text.** Executed DML is parameterized
   (`UPDATE x SET a=? WHERE id=?`). Storing the placeholder form is accurate but
   unreadable; inlining values is readable but must never be re-executed.

## Decision

- **Capture in the main process, in `session.ts`** — the single choke point every
  mutation passes through, regardless of which renderer component initiated it.
  Each successful mutation logs its statement(s) via a best-effort `capture()`
  that swallows its own errors (logging never breaks a mutation).
- **Persist to `history.db`** (a `node:sqlite` file in the data dir — zero native
  deps, ADR 0006). Columns: ts, connection_id, stream, source, statement, status,
  affected, entity, error.
- **Do not capture GUI reads in Phase 1.** Only Data Mutation (DML via
  `applyChanges`) and Table Mutation (DDL) are logged. The Data Retrieval stream
  becomes meaningful once the SQL editor (P5) lets users run real SELECTs.
- **Store DML as display-rendered SQL** — params inlined via `renderSql`
  (`formatLiteral` escapes quotes). This is **display-only**; executed SQL stays
  parameterized in the drivers. DDL has no params, so it is stored verbatim.
- Source is always `gui` until hand-typed DDL exists (needs the SQL editor).

## Consequences

- `alterTable` and every other mutation are captured uniformly without the
  renderer caring — the scattered call sites no longer matter.
- `ApplyResult` gained an optional `statements: string[]` so drivers can hand the
  rendered DML back for capture.
- History is **success-only** for now: on error the DDL statement isn't returned
  from the driver (it throws mid-exec), so error-status capture is deferred.
- Rendered-literal DML is for human/audit reading, not replay. If a future need
  wants replayable DML, store the parameterized form + params JSON instead.
- No retention/auto-trim yet; mutation streams are kept (CONTEXT says they're
  pruned only manually — a manual Clear exists). Data Retrieval's rolling cap
  lands with read capture.
- Changeset grouping + `.sql` export (the DevOps handoff, ADR 0002) build on this
  store: `changesets` table + `changeset_id` on entries, active changeset per
  connection persisted in a `meta` kv table, auto-attach at capture time. Now
  built.

## Amendments

- **2026-06-14** — Auto-attach of destructive DDL is now a global setting (Settings → History, default **on**), stored in the `meta` kv table as `auto_attach_destructive`. Capture decision is `table_mutation && (!destructive || autoAttach)`: with it on, destructive Table-Mutation DDL (`DROP TABLE`/`DROP VIEW`) auto-attaches to the active changeset so a forgotten drop is not omitted from an exported migration (execution-time ordering means a late manual add still slots correctly); with it off, destructive entries land in Unassigned for manual move (the original no-silent-ride behaviour). `TRUNCATE`/row-deletes never auto-attach either way (Data Mutation). Exposed via `history.get/setAutoAttachDestructive` IPC.
- **2026-06-14** — `DROP INDEX` is excluded from the **Destructive** flag (`isDestructiveStatement` returns false before the bare `DROP` rule). Dropping an index is not data loss; this aligns the hand-typed SQL-editor path with the GUI drop-index path, which never flagged it.
