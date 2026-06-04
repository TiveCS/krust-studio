# 12. Tab-centric UI with a persistent per-connection workspace

Date: 2026-06-04

## Status

Accepted

## Context

The app shell had three mutually-exclusive full-area "screens": the data/tab
view, the **connection editor**, and the **Query History** view. Opening the
connection editor or history *replaced* the whole area, hiding the open tabs —
and the only way back to your tabs was to open a table from the sidebar. Users
got lost ("how do I get back to what I had open?").

Tabs were also pure in-memory state (zustand, no persistence): closing the app,
disconnecting, or switching connections threw away the whole working set. Coming
back meant re-opening every table, re-typing filters, re-finding where you were.

## Decision

- **Everything is a Tab.** Data browsers, the SQL editor, new-table drafts,
  **Query History**, and the **connection editor** are all tab types. The
  full-area screen-takeover is removed; the shell is always the tab bar + the
  active tab's content. Opening history or the editor adds/focuses a tab; closing
  it returns to the data tabs. History and the connection editor are **singletons
  per connection** (open focuses the existing tab; the editor also has one "new
  connection" tab).
- **Persist the Workspace** (a connection's open tabs + active tab) so the user
  lands back where they were after a restart, disconnect, or connection switch.
  Memory is **per connection** — each connection remembers its own tabs.
- Persist only *where you were* — entity, view (data/structure), filters, sort,
  SQL text, draft, column widths, active tab — **not** fetched rows/results,
  staged edits, or introspected structure. Content is transient and re-fetched
  lazily when a restored tab is viewed.
- Store the workspace in the **configurable data directory** (a `workspace.json`
  alongside `connections.json` / `history.db`), written from the main process via
  IPC (debounced), not in renderer `localStorage`.

## Consequences

- The shell simplifies (no `screen` branching), but the Tab model grows several
  variants (data / query / draft / history / connection-editor), each needing a
  serialisable form and a render branch.
- Persisting to the data dir (not `localStorage`) keeps all user state in one
  configurable, backup-able place (consistent with the Data Location decision),
  at the cost of IPC + debounce plumbing.
- Restored tabs can reference entities that no longer exist (schema changed while
  away). Restore must fail soft — drop or flag a tab whose entity is gone rather
  than error the whole workspace.
- Per-connection tab memory means tabs move from one global array to a
  per-connection structure; connection switch loads that connection's tabs
  instead of clearing.
- Staged (uncommitted) edits are intentionally **not** persisted — reopening is a
  clean slate, consistent with the no-silent-mutation stance (we never silently
  re-apply pending writes from a previous session).
