# Krust Studio — TODO (gap backlog)

Prioritized. Top group = highest value (matches CONTEXT.md + Beekeeper parity).

## P0 — v1.3.0: workspace & connection resilience — DONE

All 7 shipped. Design resolved via `/grill-with-docs`. See
[ADR-0012](adr/0012-tab-centric-persistent-workspace.md) (tab-centric workspace)
and [ADR-0013](adr/0013-connection-resilience-auto-retry.md) (auto-retry), and
CONTEXT.md **Session** + **Workspace & Tabs** + **Referenced By (Reverse FK)**.

- [x] **Connection auto-retry (the bug).** Done. `isConnectionFatal()` in
      `driver.ts` (mysql2 `fatal`, POSIX codes, pg SQLSTATE 08xxx/57P01, message
      fallback). `withRetry<T>()` in `session.ts` drops the dead driver,
      reconnects once, retries — wraps all reads + transactional writes
      (`applyChanges`, `alterTable`, etc.). `runScript` reconnects but returns a
      `{ kind: 'reconnected' }` marker (amber "re-run" in QueryView), never
      silently re-runs.
- [x] **Manual Disconnect / Reconnect.** Done. `reconnectSession()` (close +
      fresh connect) via IPC. Footer `ConnectionSwitcher`: status dot
      (teal/amber-pulse/gray/red) + Disconnect (flush workspace → clear tabs →
      landing, keep `openConnectionId`) / Reconnect (restore workspace tabs).
- [x] **Everything-is-a-tab.** Done. Removed `screen`/`selectedId`/`creatingNew`.
      Tab `kind: 'history' | 'connection-editor'` (singleton per connection).
      `App.tsx` routes by `activeTab.kind`. `openHistoryTab()` /
      `openConnectionEditorTab()` / `patchEditorTabConnection()`. ConnectionForm
      `onSaved`/`onConnected` props.
- [x] **Persistent per-connection workspace.** Done. `workspace.json` (userData),
      `store/workspace.ts` + `workspace:load`/`save` IPC. Debounced (800ms)
      `scheduleWorkspaceSave()`; `flushWorkspace()` on switch/disconnect.
      Per-connection **and per-database** keys (`connectionId:dbName`). Fail-soft
      restore (drops tabs for vanished entities). Auto-fetch on
      restore/open/setActiveTab. `SerializedTab` persists entity/view/structureSub/
      filters/sort/colWidths/sqlDraft/draft.
- [x] **"Referenced by" (reverse FK) sub-tab.** Done. `listReferencingTables`
      on all 3 engines (MySQL `KEY_COLUMN_USAGE`, pg `pg_constraint confrelid`
      with action-char decode, SQLite scans each table's `pragma_foreign_key_list`
      + resolves implicit PK target). New Structure sub-tab with count badge,
      lazy-fetched + cached on the tab (`referencedBy`/`referencedByLoading`),
      invalidated on `refreshStructure`.
- [x] **Walkable relations.** Done. Structure sub-tab lifted to tab state
      (`tab.structureSub`) + persisted in `SerializedTab`. `setStructureSub()` /
      `fetchReferencedBy()` store actions. `openTable` gains `opts { view,
      structureSub }`. Clicking a refTable in Relations (outbound) or
      Referenced-by (inbound) opens that table at Structure → Relations.
- [x] **Column search in the structure editor.** Done. `ColumnsEditor` gains
      `nameFilter` (display-only substring on column name; draft/diff stay full).
      Reorder disabled while filtering (`canDrag = reorderable && !filtering`;
      grip dims). `StructureEditor` renders a "Filter columns…" input above the
      list.

## P1 — high value, mostly cheap

- [x] **Total row count + page size control.** Done. `countRows(entity,
      filters)` on every driver (separate query, not bundled into readRows).
      Count is **manual** (footer "? count" button) — avoids slow `count(*)` on
      huge prod tables; total caches per filter set, invalidated on filter
      change. Page-size selector (50/100/500, shadcn Select). First/last-page
      jump (last enabled once counted).
- [x] **Result export (CSV / JSON).** Done. Grid footer **Export** → dialog:
      scope (current page / selection / all-matching-filter) × format (CSV/JSON) ×
      Copy or Save. Page+selection are renderer-side (`lib/export.ts`); all-filter
      via `exportAllRows` (main, paged 1k, 500k cap). Save via reusable
      `dialog.saveText` (OS save dialog). CSV is RFC-4180-ish (quote/escape).
