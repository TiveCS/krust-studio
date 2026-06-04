# Changelog

All notable changes to Krust Studio. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are git tags
(`vX.Y.Z`) published as GitHub Releases.

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

[1.2.1]: https://github.com/TiveCS/krust-studio/releases/tag/v1.2.1
[1.2.0]: https://github.com/TiveCS/krust-studio/releases/tag/v1.2.0
[1.1.0]: https://github.com/TiveCS/krust-studio/releases/tag/v1.1.0
[1.0.0]: https://github.com/TiveCS/krust-studio/releases/tag/v1.0.0
