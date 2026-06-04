# Krust Studio — Handover

Modern, fast SQL database explorer (Electron). Personal daily tool, vibe-coded,
open-sourced, use-at-own-risk, no maintenance pledge. Goal: Beekeeper-Studio UX
without the paywall; nothing like the clunky Java/Swing tools (DBeaver, MySQL
Workbench).

App lives in `krust-studio-app/`. Docs (this file, CONTEXT.md, ADRs) at repo root.

## Read first

1. `CONTEXT.md` — domain glossary + core principle ("no silent mutations").
2. `docs/adr/0001..0013` — the binding decisions. Especially:
   - 0001 Electron over Tauri (no C++ toolchain).
   - 0002 Captured DDL → Changesets, no squash (the headline feature, built).
   - 0005 Mutation safety: staged → review → transactional commit.
   - 0006 SQLite via Node built-in `node:sqlite` (zero native deps).
   - 0008 History capture (Table/Data Mutation + Data Retrieval streams).
   - 0009 Auto-update via GitHub Releases.
   - 0010 Optional database name + multi-database switching (mysql USE / pg
     reconnect).
   - 0011 Column reorder + unified verbatim MySQL `MODIFY`.
   - 0012 Tab-centric UI + persistent per-connection workspace (**v1.3.0, built**).
   - 0013 Connection resilience: auto-retry + manual reconnect (**v1.3.0, built**).
   - 0014 Query Plan visual tree (**designed, not built** — deferred).
3. **v1.3.0 — DONE** (all 7 P0 shipped, not yet released): connection auto-retry
   (fixes the idle-drop "can't retry" bug), manual disconnect/reconnect,
   everything-is-a-tab, persistent per-connection+database workspace,
   referenced-by (reverse FK) sub-tab, walkable relations, column search in the
   structure editor. See `docs/TODO.md` → **P0** (all checked).
4. User memory (auto-loaded): prefer **registry-latest deps + pnpm**; pull
   **real shadcn source** (CLI/registry), never hand-write a lookalike or use
   native HTML controls; **ASK before designing UI**.

## Stack

- Electron + electron-vite + React 19 + TypeScript.
- Tailwind v4 + shadcn/ui (new-york) + lucide. Dark theme; primary = teal-600.
  Fonts: Inter (UI / `font-sans`) + JetBrains Mono (grid / `font-mono`), bundled
  variable ttf in `renderer/src/assets/fonts/`, tokens in `assets/main.css`.
- pnpm. **Zero native deps** (SQLite = `node:sqlite`; mysql2/pg are pure JS).
- DBs: MySQL/MariaDB, PostgreSQL, SQLite. Driver interface stays open for more.

## Architecture