- [x] **FK Expansion / JSON Viewer.** Done. `JsonViewerPanel.tsx` — right-side
      resizable panel shows the selected row (follows selection live) as a custom
      collapsible JSON tree (nested JSON parsed), key filter (text/regex), copy
      row-JSON; Space / right-click → "View row (JSON)". FK fields show an expand
      caret → lazy `readRows(parent WHERE refCol=value LIMIT 1)` (its result
      carries the parent's FKs) → parent nests inline; nested FKs expand further,
      unlimited depth, cached per node. Replaced the old single-cell viewer.
- [x] **Cell full-value viewer.** Done. `CellViewerPanel.tsx` — resizable
      right-side panel, read-only, pretty-prints JSON, copy button. Opens via
      Space on the selected cell or right-click → "View value". Reflects staged
      edits live. Hidden until invoked (no layout shift).

## P2 — schema completeness

- [x] **Add / drop Index.** Done. `createIndex`/`dropIndex` per engine
      (`defaultIndexName` when blank; pg schema-qualified drop, mysql `DROP INDEX
      … ON tbl`). Structure → Indexes: Add-index dialog (name optional, column
      checklist w/ order, unique, engine-aware **method** USING btree/hash/gist/
      gin/… — pg+mysql, hidden on sqlite, whitelisted per driver) + per-row drop
      (plain confirm — index drop is not data loss). Read-only blocks both (main
      guard). DDL captured (Table Mutation) + toasted.
- [x] **Drop table / rename table / truncate.** Done. Sidebar context menu:
      Rename… (dialog), Truncate… + Drop… (typed-name confirm per ADR-0005),
      Copy name. Drop works on views too. Read-only connections block all three
      (main-process guard). Driver methods `dropEntity`/`renameTable`/
      `truncateTable` (sqlite truncate = `DELETE`); store closes/retargets/
      refetches affected tabs + refreshes the tree. DDL surfaced via toast
      (persisted capture lands with P4).
- [x] **Editable default value + auto-increment/identity.** Done. Per-column
      caret → advanced panel (Default free-text expr + Auto-increment). DDL
      dialect-aware: sqlite `INTEGER PRIMARY KEY AUTOINCREMENT`, mysql
      `AUTO_INCREMENT`, pg `GENERATED BY DEFAULT AS IDENTITY`; `DEFAULT` on create
      + addColumn; `setDefault`/`dropDefault` ALTER (pg+mysql, sqlite throws).
      Auto-inc = create-time only. (Unsigned/MySQL-only deferred — niche.)
- [x] **Show CREATE / view DDL.** Done. Structure → **DDL** sub-tab (read-only,
      copy). `getCreateSql` self-detects table/view: sqlite `sqlite_master.sql`
      (+ secondary index DDL), mysql `SHOW CREATE TABLE/VIEW`, pg reconstructs
      CREATE TABLE from catalog (cols/default/NOT NULL/PK/FK + CREATE INDEX,
      skips PK-backed index) and `pg_get_viewdef` for views — flagged
      "approximate".
- [x] **Postgres type mapping.** Done. `describeTable` now reads column types via
      `pg_catalog.format_type(atttypid, atttypmod)` instead of information_schema
      `data_type` → enums resolve to the enum name, arrays to `elem[]`, all
      ALTER-usable. Default via `pg_get_expr`, nullable via `attnotnull`. The pg
      "descriptive type" warning banner is dropped (no longer needed); also fixes
      the reconstructed CREATE DDL types.
- [x] **Enums surfaced** (CONTEXT "Enum"). `listEnums` (pg `pg_type`/`pg_enum`,
      cached per connection; mysql/sqlite []). pg `readRows` types → `format_type`
      so enum columns are recognizable by name. Sidebar: collapsible sections +
      **Enums** group (expand inline → values). Column type picker offers enum
      names (reuse). Structure editor badges enum columns + values. Grid edits
      enum cells via combobox of values (mysql inline `enum(...)` parsed too).

## P3 — data reader depth

- [x] **Filter OR + grouping + IN/BETWEEN + filter-by-cell.** Done. `in`/`between`
      ops; **single-level bracketed groups** — collapsible FilterBar → vertical
      builder, AND/OR within a group + AND/OR between groups → `(a AND b) OR (c)`.
      Zero-ripple: `Filter.group`/`conj`/`groupConj`, `buildWhere` buckets+parens
      (no readRows sig change). Right-click cell → "Filter by this value".
      (Arbitrary-depth nesting not built — single level covers it.)
- [x] **Multi-column sort.** Done. `orderBy` is now `Sort[]` end-to-end
      (`buildOrderBy` → `ORDER BY c1 d1, c2 d2`). Plain-click header = sort by that
      col only (asc→desc→none); Shift-click = add/cycle/drop keeping the rest;
      header shows dir arrow + priority number when multiple.
- [x] **Affected-row preview / commit review** (ADR-0005). Done. Commit opens a
      review dialog: inserts/updates(old→new)/deletes listed + total rows
      affected + one-transaction note + Confirm (grid edits are pk-targeted, 1 row
      each — this is the ADR "see it before it runs" step).
- [x] **FK Picker** (CONTEXT.md, [ADR-0007](docs/adr/0007-cross-column-text-search.md)).
      Done. `FkInlinePicker.tsx` — compact picker injected as an inline `<tr>`
      directly below the row being edited (popover too cramped, bottom panel too
      far). Search icon on an editable FK cell toggles it + sets that cell as
      highlighted write-target; one open at a time. Mini parent-table browser:
      quick cross-column search (`searchRows`) XOR reused `FilterBar` + sortable
      headers + pagination (`readRows`); ✓-marks the row matching the cell value;
      "Open full" → parent in new tab; row-click writes refColumn value & keeps
      open; closes on tab/page/filter change.
      Driver method `searchRows(entity, term, limit, offset)` on all 3 engines
      (dialect-aware text cast + CI LIKE, `buildSearch` in driver.ts).
- [x] **Fonts.** Done. Inter (UI) + JetBrains Mono (grid headers + data cells)
      bundled from repo-root dirs into `assets/fonts/`, @font-face'd (variable
      ttf), Tailwind `--font-sans`/`--font-mono` tokens set. Existing ad-hoc
      `font-mono` usages inherit JetBrains Mono.
