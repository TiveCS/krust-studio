# Krust Studio — TODO (gap backlog)

Prioritized. Top group = highest value (matches CONTEXT.md + Beekeeper parity).

## P0 — next: inline filter builder + raw WHERE — DONE

Design resolved via `/grill-with-docs` (2026-06-14). See
[ADR-0017](adr/0017-inline-filter-builder-with-raw-where.md) and CONTEXT.md
**Filter (Data Grid)**. The current `FilterBar` is collapsed behind a chevron
(daily-driver friction) and can't express predicates outside its operator set.

- [x] **Always-visible inline filter.** Done. Removed the expand/collapse chevron;
      `FilterBar` renders the builder always, with one empty condition row at rest
      (`removeRow` keeps a row so the bar is never blank). `+ Condition` / `+ Group`
      grow inline; explicit **Apply** + **Enter** (no live-on-keystroke). External
      changes re-seed via a `lastEmitted` JSON guard so an Apply/filter-by-cell
      doesn't clobber a fresh in-progress edit.
- [x] **Builder ⇄ Raw mode toggle (one active).** Done. Segmented Builder/Raw
      toggle in the toolbar (shown only when the host wires `onSetMode` — the FK
      Picker's ephemeral `FilterBar` stays builder-only). Raw is a WHERE predicate
      that the drivers wrap in their own `SELECT … ORDER BY … LIMIT …`
      (sort/pagination/count/inline-edit/export/FK-nav unaffected). `setFilterMode`
      seeds Builder → Raw via `filtersToWhere()` (`lib/filterSql.ts`, dialect-aware
      inlined predicate); Raw → Builder does **not** parse back (builder keeps its
      own last `Filter[]`).
- [x] **Raw guard + errors.** Done. `buildWhereClause(filters, rawWhere, …)` in
      `driver.ts` is the single shared choke point used by readRows/countRows
      (exportAllRows reuses readRows): a non-empty raw predicate is rejected if it
      contains `;`, otherwise inlined verbatim (no parse/parameterize). A failed
      raw read routes to `Tab.filterError` (shown inline under the filter row, **not**
      toasted) while the last good rows stay visible (`fetchTab` doesn't clear
      `data` on raw error).
- [x] **Filter-by-cell + persistence.** Done. Right-click → "Filter by this value"
      appends a structured condition in Builder; in Raw it appends an engine-quoted
      ` AND col = value` via `appendCellCondition()` and applies. `SerializedTab`
      gains `filterMode` + `rawWhere` (persisted only when raw / non-empty); restore
      re-runs fail-soft through `fetchTab`. No migration — absent `filterMode`
      defaults to Builder.
- [x] **Driver work.** Done. `readRows`/`countRows` take an optional `rawWhere` on
      all three drivers (mysql/pg/sqlite) via the shared `buildWhereClause`; threaded
      through `session.ts` → `ipc.ts` → preload → `SessionApi`.

## P0 — v1.3.4 + v1.4.0: editor/history/backup UX — PLANNED

Design resolved via `/grill-with-docs` (2026-06-09). Split into a fast fix
release (1.3.4) and a feature release (1.4.0). See CONTEXT.md **Table Editor**
and [ADR-0012](adr/0012-tab-centric-persistent-workspace.md) clarification
(in-memory tab-switch survival vs disk persistence).

### v1.3.4 — fix (data-loss feel) — DONE (merged 69c7791, manually verified)

- [x] **Structure draft survives tab switch (the bug).** `colDraft` / `idxAdds` /
      `idxDrops` / `colFilter` live in `StructureView` component-local state, and
      `TableTabView` renders `<StructureView key={tab.id} />` → switching tabs
      unmounts it and the draft is wiped. Move them onto the `Tab` object in
      `store/connections.ts` (where data-grid `edits`/`deletes`/`inserts` already
      live). Seed the draft when `structure` first loads **only if no draft
      exists**; clear it on commit / discard / refresh — not on every remount.
      In-memory only; **not** written to `workspace.json` (ADR 0012 disk rule
      intact). Refresh-with-pending-edits goes through the dirty-confirm below.
- [x] **Dirty indicator + confirm-on-close.** Tab shows a dot when it has
      uncommitted structure OR data changes (both now on `Tab`). `closeTab` +
      bulk closes confirm before discarding a dirty tab.
- [x] **Bulk tab close.** Right-click tab menu (`ui/context-menu.tsx`): Close /
      Close others / Close to the right / Close all. All tab types. One
      consolidated dirty-confirm lists affected tabs before proceeding.
- [x] **Dependency-aware column drop (the FK-column bug).** `columnDiff.diff()`
      dropped-column loop emits **only** `dropColumn` — never inspects `o.fk`. So
      dropping an FK column on MySQL fails (`Cannot drop column: needed in a
      foreign key constraint`). Fix in `columnDiff.ts`: when a dropped column has
      `o.fk?.constraint`, also stage `dropForeignKey` (and the backing index where
      it isn't auto-dropped with the column). Backend ordering is already correct
      (`mysql.ts`: `[...dropFk, ...dropIdx, ...structural]`, dropColumn ∈
      structural), so the combined DDL runs in one transaction. Per-engine: PG
      auto-drops the column's dependent constraint (explicit drop still clearer,
      no-silent); SQLite uses its table-rebuild path. The DDL preview must show the
      full generated chain.

### v1.4.0 — features

- [x] **Backup & Restore → tab + wizard.** `Tab.kind: 'backup'` singleton (not
      persisted, like `connection-editor`). Sidebar `DatabaseBackup` button calls
      `openBackupTab()` (highlights when active). `BackupView.tsx` replaces
      `BackupDialog` modal: full-height two-panel layout (Backup/Restore); table
      list fills available space; progress inline; after backup/restore stays open
      (result via toast). `BackupDialog.tsx` kept but no longer wired to sidebar.
- [x] **History syntax highlight + readable long queries.** Done (`c9e8c98`).
      `lib/sqlHighlight.tsx` — static highlight via the lezer SQL grammar
      (`@codemirror/lang-sql` dialect parser) + `@lezer/highlight` `tagHighlighter`,
      no editor instance, colours from `cm-theme.ts`, dialect-aware. `HistoryView`
      rows show a single-line truncated highlighted preview (parse bounded to 300
      chars); a chevron expands one row at a time into the full statement via a
      single `SqlDisplay`, with a **Format toggle (default on)** using
      `sql-formatter`. Copy stays **verbatim**.
- [x] **Drop a relation where users look for it.** (a) Relations sub-tab: per-row
      Trash/Undo toggle stages `dropForeignKey` ops; disabled on SQLite + read-only.
      `Relation.constraint` added to `types.ts` + drivers (mysql/pg). `fkDrops`
      on `Tab` state, reset on structure refresh. (b) Indexes tab: `toggleDropIndex`
      detects backing-FK by `index.name === relation.constraint`; blocks bare drop
      with a "Drop both?" dialog that stages both ops in correct order (FK → index).
      Ops order: `fkDrops` → `idxDrops` → `colOps` → `idxAdds`.
- [x] **Local table templates (column sets).** Done (`c9e8c98`). `TableTemplate`
      type + `TemplatesApi`; main `store/templates.ts` (`templates.json`) + IPC +
      preload; renderer store (`templates`, load/save/remove, loaded on startup).
      `TemplateManager` dialog (sidebar toolbar) — list engine-filtered, create/edit
      via `ColumnsEditor`, delete, "Use in new table". Author via "Save as template"
      (NewTableEditor draft + StructureView columns). Apply: seed a new-table draft
      (`openNewTable({ name, columns })`) or "Insert columns" into an existing
      column draft as staged adds (`lib/templates.ts` strips PK/FK, skips name
      collisions, toasts a summary). Reusable, **local-only** named
      column sets (never on the DB until a normal Create/Commit — no-silent
      stance). Solves repeated boilerplate (`id` + audit columns
      `CreatedDate`/`CreatedBy`/`LastModifiedBy`/`RecordStatus`). Resolved via
      `/grill-me`; see CONTEXT.md **Table Template**.
      - **Scope:** columns only (`NewColumnSpec`: name/type/nullable/pk/default/fk).
        Indexes/constraints out of scope for v1.
      - **Engine-locked:** each template tagged with its capture engine; the
        picker only shows templates matching the current connection's driver
        (no cross-engine type surprises).
      - **Storage:** one global `templates.json` in the data dir, main-process +
        IPC, mirroring `connections.json` (NOT per-connection — reuse across
        same-engine projects).
      - **Author:** "Save columns as template" from an existing table's Structure
        view and from a new-table draft; editable in the manager.
      - **Apply (a)** new-table draft → seeds draft columns (PK kept).
        **Apply (b)** existing table's Columns editor → "Insert template columns"
        as staged column-adds (reuse v1.3.4 staging); strip `pk:true`, skip
        name-collisions, toast "added N, skipped M (already exists)".
      - **Manage:** a "Templates" dialog from the sidebar toolbar (list
        engine-filtered, edit via `ColumnsEditor`, rename, delete).
      - Notes: no built-in templates (audit columns are project-specific); a
        template's per-column FK is kept on apply only if the target table
        exists, else flagged.

## P0 — v1.5.0: shortcuts, settings & history UX — PLANNED

Design resolved via `/grill-with-docs` (2026-06-10). See
[ADR-0015](adr/0015-configurable-scoped-keybindings.md) and CONTEXT.md
**Settings** / **Keybinding / Command** / **History Search** / **Destructive**.

- [x] **App version label.** Surface the running app version (from
      `app.getVersion()` via IPC) somewhere visible — e.g. the sidebar footer
      near `ConnectionSwitcher`, and/or the settings/about surface. Lets the user
      confirm which build they're on (esp. after an auto-update).
- [x] **Configurable scope-aware keybindings.** Named **Command** registry, each
      with a default binding; user overrides persisted in a global `settings.json`
      (data dir, main-process store + IPC, mirroring `connections.json` — app-
      global, NOT per-connection). Central keydown **dispatcher** resolves the
      active command by context. Scope-aware (`when`-clauses): contexts `global`,
      `table-tab`, `data-view`, `structure-view`, `query-view`; two commands
      conflict only on shared key **and** overlapping scope. Migrate the existing
      `Ctrl+P` listener + data-grid local keys into the registry over time.
      Intercept colliding browser/Electron defaults (`Ctrl+N`, `F5`) on
      `webContents` so app bindings win.
      - **Default commands/bindings:** `Ctrl/⌘+S` `table.commit` (unified — opens
        the DDL preview sheet in structure-view, the affected-row commit dialog in
        data-view; no-op when nothing staged); `Ctrl/⌘+N` `table.addRow`
        (data-view); `F5` `table.refresh` (active table tab); `Ctrl/⌘+B`
        `table.toggleView` (data ⇄ structure); `Ctrl/⌘+Shift+F` `filter.add`
        (expand FilterBar + append a focused empty condition row); `Ctrl/⌘+P`
        `palette.open` (existing).
- [x] **Settings modal.** Large VSCode-style **modal** (not a tab, not per-
      connection), reachable from the title bar even with no connection open.
      Left-nav categories + search. First category: **Keybindings** — lists
      commands, shows each binding, click-to-record rebind, scoped conflict
      warning. Backed by the global `settings.json` store above.
- [x] **History entry delete.** Reuse HistoryView's existing multi-select;
      **Delete** removes selected entries (hard delete, like the bulk Clear) behind
      a count-confirm dialog. Deleting an entry that's in a changeset just removes
      that row from it. New `history.deleteEntries(ids)` IPC + store action.
- [x] **History search.** Text filter inside the History view; filters the
      currently-shown stream/changeset entries by statement text, **client-side**
      (entries capped, instant — same approach as the Command Palette). Command
      Palette stays schema-object-only.
- [x] **TRUNCATE → Data Mutation + Destructive tag.** (a) Reclassify TRUNCATE
      capture from `table_mutation` to `data_mutation` ([session.ts:270]) — rule:
      object shape = Table Mutation, row contents = Data Mutation. (b) Add a
      cross-cutting **destructive** flag to history entries (`TRUNCATE`/`DROP`/
      `DELETE`|`UPDATE` without `WHERE`): controls visibility (flagged wherever
      shown) + changeset **eligibility**. Destructive entries are **not** auto-
      attached to the active changeset, but the flag makes them changeset-eligible
      so the user can still **Move to changeset** manually. Schema column +
      classify at the `session.ts` capture choke point.

## P0 — v1.6.0: pinned columns — DONE

Design resolved via `/grill-with-docs` (2026-06-11). See
[ADR-0016](adr/0016-pinned-columns-freeze-and-reorder.md) and CONTEXT.md
**Pinned Column**.

- [x] **Pinned columns (freeze panes).** Done. Pin rules in `store/settings.ts`
      (localStorage `krust-settings-pinned-columns`, mirroring the keybindings
      store — the v1.5 settings ended up in localStorage, not the main-process
      `settings.json` the ADR named; impl follows the real code). Settings modal
      gains a **Pinned Columns** left-nav section: name-rule chip input (each chip
      has an L/R toggle + remove) + a PK auto-pin toggle with L/R. `DataGrid`
      computes `pinOf()` (per-tab override → name rule → PK rule), reorders columns
      into left-pinned → scrollable → right-pinned, and applies `position: sticky`
      with cumulative offsets (left starts past `ROWNUM_W`). Sticky cells get an
      opaque `var(--background)` backstop + translucent row/edit tint re-layered via
      `background-image` (the tint vars are <40% alpha). Body pins sit at `z-5`
      (below the `z-10` thead stacking context), header pins at `z-12`. Freeze
      shadow on the edge column. Per-tab override via header right-click menu
      (Pin left/right · Unpin · Reset), stored in `Tab.pinnedOverride`
      (session-only, NOT in `SerializedTab`). All column data is keyed by name, so
      reordering the `cols` array is safe — selection/edits/export follow display
      order (Excel-like). Spec: ADR-0016 (name rules + PK rule, three-group
      reorder, cumulative sticky offsets, freeze shadow, ephemeral per-tab
      override).

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
- [x] **Virtualize grid** (TanStack Virtual). `useVirtualizer` on rows; FK picker
      treated as a bonus virtual item at `fkTarget.r + 1`; spacer rows for
      padding; drag-select limited to visible rows (acceptable given compact row height).

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
- [x] **Backup / Restore.** Done. `main/db/backup.ts`: `runBackup()` streams an
      engine-aware self-contained `.sql` dump (schema via `getCreateSql`, data
      paged via `readRows`, INSERTs with engine-aware literal/identifier quoting,
      Buffer→hex, JSON objects). Per-table mode (skip/schema/schema+data) +
      optional `DROP … IF EXISTS`; views never carry data. `restorePreview()`
      dry-runs (parse via `splitStatements`, classify, flag DROP/DELETE/TRUNCATE);
      `restoreRun()` executes with **no auto-retry** + stop-on-error, read-only
      blocked, only DDL captured to history. `BackupDialog` (sidebar toolbar) —
      Backup/Restore tabs, two-step destructive confirm. **Deferred:** restore
      create-target DB (the "duplicate database" use case); CSV/JSON-into-table
      import.
- [ ] **MCP server** (post-MVP nice-to-have, ADR-0003) — read-only structured
      tools + AI Read Allowlist + audit. Explicitly low priority.

## Resolved

- **Inline-filter chrome + Data/Structure switch relocation** — built (post
  ADR-0017 polish). `FilterBar` dropped its header row (filter icon + condition
  counter + segmented Builder/Raw toggle); controls are now an icon-only cluster
  leading the condition row — `[mode toggle][clear][group][add][apply]` (Builder)
  / `[mode][clear][apply]` + textarea (Raw), all with `title` tooltips. Conditions
  flow horizontally (wrap), multi-group wrapped in a translucent sky bracket;
  compact controls (`h-6`, 11px; wider value input). The Data/Structure switch
  moved out of its own strip into each view's footer (shared `ViewSwitch`,
  bottom-left): `DataGrid` footer + an always-present `StructureView` footer;
  `TableTabView` strip removed.