- `src/main/` — Node main process.
  - `db/driver.ts` — `DbDriver` interface + SQL builders (`buildWhere`,
    `buildOrderBy`, `buildUpdate/Delete/Insert`, `buildCreateTable`,
    `fkActionClause`, `buildSearch`). All identifiers quoted, all values
    parameterized. `countRows(entity, filters)` powers the manual row counter;
    `searchRows(entity, term, limit, offset)` powers the FK Picker (cross-column
    OR-LIKE, ADR-0007). `dropEntity`/`renameTable`/`truncateTable` back the
    sidebar table ops (read-only guarded in session.ts; typed-confirm in UI).
    `listDatabases`/`currentDatabase`/`useDatabase` back the **Database Switcher**
    (ADR-0010): mysql `USE` in place, pg reconnects, sqlite single-file.
  - `db/drivers/{sqlite,mysql,postgres}.ts` — per-engine impls. Empty
    `config.database` → mysql connects server-level (no default schema), pg
    falls back to the `postgres` maintenance db, sqlite uses the file path.
  - `db/mysql-coldef.ts` — column-definition splice helpers for the unified
    MySQL `MODIFY` (ADR-0011): `extractColumnDef` (verbatim line from SHOW CREATE),
    `spliceType`/`spliceNullable`/`spliceDefault`/`dropDefault`, `positionClause`.
    Pure reposition uses the verbatim def untouched; edits splice only the changed
    attribute so auto_increment/collation/comment survive. `moveColumn` SchemaOp
    is MySQL-only (pg/sqlite throw).
  - `db/session.ts` — SessionManager: one live connection per connection-id;
    read-only connections block all writes here (main-process enforced). Also
    exposes `listDatabases`/`currentDatabase`/`useDatabase`. `runScript`
    records the **executed** SQL (auto-LIMIT inlined) to results + history.
    `withRetry()` wraps reads + transactional writes for **idle-drop auto-retry**
    (drops the dead driver, reconnects once, retries — `isConnectionFatal()` in
    `driver.ts` classifies). `reconnectSession()` backs manual reconnect;
    `execRestoreStatement()` runs one restore statement (no auto-retry, DDL-only
    capture). `listReferencingTables()` powers the reverse-FK sub-tab.
  - `db/backup.ts` — **Backup / Restore**. `runBackup()` streams an engine-aware
    `.sql` dump (schema via `getCreateSql`, data paged via `readRows` ordered by
    PK, engine-aware literal/identifier quoting, FK-disable guards so it restores
    regardless of table order), emits `backup:progress`. `restorePreview()`
    dry-runs (parse + classify + flag DROP/DELETE/TRUNCATE); `restoreRun()`
    executes (no auto-retry, FK-guard statements soft-fail, stop-on-error).
  - `store/connections.ts` — connections.json + password encryption via
    `safeStorage` (DPAPI). `getConnectionConfig()` reads driver/name for backup.
  - `store/workspace.ts` — `workspace.json` (userData): `loadWorkspace()` /
    `saveWorkspace()` — open tabs + activeTabId **per connection+database key**
    (`connectionId:dbName`) + `lastConnectionId`. Debounced + flushed by the
    renderer store; fail-soft restore.
  - `store/history.ts` — Query History + Changeset store: `history.db`
    (node:sqlite) in the data dir. `capture()` (best-effort, auto-attaches DDL to
    the connection's active changeset) + `listHistory`/`clearHistory` +
    changeset CRUD (`listChangesets`/`create`/`rename`/`delete`/`setActive`/
    `assignEntries`) + `buildChangesetSql`/`markExported`. Fed by `session.ts`
    after each successful mutation (ADR 0008, ADR 0002).
  - `ipc.ts` — all `connections:*`, `session:*`, `history:*`, `workspace:*`,
    `backup:*` handlers.
  - `index.ts` — window + **auto-updater** (`electron-updater`, GitHub Releases,
    ADR-0009): checks ~5s after show, downloads in background, sends
    `update:available`/`update:downloaded` to the renderer; `update:install`
    triggers `quitAndInstall`. Skipped in dev.
- `src/preload/index.ts` — typed `window.api` (contextIsolation on).
- `src/shared/types.ts` — types shared across main/preload/renderer.
- `src/renderer/src/`
  - `store/connections.ts` — zustand: connections + live session + `enums`
    (loaded on connect, pg named enums) + `databases`/`currentDb` +
    `switchDatabase` (Database Switcher) + **tabs**
    (each tab: entity, data, filters, orderBy, edits/deletes/inserts,
    colWidths, view 'data'|'structure', structure, draft).
  - `components/HistoryView.tsx` — dedicated full-area Query History + Changeset
    view (sidebar History button toggles `store.screen`). Left rail: changesets
    (active ★, count, status, kebab=set-active/rename/export/delete) + Unassigned
    + stream views (Table/Data Mutation all). Right pane: entry list with
    multi-select → Move to changeset/inbox, Copy (selected/all, exec order),
    per-changeset Export .sql (OS save dialog). ADR 0002/0008.
  - `components/AppSidebar.tsx` — shadcn Sidebar: header=db switcher,
    content=schema tree (tables/views, filter, refresh, +new table),
    footer=searchable connection switcher. Entity context menu: Show Data, Copy
    name, Rename… (dialog), Truncate… / Drop… (typed-confirm dialog, ADR-0005).
  - `components/DataGrid.tsx` — custom grid (NOT shadcn table): fixed/resizable
    cols, sticky header + row#, range-select (drag + shift-click), copy/paste,
    inline edit, staged insert(top)/delete, NULL/EMPTY display, FK ↗ nav
    (hover), server-side sort headers, footer commit/discard + pager.
  - `components/FilterBar.tsx` — column + op + value, multiple AND-joined.
    Presentational (props `columns`/`value`/`onApply`, no store coupling).
  - `components/TableTabView.tsx` — routes draft→NewTableEditor,
    else Data/Structure (bottom toggle).
  - `components/StructureView.tsx` — Columns/Indexes/Relations/**Referenced
    by**/DDL sub-tabs + refresh. Sub-tab lives in **tab state**
    (`tab.structureSub`, persisted) not local — powers **walkable relations**
    (click a refTable in Relations or Referenced-by → opens it at Structure →
    Relations via `openTable(ref, undefined, { view, structureSub })`).
    Referenced-by lazy-fetched + cached on the tab. Fetches structure on mount
    if null (covers restored structure tabs). **Owns the unified staged-commit**:
    column draft + staged index add/drop, one `ops = [...dropIndex, ...colOps,
    ...addIndex]`, shared footer + DDL review **Sheet**.
  - `components/StructureEditor.tsx` — controlled column editor (props: draft,
    onDraftChange, movedNames); per-engine limitation banner + ColumnsEditor +
    **column search** input (`nameFilter`, display-only; reorder disabled while
    filtering). Drag-to-reorder (canReorder=mysql). No longer owns commit.
  - `components/BackupDialog.tsx` — Backup/Restore (sidebar toolbar). Backup:
    per-object mode rows (skip/schema/schema+data) + set-all + dropFirst, live
    `backup:progress`. Restore: choose file → preview (destructive rows red) →
    stop-on-error → two-step destructive confirm → refreshes the tree after.
  - `lib/columnDiff.ts` — `seed` + `diff` (draft vs original → SchemaOp[],
    incl. minimal LIS `moveColumn` ops). Shared by StructureView.
  - `components/NewTableEditor.tsx` — new-table draft; shares `ColumnsEditor`.
  - `components/ColumnsEditor.tsx` — SHARED column row editor (name, type
    Combobox, null/pk checkbox, FK toggle+panel). Used by new-table AND
    structure edit.
  - `components/FkInlinePicker.tsx` — FK Picker: mini parent-table browser injected
    as an inline `<tr>` below the row being edited (fills visible grid width).
    Toggled by the Search icon on an editable FK cell (= highlighted write-target;
    one open at a time). Quick cross-column search (`searchRows`) XOR reused
    `FilterBar` + sortable headers + pagination (`readRows`); ✓-marks the row
    matching the cell's value; "Open full" opens the parent in a new tab. Row-click
    writes refColumn value & keeps open. Closes on tab/page/filter change. Manual
    cell typing still allowed.
  - `components/JsonViewerPanel.tsx` — JSON Viewer: right-side resizable panel,
    selected row as a custom collapsible JSON tree (nested JSON parsed), key
    filter (text/regex), copy row-JSON. FK fields expand the parent inline
    (FK Expansion) via `readRows`, nested/unlimited depth. Space / context-menu.
  - `components/ExportDialog.tsx` — result export: scope (page/selection/all
    filter) × CSV/JSON × Copy/Save. Uses `lib/export.ts` formatters,
    `sessions.exportAllRows` (paged) + `dialog.saveText` (OS save dialog).
  - `components/QueryView.tsx` — SQL editor + per-statement results, **drag-
    resizable** editor/results split (DOM-direct during drag, store-commit on
    release — same perf pattern as DataGrid col-resize). SQL kept in a ref while
    typing (no re-render per keystroke; flushed on run/unmount). Lazily loads
    columns for tables referenced in the SQL (parse FROM/JOIN, debounced) →
    feeds autocomplete.
  - `components/SqlEditor.tsx` — CodeMirror 6 wrapper. Schema **and** dialect in
    a `Compartment` (reconfigured live, no remount). Per-driver dialect
    (`MySQL`/`PostgreSQL`/`SQLite`) → correct identifier quoting. Shares theme
    with SqlDisplay via `lib/cm-theme.ts`.
  - `components/SqlDisplay.tsx` — read-only CodeMirror, syntax-highlighted DDL in
    the Structure → DDL sub-tab.
  - `components/CommandPalette.tsx` — **Ctrl/⌘+P** table switcher (shadcn Command
    in a Dialog, `shouldFilter=false` + own contains-filter capped at 50 for
    speed on 500+ tables). Mounted in `App.tsx`.
  - `components/ConnectionSwitcher.tsx` / `components/DatabaseSwitcher.tsx` —
    sidebar footer (connection) + header (database) combobox switchers, each
    with **self-contained** popover/search state. Extracted out of AppSidebar so
    opening either popover doesn't re-render the 580-row schema tree
    (state-colocation, not memoization). DatabaseSwitcher backs the multi-db
    feature (ADR-0010).
  - `lib/cm-theme.ts` — shared CodeMirror theme + highlight style (teal accent,
    JetBrains Mono), used by SqlEditor + SqlDisplay.
  - `components/ui/combobox.tsx` — custom creatable Combobox (Popover+Command).
  - `App.tsx` — `h-svh overflow-hidden` shell so the TabBar stays pinned and only
    the grid scrolls; mounts `CommandPalette` + update toasts.

## Dev loop

- `pnpm dev` (electron-vite). Renderer = HMR. **Main/preload change → must
  restart** (`taskkill /F /IM electron.exe` then `pnpm dev`).
- `pnpm typecheck` before declaring done (node + web). `pnpm build` to bundle.
- Windows cache-lock: rapid double dev-restart fails; kill electron, wait, start
  once.
- Test DB: `D:/Work/Krust Studio/sample.db` (sqlite, has FK). User also tests on
  a remote Postgres + a remote MySQL/MariaDB (large schema, 500+ tables).
- **Perf pattern (recurring):** drag-resize and fast-typing paths mutate the DOM
  directly during the interaction and commit to the store once at the end —
  avoids re-rendering 500-row grids / the editor per mouse-move or keystroke.
  Used in DataGrid col-resize, QueryView split, and SQL-in-a-ref typing.
  Related: **state-colocation** — popover/search state for the connection +
  database switchers lives in their own leaf components, so toggling them never
  re-renders AppSidebar's big schema tree. (Tree filter-typing still re-renders
  it; memoize `EntityGroup` if that becomes a problem.)