- [x] **Bulk edit.** Done. Right-click selection → "Fill selection…" (one value
      to every editable cell) / "Fill selection NULL".
- [x] **Type-aware cell rendering.** Done. bool (green/red), number (sky,
      tabular), JSON object (violet), ISO timestamp (amber) coloured in the grid.
- [ ] **Virtualize grid** (TanStack Virtual). Deferred — high regression risk vs
      the custom selection-drag / sticky header / inline-`<tr>` picker / col-resize;
      page size capped at 500 so low payoff now. Revisit if page size grows.

## P4 — the headline feature (ADR-0002), bigger

- [x] **Captured DDL → Table Mutation history.** Done (Phase 1,
      [ADR-0008](docs/adr/0008-history-capture.md)). Capture hooked in main
      `session.ts` (single choke point: createTable/alterTable/drop/rename/
      truncate → Table Mutation; applyChanges → Data Mutation). Persisted to
      `history.db` (node:sqlite) in the data dir: statement, ts, connection,
      source (gui), status, affected, entity. DML stored as display-rendered SQL
      (params inlined; `renderSql`, display-only). Dedicated **History view**
      (sidebar History button) with stream tabs + clear. **Deferred:** Data
      Retrieval (GUI-read) capture — waits for the SQL editor (noise); error-status
      capture (success-only now); rolling auto-trim.
- [x] **Changeset + export.** Done ([ADR-0002](docs/adr/0002-captured-ddl-changesets-no-squash.md),
      [ADR-0008](docs/adr/0008-history-capture.md)). `changesets` table +
      `changeset_id` on entries. Active changeset per connection (persisted in
      `meta`); captured Table-Mutation DDL auto-attaches; no active → Unassigned
      inbox. History view left rail: changesets (active ★, count, status) +
      Unassigned + stream views. Multi-select → Move to changeset/inbox; create/
      rename/delete (delete reverts entries to Unassigned); **export commented
      `.sql`** (header + per-stmt timestamp·target, raw chronological order, no
      squash) via OS save dialog → marks Draft→Exported.
- [x] **Capture hand-typed DDL too.** Done with the SQL editor — `runScript`
      captures every statement with `source: 'manual'`, classified into the right
      stream (DDL → Table Mutation, auto-attaches to active changeset).

## P5 — bigger surfaces (own cycles)

- [x] **SQL query editor.** Done (CodeMirror 6, not Monaco — custom teal theme).
      Dedicated query tabs (+SQL in tab bar): editor + per-statement results.
      Quote/comment/dollar-quote-aware `splitStatements`; run whole script or the
      selection (Ctrl+Enter); SELECT→rows / writes→affected; optional auto-LIMIT
      500. Schema-name autocomplete. **Query cancel**: pg (`pg_cancel_backend`) +
      mysql (`KILL QUERY`); sqlite unsupported (synchronous). Every run captured
      (source=manual) → **Data Retrieval** stream now live (3rd History rail view).