- **Empty filter value → no-op (pg integer crash fix)** — a Builder condition
  with an empty value emitted `col = ''`, which pg rejects for integer columns
  (`22P02`) and meant clearing a value still filtered. `buildWhere` +
  `filtersToWhere` now omit value-requiring conditions whose value is empty
  (and `between` with a missing bound). Fixes the crash + Open-full + re-picking
  another FK.
- **Postgres schema selector** — sidebar gains a schema dropdown (shown only when
  >1 schema), filtering Tables/Views/Enums client-side by `e.schema`. Hidden on
  mysql/sqlite.
- **FK value colour** — FK cell values render `text-indigo-400` regardless of
  underlying type, in both the main grid and the FK picker mini-table. Shared
  renderer extracted to `lib/cellDisplay.tsx` (`display(v, fk)`).
- **FK picker mini-table fixes** — value syntax-highlighting via the shared
  `display`; sticky header `bg` moved onto `th` (was bleeding through); picking
  the already-selected value is a no-op (no redundant staged edit).
- **Data-grid drag-select perf** — drag now paints a single DOM overlay rectangle
  (anchor + focus = diagonal corners; no React re-render per cell-crossing),
  committing the final selection once on mouseup. Cell mouse interaction moved to
  **event delegation** on `<tbody>` (one listener set; cells carry `data-r`/`data-c`)
  so a selection change re-renders far cheaper. Also fixed a virtualizer cache
  corruption (`getItemKey`) that collapsed rows after the FK picker closed.
