# Changelog

All notable changes to Krust Studio. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are git tags
(`vX.Y.Z`) published as GitHub Releases.

## [1.6.5] — 2026-06-24

### Added
- **Open / save `.sql` files** — open a `.sql` into a new query tab (tab bar
  **Open SQL file…** / tab right-click) and save the editor's SQL out with
  **Save .sql**. Opening is a one-shot import (filename shows as the tab label;
  the tab is not linked to the file). File-backed editing (write-back, dirty
  tracking) is deferred.

## [1.6.4] - 2026-06-23

### Added
- **Native date and datetime editors in the table data grid** - editing a
  `DATE` cell now opens a calendar input, and editing `DATETIME` /
  timestamp-like cells opens a date-time input. Picked values are committed back
  as database-style literals (`yyyy-mm-dd` / `yyyy-mm-dd hh:mm:ss`) instead of
  browser `datetime-local` strings.

### Fixed
- **macOS CI packaging uses Electron Builder's supported ad-hoc signing path** -
  unsigned macOS artifacts now use `mac.identity: "-"` with Electron's library
  validation entitlement instead of a custom signing hook that failed in GitHub
  Actions. Signature verification still catches real Team ID mismatches while
  accepting the empty Team ID used by ad-hoc signatures.

## [1.6.3] - 2026-06-23

### Fixed
- **macOS unsigned builds now launch after Gatekeeper bypass** - the CI package
  path now ad-hoc signs the full `.app` bundle when no Apple Developer ID
  certificate is configured, and verifies that the main app and Electron
  Framework have matching Team IDs. This prevents the macOS `DYLD` launch crash
  caused by mixed signatures while keeping Mac releases buildable without a paid
  Apple Developer account.
- **Date and datetime cells preserve database-style display values** - table
  cells, copy/paste text, filter-by-value, edit drafts, review dialogs, and the
  FK picker now render JavaScript `Date` values as SQL-style literals
  (`yyyy-mm-dd` / `yyyy-mm-dd hh:mm:ss`) instead of UTC ISO strings. Hover
  tooltips still show readable local and UTC time.

## [1.6.2] — 2026-06-18

### Fixed
- **Renaming a MySQL/MariaDB column no longer errors on older servers** — the
  alter path emitted `ALTER TABLE … RENAME COLUMN x TO y`, syntax that only
  exists on MySQL 8.0.3+ / MariaDB 10.5.2+, so renames failed with a SQL syntax
  error on older MariaDB. Renames now go through `CHANGE COLUMN`, which is
  portable across every MySQL/MariaDB version; the column's verbatim
  `SHOW CREATE TABLE` definition is preserved (type, collation, default,
  comment, auto_increment). A rename combined with a retype or reorder is folded
  into a single `CHANGE`.

## [1.6.1] — 2026-06-17

### Fixed
- **Unsaved SQL no longer vanishes on tab switch** (ADR-0018) — query text typed
  or pasted into the editor but not yet run survived switching tabs only by luck;
  the draft is now flushed to the right tab on blur, idly while typing, and on
  tab switch (explicit tab id, never the active tab). Unsaved SQL also survives an
  app quit/restart via a `beforeunload` workspace flush.

## [1.6.0] — 2026-06-14

### Added
- **Inline filter builder + raw WHERE** (ADR-0017) — the data-grid filter is
  always visible with two modes: a structured **Builder** and a hand-written
  **Raw WHERE** predicate that Krust still wraps in its own
  `SELECT … ORDER BY … LIMIT …`, so sort, pagination, count, inline editing,
  export and FK navigation keep working. Builder → Raw seeds the box with the
  generated SQL; a `;` guard blocks smuggling a second statement. Mode + raw text
  persist per tab. Filter chrome is now a compact icon cluster (no header row).
- **Pinned columns (freeze panes)** (ADR-0016) — name-rule + primary-key pin
  rules in Settings, plus a per-tab header right-click Pin left/right · Unpin.
- **Query plan** (ADR-0014) — `EXPLAIN` / `EXPLAIN ANALYZE` rendered as a visual
  tree (full-scan/index badges, est+actual rows, cost, ms) in the SQL editor.
- **Tab pinning + drag-reorder** — pin tabs to a sticky left block, drag to
  reorder, tab right-click menu (pin/unpin, new query tab, bulk close).