- [ ] **Backup / Restore** (self-contained SQL dump, per-table granularity;
      restore with create-target + dry-run). CONTEXT.md "Backup"/"Restore".
- [ ] **MCP server** (post-MVP nice-to-have, ADR-0003) — read-only structured
      tools + AI Read Allowlist + audit. Explicitly low priority.

## Resolved

- **Staged index changes** — Add/Drop index now stage (not fire immediately) and
  commit together with column edits via one reviewed transaction. New `addIndex`/
  `dropIndex` SchemaOps handled in every driver's `alterTable`; staged state +
  unified commit/preview footer lifted to `StructureView`; column-diff extracted
  to `lib/columnDiff.ts`; `StructureEditor` is now a controlled column editor.
  MySQL DDL still auto-commits per statement (no true rollback) — the win is the
  unified review-before-run, real atomicity only on pg.
- **Preview SQL (structure editor)** — `previewAlter` (driver `alterTable(...,
  dryRun=true)` → builds statements, no execute, no capture) + a review sheet
  showing the DDL via `SqlDisplay`. Schema-edit analogue of the DML affected-row
  preview (ADR-0005).
- **Column reordering** (ADR-0011) — drag handle in the column-row editor.
  New-table: free on any engine (CREATE order). Existing table: MySQL/MariaDB-only
  via `moveColumn` SchemaOp → unified verbatim-spliced `MODIFY ... AFTER/FIRST`
  (`db/mysql-coldef.ts`); pg/sqlite hidden + throw. Also fixes the latent
  `alterColumn` bug that silently dropped auto_increment/default/collation on
  type/null edits.
- **Sidebar switchers** — connection (footer) + database (header) extracted to
  own components (`ConnectionSwitcher`/`DatabaseSwitcher`); database switcher is a
  searchable combobox. Self-contained state → opening either no longer
  re-renders the 580-row schema tree (was a ~0.5s stall).
- **Connection-editor stuck** — opening a table/tab now clears the
  editing/creating state so the connection form closes (was stuck open).
- **Connection wizard button order** — Save · Duplicate · Test · Connect · Delete.
- **Optional database + multi-database switcher** (mysql/pg). Empty db connects
  server-level; sidebar header lists & switches databases. mysql `USE` in place,
  pg reconnects, sqlite single-file. ADR-0010. CONTEXT "Database Switching".
- **Auto-update** via GitHub Releases (`electron-updater`, ADR-0009) +
  installer **custom install path** (NSIS `allowToChangeInstallationDirectory`).
- **Ctrl/⌘+P command palette** — fuzzy table switcher (own filter, capped for
  500+ tables). CONTEXT "Command Palette".
- **SQL editor autocomplete** upgraded: engine-aware dialect (backtick vs
  double-quote), schema **column** completion (lazy per referenced table,
  alias-resolving), live schema/dialect via CodeMirror `Compartment`.
- **DDL syntax highlighting** — Structure → DDL now read-only CodeMirror
  (`SqlDisplay`), shared theme `lib/cm-theme.ts`.
- **Auto-LIMIT visibility** — result panel + history record the executed SQL
  (`… LIMIT N`), not the typed text.
- **Perf fixes** — DataGrid column-resize, QueryView editor/results split, and
  SQL typing no longer re-render the 500-row grid/editor per interaction
  (DOM-direct during drag/type, store-commit on release; SQL kept in a ref).
- **Layout** — TabBar stays pinned on long tables (`h-svh overflow-hidden`
  shell); QueryView results fill the pane (removed `max-h` cap).
- **JSON viewer** — `Date` values now render as ISO strings, not `{0}`.
- Idle serverless (Neon) connection drop crashed the main process — pg/mysql
  now swallow the connection `error` event + auto-reconnect on next query via
  `ensure()`. In-flight query may error once to a toast, then reconnects.

## Known bugs / sharp edges

- ~~pg type edit footgun~~ — fixed (types now via `format_type`, ALTER-safe).
- New-table draft: leaving a typed-then-cleared PK cell as '' can fail on commit
  (sqlite). Leave PK untouched for auto-increment.
- SQLite: existing-column type/nullability + FK add/drop unsupported (native
  ALTER limit; banner shown). No table-rebuild fallback by design (ADR-0002).
