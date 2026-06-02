# Krust Studio — Handover

Modern, fast SQL database explorer (Electron). Personal daily tool, vibe-coded,
open-sourced, use-at-own-risk, no maintenance pledge. Goal: Beekeeper-Studio UX
without the paywall; nothing like the clunky Java/Swing tools (DBeaver, MySQL
Workbench).

App lives in `krust-studio-app/`. Docs (this file, CONTEXT.md, ADRs) at repo root.

## Read first

1. `CONTEXT.md` — domain glossary + core principle ("no silent mutations").
2. `docs/adr/0001..0006` — the binding decisions. Especially:
   - 0001 Electron over Tauri (no C++ toolchain).
   - 0002 Captured DDL → Changesets, no squash (the headline feature; mostly
     NOT built yet — see Gaps).
   - 0005 Mutation safety: staged → review → transactional commit.
   - 0006 SQLite via Node built-in `node:sqlite` (zero native deps).
3. User memory (auto-loaded): prefer **registry-latest deps + pnpm**; pull
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
  - `db/drivers/{sqlite,mysql,postgres}.ts` — per-engine impls.
  - `db/session.ts` — SessionManager: one live connection per connection-id;
    read-only connections block all writes here (main-process enforced).
  - `store/connections.ts` — connections.json + password encryption via
    `safeStorage` (DPAPI).
  - `store/history.ts` — Query History + Changeset store: `history.db`
    (node:sqlite) in the data dir. `capture()` (best-effort, auto-attaches DDL to
    the connection's active changeset) + `listHistory`/`clearHistory` +
    changeset CRUD (`listChangesets`/`create`/`rename`/`delete`/`setActive`/
    `assignEntries`) + `buildChangesetSql`/`markExported`. Fed by `session.ts`
    after each successful mutation (ADR 0008, ADR 0002).
  - `ipc.ts` — all `connections:*`, `session:*`, `history:*` handlers.
- `src/preload/index.ts` — typed `window.api` (contextIsolation on).
- `src/shared/types.ts` — types shared across main/preload/renderer.
- `src/renderer/src/`
  - `store/connections.ts` — zustand: connections + live session + `enums`
    (loaded on connect, pg named enums) + **tabs**
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
  - `components/StructureView.tsx` — Columns/Indexes/Relations sub-tabs +
    refresh. Columns delegates to StructureEditor.
  - `components/StructureEditor.tsx` — editable columns; diffs draft vs original
    → SchemaOp[] → `alterTable`; per-engine limitation banner (conditional).
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
  - `components/ui/combobox.tsx` — custom creatable Combobox (Popover+Command).

## Dev loop

- `pnpm dev` (electron-vite). Renderer = HMR. **Main/preload change → must
  restart** (`taskkill /F /IM electron.exe` then `pnpm dev`).
- `pnpm typecheck` before declaring done (node + web). `pnpm build` to bundle.
- Windows cache-lock: rapid double dev-restart fails; kill electron, wait, start
  once.
- Test DB: `D:/Work/Krust Studio/sample.db` (sqlite, has FK). User also tests on
  a remote Postgres.

## Built (working)

Connections (CRUD, test, encrypted, SSH/SSL fields, read-only flag, reveal,
duplicate) · connect → schema tree · multi-tab data browse · filter (AND) ·
server-side sort · pagination · inline edit/insert/delete staged + transactional
commit · copy/paste · FK navigation (new filtered tab) · Structure view
(columns/indexes/relations) · editable columns (add/rename/drop; type/null on
pg+mysql) · FK add/drop (pg+mysql) · create table · per-engine limitation
banners.

## Gaps — prioritized TODO

See `docs/TODO.md`.

## How to run the grilling workflow

The user drives via `/grill-with-docs` (interview → resolve → update CONTEXT.md +
ADRs inline). Keep CONTEXT.md and ADRs current as decisions land. Offer ADRs only
when hard-to-reverse + surprising + a real trade-off.