- **Postgres schema selector** — sidebar dropdown filters tables/views/enums by
  schema (shown when a connection exposes more than one).
- **Configurable grid virtualization** — Settings → Data Grid threshold; small
  pages render plainly, big pages virtualize.

### Changed
- **Foreign-key values are colour-coded** (indigo) in the grid and the FK picker,
  regardless of underlying type.
- **Data / Structure switch** moved into each view's footer (bottom-left).
- Destructive DDL auto-attach to the active changeset is now configurable
  (Settings → History).

### Fixed
- Empty filter values no longer emit `col = ''` (fixes a Postgres `22P02` crash
  on integer columns and makes clearing a value fall back to all rows).
- FK picker: value highlighting, sticky-header background, and picking the
  already-selected value no longer stages a redundant edit.
- Drag-select performance — selection is painted via a DOM overlay during the
  drag with mouse handling delegated to one listener, and a virtualizer cache
  fix stops rows collapsing after the FK picker closes.
- Switching a relation-opened tab to the Data view now fetches its rows.
- Keybinding collisions fixed (`table.toggleView` off `Ctrl/⌘+B`; sidebar toggle
  is now a real rebindable command); `DROP INDEX` no longer flagged destructive.

## [1.5.0] — 2026-06-10

### Added
- **App version label** — the running version is shown in the sidebar footer.
- **Configurable, scope-aware keybindings** — a named command registry with
  default bindings and user overrides, resolved by active context.
- **Settings modal** — VSCode-style modal (Keybindings first), reachable from
  the title bar without an open connection.
- **History entry delete** and **client-side History search**.

### Changed
- **TRUNCATE** captured as a Data Mutation; a cross-cutting **destructive** flag
  (`TRUNCATE`/`DROP`/WHERE-less `DELETE`·`UPDATE`) controls changeset eligibility.

## [1.4.0] — 2026-06-10

### Added
- **Data grid virtualization** — large tables now render only the visible rows
  (TanStack Virtual), so scrolling stays smooth on big result sets.
- **Drop a relation from the Relations tab** — each foreign key has a drop
  toggle; the generated `DROP FOREIGN KEY` is staged and committed with your
  other schema edits. Dropping an index that backs a foreign key now warns and
  offers to drop both (in the correct order) or just the index.
- **Backup & Restore is a tab** — replaces the cramped modal with a full-height
  two-panel view, opened from the sidebar.
- **Syntax-highlighted history** — the Query History list is color-highlighted;
  click any row to expand the full statement, with a Format toggle for long
  one-liners. Copy always copies the verbatim captured SQL.
- **Local table templates** — save reusable column sets (e.g. `id` + audit
  columns) and apply them to a new table, or insert them into an existing one.
  Templates are local-only and engine-specific; never touch the database until
  you commit. Managed from the new sidebar Templates button.

### Fixed
- Committing a table-structure change now clears the staged edits (the pending
  indicator and queued operations no longer linger after commit).
- Release workflow no longer races two publishers, so update manifests
  (`latest.yml`) always ship with a release.

## [1.3.4] — 2026-06-09

### Fixed
- **Structure-editor changes no longer vanish when you switch tabs.** Staged
  schema edits (new/altered columns, index add/drop) lived in component-local
  state and were wiped when the tab unmounted on switch. They now live on the
  tab itself — switching away and back keeps your pending changes. Still
  in-memory only: a restart/disconnect starts clean (no silently re-applied
  writes).
- **Dropping a foreign-key column no longer errors.** The generated DDL now
  emits `DROP FOREIGN KEY` before `DROP COLUMN`, so removing an FK-backing
  column on MySQL no longer fails with "needed in a foreign key constraint".
  The drop chain is shown in the DDL preview before it runs.

### Added
- **Unsaved-changes indicator + close confirmation.** Tabs with uncommitted
  structure or data edits show an amber dot, and closing one asks before
  discarding the work.
- **Bulk tab close.** Right-click a tab for Close / Close others / Close to the
  right / Close all (middle-click also closes). Any close that would discard
  unsaved work confirms first and lists the affected tabs.

## [1.3.3] — 2026-06-09

### Fixed
- **Installer "application is running" error** — the NSIS installer now force-closes
  any running Krust Studio instance (`taskkill /F /IM krust-studio-app.exe /T`)
  before extracting files, so manual installs no longer stall with a "please close
  the application" prompt.