- Navigating to a table/tab (`openTable`/`setActiveTab`/`openNewTable`/
  `openQuery`) clears `selectedId`/`creatingNew` so the connection editor closes
  — otherwise editing a connection then clicking a table left the form stuck open.
- Auto-update is **GitHub Releases** (`electron-builder.yml` publish →
  `TiveCS/krust-studio`). Release flow: bump `package.json` version → `pnpm
  build:win` → upload installer + `latest.yml` to a `v<version>` GitHub Release.
  Only fires in packaged builds, not dev.

## Built (working)

Connections (CRUD, test, encrypted, SSH/SSL fields, read-only flag, reveal,
duplicate, **optional database**) · connect → schema tree · **multi-database
switcher** (mysql/pg) · multi-tab data browse · filter (AND/OR groups) ·
server-side sort · pagination · inline edit/insert/delete staged + transactional
commit · copy/paste · FK navigation/expansion/picker · Structure view
(columns/indexes/relations/**referenced-by**/DDL, **syntax-highlighted**,
**walkable FK graph** both directions, **column search**) · editable columns
(add/rename/drop; type/null on pg+mysql) · **column reorder** (drag handle;
existing-table MySQL-only via unified verbatim MODIFY, free on new-table any
engine — ADR-0011) · FK add/drop (pg+mysql) · create table ·
per-engine limitation banners · **SQL editor** (schema+column autocomplete,
engine-aware dialect/quoting, auto-LIMIT shown, cancel, resizable split) ·
**Ctrl/⌘+P command palette** · Query History + Changesets + export · result
export (CSV/JSON) · **auto-update** (GitHub Releases) · installer custom path ·
**everything-is-a-tab** (history + connection editor are tabs) · **persistent
per-connection+database workspace** (tabs restored on restart/reconnect/switch) ·
**connection resilience** (idle-drop auto-retry + manual disconnect/reconnect
with status dot) · **Backup / Restore** (streamed engine-aware `.sql` dump,
per-table schema/data; restore with dry-run preview + destructive flagging +
two-step confirm).

## Gaps — prioritized TODO

See `docs/TODO.md`.

## How to run the grilling workflow

The user drives via `/grill-with-docs` (interview → resolve → update CONTEXT.md +
ADRs inline). Keep CONTEXT.md and ADRs current as decisions land. Offer ADRs only
when hard-to-reverse + surprising + a real trade-off.
