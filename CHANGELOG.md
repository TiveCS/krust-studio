# Changelog

All notable changes to Krust Studio. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are git tags
(`vX.Y.Z`) published as GitHub Releases.

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