- **In-app update restart** — "Restart now" now destroys all windows synchronously
  before handing off to the installer, preventing the same race on the in-app
  update path (`quitAndInstall` could spawn NSIS before `app.quit()` fully drained
  the process).

## [1.3.2] — 2026-06-09

### Fixed
- **Sidebar covers title bar** — the sidebar was positioned `fixed inset-y-0`
  (anchored to the viewport top), hiding the "Krust Studio ▾" title-bar menu
  introduced in v1.3.1. Now starts at `top-8` so the title bar and its
  **Check for updates** menu item are always visible.

## [1.3.1] — 2026-06-05

### Fixed
- **Structure editor scroll** — tables with many columns no longer overflow
  behind the commit footer; the column list scrolls within its own area
  (self-contained flex layout).

### Changed
- **Add column** moved to the structure-editor footer (bottom-left, next to
  Commit/Discard) — no more scrolling to the end of the list. Adding clears any
  active column filter so the new row is visible.
- **Check for updates** — manual check in the title-bar app menu (Krust Studio ▾
  → Check for updates); toasts up-to-date / downloading / error.

## [1.3.0] — 2026-06-05

### Added
- **Persistent per-connection workspace** — your open tabs (and the active one)
  are saved per connection **and per database**, and restored after a restart,
  a disconnect, or switching connections. The app **reopens your last
  connection** on launch so you land back where you were. Only *where you were*
  is saved (entity, view, structure sub-tab, filters, sort, SQL text, draft,
  column widths) — not fetched rows or staged edits (ADR-0012).
- **Everything is a tab** — the Query History view and the connection editor are
  now tabs (singletons per connection), not full-screen takeovers. Open one and
  your data tabs stay put alongside it.
- **Connection resilience** — sessions transparently **auto-recover** from idle
  drops (serverless DBs like Neon, server-side timeouts): on a connection-fatal
  error Krust reconnects and retries the operation once, so coming back after
  lunch and clicking a table just works. Reads and transactional GUI writes
  retry; a raw SQL-editor run reconnects but is **not** silently re-run (you're
  told to re-run). Manual **Disconnect / Reconnect** + a connection **status
  dot** live in the footer connection menu (ADR-0013).
- **Backup / Restore** — export a self-contained, engine-aware `.sql` dump with
  **per-table** choice (skip / schema / schema + data) and optional
  `DROP … IF EXISTS`; large tables stream. Restore parses a dump with a
  **dry-run preview** that flags destructive statements (`DROP`/`DELETE`/
  `TRUNCATE`) before a two-step confirm; stop-on-error toggle. No external
  `mysqldump`/`pg_dump` needed. (Sidebar toolbar → backup icon.)
- **"Referenced by" (reverse FK)** — a new Structure sub-tab lists the tables
  that reference the current one (inbound FKs), with a count badge.
- **Walkable relations** — click a table in **Relations** (outbound) or
  **Referenced by** (inbound) to jump to its structure and keep walking the FK
  graph in either direction.
- **Column search in the structure editor** — filter the column list by name
  (display-only; the staged draft stays complete). Reorder is disabled while a
  filter is active.
- **Custom title bar** — a themed, frameless title bar with in-app window
  controls (minimize / maximize / close), replacing the native OS frame.

## [1.2.3] — 2026-06-04

### Fixed
- **Packaged app crashed on launch** — `Cannot find module 'ms'` (for real this
  time, verified with a local packaged build). `electron-builder` strips
  `debug`/`ms` from the asar as its own build-tooling deps — but
  `electron-updater` needs them at runtime (shared `builder-util-runtime` chain).
  Fix: **bundle `electron-updater` into the main process**
  (`externalizeDepsPlugin({ exclude: ['electron-updater'] })`) so the chain is
  inlined and nothing external needs packing. (The 1.2.2 hoist attempt didn't
  work — the exclusion is deliberate, not a hoisting gap.)

(No app-behavior changes vs 1.2.0 — packaging fix only. 1.2.1/1.2.2 builds were
broken; use this.)

## [1.2.1] — 2026-06-04

### Fixed
- **Windows build** — NSIS `oneClick: false` so the install-directory picker
  works (`allowToChangeInstallationDirectory` needs the assisted installer).