- **Configurable grid virtualization** — `store/settings.ts` `virtualizeThreshold`
  (default 150; persisted) + Settings → **Data Grid** section. Pages with more
  rows than the threshold virtualize; smaller pages render plainly (fast in prod,
  no virtualizer edge-cases). `0` = always virtualize.

- **`filter.add` command + keybinding collision fix** — built. The v1.5.0
  keybindings item listed `filter.add` (Ctrl/⌘+Shift+F) but it was never added to
  the command registry; now wired end-to-end. The `filter.add` command bumps a
  nonce in `store/ui.ts` (`requestAddFilter`); `FilterBar` watches it, expands the
  builder, appends an empty condition to the last group, and focuses its column
  picker (`data-filter-col` + `requestAnimationFrame`). Also: `table.toggleView`
  moved off **Ctrl/⌘+B** (collided with the shadcn sidebar's built-in toggle) onto
  **Ctrl/⌘+G**; the sidebar toggle is now a real command (`sidebar.toggle`,
  default Ctrl/⌘+B, global) — `ui/sidebar.tsx` reads its key from the keybindings
  store via `matchesBinding` instead of the hard-coded `"b"`, so it is rebindable
  and listed in Settings → Keybindings like every other command.
- **Configurable auto-attach for destructive DDL** — built. New global setting
  (Settings → History, default **on**) stored in `history.db` `meta`
  (`auto_attach_destructive`). When on, destructive **Table Mutation** DDL
  (`DROP TABLE`/`DROP VIEW`) auto-attaches to the active changeset like other DDL
  (so a forgotten drop isn't left out of an export — and execution-time ordering
  means a late manual add still slots correctly); when off, it lands in Unassigned
  for manual move (the original behaviour). `capture()` condition is now
  `table_mutation && (!destructive || autoAttach)`. Exposed via
  `history.get/setAutoAttachDestructive` IPC + preload + `HistoryApi`.
- **`DROP INDEX` no longer flagged destructive** — `isDestructiveStatement`
  (`session.ts`) treated every `DROP` as destructive, so a hand-typed `DROP INDEX`
  in the SQL editor got the destructive tag (skipped auto-attach) while the GUI
  drop-index path did not — same action, opposite flag. Added a `^DROP\s+INDEX`
  guard that returns false before the bare `DROP` rule. `DROP TABLE`/`VIEW`,
  `TRUNCATE`, and WHERE-less `DELETE`/`UPDATE` stay destructive.
- **Tab pinning + drag-reorder + tab context menu** — built. `Tab.pinned`
  (persisted in `SerializedTab`); `togglePinTab` keeps pinned tabs in a left
  block, `moveTab(fromId,toId)` drag-reorders (HTML5 DnD on each tab,
  re-asserting pinned-left invariant). The pinned block renders inside a
  `position: sticky left-0` wrapper (opaque `bg-card`, `z-20`, freeze shadow) so
  pinned tabs stay reachable while the unpinned tabs scroll underneath. Pinned
  tabs survive bulk-close
  (`closeOthers`/`closeToRight`/`closeAll` keep `pinned`). TabBar context menu
  gains **Pin/Unpin tab** + **New query tab** (was close-only). The `+` new-query
  button moved out of the scrolling tab strip into a `shrink-0` slot so it stays
  visible when many tabs overflow (the original gripe: had to scroll right to
  reach it).
- **Query Plan (ADR-0014)** — built. `explainQuery(sql, analyze)` on all three
  drivers → `session.explainQuery` (diagnostic, NOT history-captured; ANALYZE of
  a write blocked on read-only) → IPC/preload. Per-engine parse: pg
  `EXPLAIN (FORMAT JSON[, ANALYZE, BUFFERS])` → recursive `PlanNode`; mysql
  tabular `EXPLAIN` → flat nodes + `EXPLAIN ANALYZE` indented text → tree; sqlite
  `EXPLAIN QUERY PLAN` → parent/child tree. `QueryPlanPanel.tsx` renders the tree
  (full-scan red / index badges, est+actual rows, cost, ms) with a Raw toggle.
  Explain/Analyze buttons in the QueryView toolbar; Analyze confirms first.
- **Grid virtualizer clipped last row / stutter at page end** — `DataGrid`'s
  `useVirtualizer` used a static `estimateSize: 33` with no `measureElement`, so
  real row height (`px-3 py-1` + text + border ≈ 34-37px) drifted the computed
  positions downward as you scrolled; the last row of a 100-row page was never
  fully reachable (felt like "max ~99") and the tail juddered. Fix: attach
  `ref={rowVirtualizer.measureElement}` + `data-index` to each rendered row (data
  rows + the FK-picker virtual row) so heights are measured, not estimated.
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
- ~~Backup formats Postgres array columns as JSON, not pg array literal~~ —
  fixed. `backup.ts` `sqlLiteral` now emits a pg array literal `'{...}'` for
  JS-array values on the postgres driver via `pgArrayBody` (double-quoted,
  `\`-escaped elements; NULL bare; nested dims recurse unquoted), so `text[]` /
  `int[]` / multidim columns round-trip on restore. Scalars, JSON/JSONB, bytea
  (hex), dates already dumped correctly.
- Backup uses Postgres's reconstructed (approximate) CREATE TABLE for the schema
  dump — same caveat as the Structure → DDL sub-tab. mysql/sqlite use native
  SHOW CREATE / sqlite_master (exact).