- **Release safety** — tag builds now publish a **draft** GitHub Release; review
  and publish manually so a failed/partial build never reaches auto-update
  clients.

(No app-behavior changes vs 1.2.0 — packaging/release fixes only.)

## [1.2.0] — 2026-06-03

### Added
- **Auto-update** — packaged apps check GitHub Releases on launch, download in
  the background, and prompt **Restart now** when ready (ADR-0009).
- **Installer chooses install location** — Windows NSIS now lets you pick the
  install folder (no forced `Program Files`).
- **Optional database name + multi-database switching** — leave the database
  empty to connect at the server level and browse all databases; switch the
  active one from the sidebar header (MySQL `USE` in place, PostgreSQL
  reconnects; SQLite is single-file) (ADR-0010).
- **Ctrl/⌘+P command palette** — fuzzy-search every table/view on the connection
  and open it in a tab.
- **SQL editor autocomplete upgrades** — schema-aware **column** completion
  (lazy per table referenced in the query, resolving `AS` aliases) and
  **engine-aware dialect/quoting** (backtick on MySQL, double-quote on
  Postgres/SQLite).
- **DDL syntax highlighting** — Structure → DDL is now a read-only,
  syntax-highlighted editor.
- **Resizable editor/results split** in the SQL query view.
- **Column reordering** — drag columns in the table structure editor. Free when
  creating a new table (any engine); on an existing table it's MySQL/MariaDB-only
  (a faithful, attribute-preserving `MODIFY`), and hidden on Postgres/SQLite which
  can't reorder without a table rebuild (ADR-0011).
- **DDL commit confirmation** — committing structure edits now opens a wide
  review sheet showing the exact DDL that will run (generated without executing
  it); you review and confirm before anything is applied.
- **Staged index changes** — Add/Drop index no longer fire immediately; they're
  staged (green = new, red = dropped) and committed together with column changes
  in one reviewed transaction.

### Changed
- Auto-LIMIT now records the **actual executed SQL** (`… LIMIT N`) in the result
  panel and history, not the typed text.
- Connection wizard button order: **Save · Duplicate · Test · Connect · Delete**.
- Database field is explicitly optional in the connection form.

### Fixed
- **Tab bar stays pinned** when scrolling long tables (no more whole-page
  scroll); query results fill the pane instead of leaving empty space.
- **Resize/typing performance** — column resize, the editor/results split, and
  SQL typing no longer re-render the 500-row grid/editor on every interaction.
- **Sidebar switcher lag** — opening the connection/database switcher no longer
  re-renders the full schema tree (~0.5s stall on 500+ table schemas).
- **Connection editor stuck open** — clicking a table while editing a connection
  now closes the form.
- **JSON viewer** showed `{0}` for datetime values — now renders ISO strings.
- MySQL **type/nullability edits silently dropped** `AUTO_INCREMENT` / default /
  collation (the old `MODIFY` restated only type+null); the unified verbatim
  MODIFY now preserves every unmodeled attribute (ADR-0011).

## [1.1.0]

- SQL query editor (CodeMirror 6) with per-statement results, run script /
  selection (Ctrl/⌘+Enter), query cancel, and Data Retrieval history.

## [1.0.0]

- Initial release: connections (MySQL/MariaDB, PostgreSQL, SQLite), schema
  browser, data grid with staged edits + transactional commit, filters, sort,
  pagination, FK navigation/expansion/picker, structure editor, Captured DDL →
  Changesets, query history, CSV/JSON export.

[1.3.1]: https://github.com/TiveCS/krust-studio/releases/tag/v1.3.1
[1.3.0]: https://github.com/TiveCS/krust-studio/releases/tag/v1.3.0
[1.2.3]: https://github.com/TiveCS/krust-studio/releases/tag/v1.2.3
[1.2.2]: https://github.com/TiveCS/krust-studio/releases/tag/v1.2.2
[1.2.1]: https://github.com/TiveCS/krust-studio/releases/tag/v1.2.1
[1.2.0]: https://github.com/TiveCS/krust-studio/releases/tag/v1.2.0
[1.1.0]: https://github.com/TiveCS/krust-studio/releases/tag/v1.1.0
[1.0.0]: https://github.com/TiveCS/krust-studio/releases/tag/v1.0.0
