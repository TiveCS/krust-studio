# Graph Report - Krust Studio  (2026-06-14)

## Corpus Check
- 132 files · ~91,938 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1046 nodes · 1793 edges · 106 communities (86 shown, 20 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 106 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c26aa993`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_DB Drivers (mysqlpgsqlite)|DB Drivers (mysql/pg/sqlite)]]
- [[_COMMUNITY_Main Process & Session|Main Process & Session]]
- [[_COMMUNITY_Connection Store & Form|Connection Store & Form]]
- [[_COMMUNITY_Data View Panels|Data View Panels]]
- [[_COMMUNITY_Sidebar Primitives|Sidebar Primitives]]
- [[_COMMUNITY_Shared Types & Preload API|Shared Types & Preload API]]
- [[_COMMUNITY_Context Menu UI|Context Menu UI]]
- [[_COMMUNITY_Dropdown Menu UI|Dropdown Menu UI]]
- [[_COMMUNITY_App Shell & Sidebar|App Shell & Sidebar]]
- [[_COMMUNITY_Tabs & Query State|Tabs & Query State]]
- [[_COMMUNITY_Backup  Restore UI|Backup / Restore UI]]
- [[_COMMUNITY_Columns Editor & Templates|Columns Editor & Templates]]
- [[_COMMUNITY_Structure View|Structure View]]
- [[_COMMUNITY_Dialog UI|Dialog UI]]
- [[_COMMUNITY_Sheet UI|Sheet UI]]
- [[_COMMUNITY_Table & Query Tab Views|Table & Query Tab Views]]
- [[_COMMUNITY_Pinned Columns Settings|Pinned Columns Settings]]
- [[_COMMUNITY_Command Menu UI|Command Menu UI]]
- [[_COMMUNITY_History View|History View]]
- [[_COMMUNITY_SQL  Structure Editors|SQL / Structure Editors]]
- [[_COMMUNITY_Column Diff|Column Diff]]
- [[_COMMUNITY_Keybinding Commands|Keybinding Commands]]
- [[_COMMUNITY_Popover UI|Popover UI]]
- [[_COMMUNITY_Data Grid|Data Grid]]
- [[_COMMUNITY_SQL Highlighting|SQL Highlighting]]
- [[_COMMUNITY_Workspace Persistence|Workspace Persistence]]
- [[_COMMUNITY_Command Palette & UI Store|Command Palette & UI Store]]
- [[_COMMUNITY_Settings Modal|Settings Modal]]
- [[_COMMUNITY_Query Plan Panel|Query Plan Panel]]
- [[_COMMUNITY_Enum Handling|Enum Handling]]
- [[_COMMUNITY_Alert UI|Alert UI]]
- [[_COMMUNITY_Card UI|Card UI]]
- [[_COMMUNITY_Tooltip UI|Tooltip UI]]
- [[_COMMUNITY_Connection Switcher|Connection Switcher]]
- [[_COMMUNITY_Title Bar & Updater|Title Bar & Updater]]
- [[_COMMUNITY_CodeMirror Theme|CodeMirror Theme]]
- [[_COMMUNITY_Table Templates|Table Templates]]
- [[_COMMUNITY_Select UI|Select UI]]
- [[_COMMUNITY_SQL Display|SQL Display]]
- [[_COMMUNITY_Mobile Sidebar Hook|Mobile Sidebar Hook]]
- [[_COMMUNITY_Button UI|Button UI]]
- [[_COMMUNITY_Combobox UI|Combobox UI]]
- [[_COMMUNITY_Checkbox UI|Checkbox UI]]
- [[_COMMUNITY_Input UI|Input UI]]
- [[_COMMUNITY_Label UI|Label UI]]
- [[_COMMUNITY_Separator UI|Separator UI]]
- [[_COMMUNITY_Skeleton UI|Skeleton UI]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 85 edges
2. `EntityRef` - 49 edges
3. `Glossary` - 34 edges
4. `SqliteDriver` - 31 edges
5. `MysqlDriver` - 24 edges
6. `Filter` - 20 edges
7. `getConnectionConfig()` - 19 edges
8. `PostgresDriver` - 18 edges
9. `withRetry()` - 18 edges
10. `useConnections` - 18 edges

## Surprising Connections (you probably didn't know these)
- `ColumnsEditor()` --calls--> `cn()`  [INFERRED]
  krust-studio-app/src/renderer/src/components/ColumnsEditor.tsx → krust-studio-app/src/renderer/src/lib/utils.ts
- `ConnectionSwitcher()` --calls--> `useConnections`  [INFERRED]
  krust-studio-app/src/renderer/src/components/ConnectionSwitcher.tsx → krust-studio-app/src/renderer/src/store/connections.ts
- `ExportDialog()` --calls--> `cn()`  [INFERRED]
  krust-studio-app/src/renderer/src/components/ExportDialog.tsx → krust-studio-app/src/renderer/src/lib/utils.ts
- `FkInlinePicker()` --calls--> `cn()`  [INFERRED]
  krust-studio-app/src/renderer/src/components/FkInlinePicker.tsx → krust-studio-app/src/renderer/src/lib/utils.ts
- `JsonViewerPanel()` --calls--> `cn()`  [INFERRED]
  krust-studio-app/src/renderer/src/components/JsonViewerPanel.tsx → krust-studio-app/src/renderer/src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (106 total, 20 thin omitted)

### Community 0 - "DB Drivers (mysql/pg/sqlite)"
Cohesion: 0.14
Nodes (21): buildCreateTable(), buildDelete(), buildInsert(), buildSearch(), buildUpdate(), FK_ACTIONS, fkActionClause(), renderSql() (+13 more)

### Community 1 - "Main Process & Session"
Cohesion: 0.07
Nodes (74): BackupProgress, fkGuards(), pgArrayBody(), quoteIdent(), restorePreview(), restoreRun(), runBackup(), sqlLiteral() (+66 more)

### Community 2 - "Connection Store & Form"
Cohesion: 0.10
Nodes (33): ConnectionForm(), DEFAULT_PORTS, emptyValues(), FormValues, Props, schema, toFormValues(), testConnection() (+25 more)

### Community 3 - "Data View Panels"
Cohesion: 0.14
Nodes (9): CommandPalette(), FilterBar(), Group, OPS, Row, seed(), FilterOp, UiState (+1 more)

### Community 4 - "Sidebar Primitives"
Cohesion: 0.13
Nodes (27): cn(), Sidebar(), SidebarContent(), SidebarContext, SidebarContextProps, SidebarFooter(), SidebarGroup(), SidebarGroupAction() (+19 more)

### Community 5 - "Shared Types & Preload API"
Cohesion: 0.10
Nodes (19): Window, BackupApi, BackupResult, ConnectionsApi, ConnectionWorkspace, DialogApi, HistoryApi, IndexInfo (+11 more)

### Community 6 - "Context Menu UI"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 7 - "Dropdown Menu UI"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 8 - "App Shell & Sidebar"
Cohesion: 0.13
Nodes (7): AppSidebar(), BackupDialog(), BackupView(), DatabaseSwitcher(), TabBar(), App(), useConnections

### Community 9 - "Tabs & Query State"
Cohesion: 0.11
Nodes (19): Props, api, EntityInfo, EntityType, EnumType, Filter, SaveConnectionInput, Sort (+11 more)

### Community 10 - "Backup / Restore UI"
Cohesion: 0.24
Nodes (8): MODES, PanelTab, Props, MODES, Panel, BackupTableMode, BackupTableSpec, RestorePreview

### Community 11 - "Columns Editor & Templates"
Cohesion: 0.13
Nodes (10): ColumnsEditor(), EditorColumn, FK_ACTIONS, DEFAULT_COLS, Editing, Props, TemplateManager(), TYPES (+2 more)

### Community 12 - "Structure View"
Cohesion: 0.20
Nodes (9): EMPTY_ADDS, EMPTY_COLS, INDEX_METHODS, METHOD_DESC, MYSQL_HASH_ENGINES, StructureView(), SUB_LABEL, SUBS (+1 more)

### Community 13 - "Dialog UI"
Cohesion: 0.18
Nodes (6): DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogTitle()

### Community 14 - "Sheet UI"
Cohesion: 0.18
Nodes (6): SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle()

### Community 15 - "Table & Query Tab Views"
Cohesion: 0.22
Nodes (6): NewTableEditor(), TYPES, QueryView(), TableTabView(), VIEWS, QueryResult

### Community 16 - "Pinned Columns Settings"
Cohesion: 0.20
Nodes (6): DEFAULT_PINS, PinPrimaryKey, PinRule, PinSettings, PinSide, SettingsState

### Community 17 - "Command Menu UI"
Cohesion: 0.20
Nodes (8): Command(), CommandDialog(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator(), CommandShortcut()

### Community 18 - "History View"
Cohesion: 0.25
Nodes (5): fmtLang(), HistoryView(), tryFormat(), View, HistoryEntry

### Community 19 - "SQL / Structure Editors"
Cohesion: 0.25
Nodes (6): DIALECTS, Props, LIMITS, StructureEditor(), TYPES, DriverType

### Community 20 - "Column Diff"
Cohesion: 0.39
Nodes (6): addFkOp(), diff(), diffMoves(), Fk, fkSame(), lisKeepSet()

### Community 21 - "Keybinding Commands"
Cohesion: 0.22
Nodes (4): CommandDef, CommandId, COMMANDS, KeybindingScope

### Community 22 - "Popover UI"
Cohesion: 0.25
Nodes (4): PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle()

### Community 23 - "Data Grid"
Cohesion: 0.47
Nodes (4): dateSpan(), dateTip(), display(), Sel

### Community 24 - "SQL Highlighting"
Cohesion: 0.40
Nodes (4): COLORS, dialectFor(), highlighter, highlightSql()

### Community 25 - "Workspace Persistence"
Cohesion: 0.04
Nodes (48): author, description, devDependencies, electron, electron-builder, @electron-toolkit/eslint-config-prettier, @electron-toolkit/eslint-config-ts, @electron-toolkit/tsconfig (+40 more)

### Community 26 - "Command Palette & UI Store"
Cohesion: 0.05
Nodes (37): AI Access Audit, AI Read Allowlist, Backup, Captured DDL, Changeset, Command Palette, Connection, Core principle (+29 more)

### Community 27 - "Settings Modal"
Cohesion: 0.40
Nodes (4): DataGrid(), SCOPE_LABELS, SettingsModal(), useSettings

### Community 28 - "Query Plan Panel"
Cohesion: 0.50
Nodes (3): fmtNum(), PlanRow(), QueryPlanPanel()

### Community 29 - "Enum Handling"
Cohesion: 0.70
Nodes (4): bareTypeName(), enumForType(), enumValues(), inlineEnumValues()

### Community 30 - "Alert UI"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 31 - "Card UI"
Cohesion: 0.40
Nodes (4): Card, CardContent, CardHeader, CardTitle

### Community 35 - "CodeMirror Theme"
Cohesion: 0.50
Nodes (3): krustHighlight, krustSyntax, krustTheme

### Community 36 - "Table Templates"
Cohesion: 0.06
Nodes (32): dependencies, class-variance-authority, clsx, cmdk, codemirror, @codemirror/autocomplete, @codemirror/commands, @codemirror/lang-sql (+24 more)

### Community 37 - "Select UI"
Cohesion: 0.50
Nodes (3): SelectContent, SelectItem, SelectTrigger

### Community 49 - "Community 49"
Cohesion: 0.07
Nodes (26): [1.0.0], [1.1.0], [1.2.0] — 2026-06-03, [1.2.1] — 2026-06-04, [1.2.3] — 2026-06-04, [1.3.0] — 2026-06-05, [1.3.1] — 2026-06-05, [1.3.2] — 2026-06-09 (+18 more)

### Community 50 - "Community 50"
Cohesion: 0.12
Nodes (7): DbDriver, defaultIndexName(), quoteIdent(), SqliteDriver, IndexSpec, ReferencingTable, SchemaOp

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (4): buildWhere(), MysqlDriver, quoteIdent(), EntityRef

### Community 52 - "Community 52"
Cohesion: 0.21
Nodes (5): buildOrderBy(), safePaging(), PostgresDriver, quoteIdent(), RowsResult

### Community 53 - "Community 53"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 54 - "Community 54"
Cohesion: 0.11
Nodes (17): Advanced, Components, Dark Mode, Display & Media, Feedback & Status, Form & Input, Forms, Installation (+9 more)

### Community 55 - "Community 55"
Cohesion: 0.12
Nodes (15): Back up & restore, Browse data, Captured changes → a script for production *(the headline feature)*, Change schema — and see the SQL, Download & install, Edit safely (nothing writes until you say so), Getting started, Inspect (+7 more)

### Community 56 - "Community 56"
Cohesion: 0.13
Nodes (14): Known bugs / sharp edges, Krust Studio — TODO (gap backlog), P0 — v1.3.0: workspace & connection resilience — DONE, P0 — v1.3.4 + v1.4.0: editor/history/backup UX — PLANNED, P0 — v1.5.0: shortcuts, settings & history UX — PLANNED, P0 — v1.6.0: pinned columns — DONE, P1 — high value, mostly cheap, P2 — schema completeness (+6 more)

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (8): dropDefault(), extractColumnDef(), insertBefore(), positionClause(), spliceDefault(), spliceNullable(), spliceType(), MYSQL_INDEX_METHODS

### Community 58 - "Community 58"
Cohesion: 0.20
Nodes (7): Data, ExportDialog(), Format, Props, Scope, FkInlinePicker(), ColumnInfo

### Community 59 - "Community 59"
Cohesion: 0.20
Nodes (9): compilerOptions, baseUrl, composite, jsx, paths, extends, include, @/* (+1 more)

### Community 60 - "Community 60"
Cohesion: 0.22
Nodes (8): Architecture, Built (working), Dev loop, Gaps — prioritized TODO, How to run the grilling workflow, Krust Studio — Handover, Read first, Stack

### Community 61 - "Community 61"
Cohesion: 0.22
Nodes (8): Build, Development, Install, krust-studio-app, Project Setup, Recommended IDE Setup, Releasing (auto-update), Type-check

### Community 62 - "Community 62"
Cohesion: 0.22
Nodes (8): Also added, 💾 Backup & Restore, 🔌 Connection resilience, 🪟 Custom title bar, ✨ Highlights, 📦 Install, 🗂️ Persistent workspace, 🔗 Reverse foreign keys + walkable graph

### Community 63 - "Community 63"
Cohesion: 0.22
Nodes (8): ✨ Added, Backup & Restore as a tab, Drop a relation where you look for it, 🐛 Fixed, 📦 Install, Local table templates, Syntax-highlighted Query History, Virtualized data grid

### Community 64 - "Community 64"
Cohesion: 0.36
Nodes (6): classify(), FkExpand(), JsonValue(), JsonViewerPanel(), prim(), Props

### Community 65 - "Community 65"
Cohesion: 0.25
Nodes (7): ✨ Added, Bulk tab close, Dropping a foreign-key column no longer errors, 🐛 Fixed, 📦 Install, Staged schema edits no longer vanish on tab switch, Unsaved-changes indicator + close confirmation

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (6): 4. Frontend stack and UI conventions, Consequences, Context, Decision, Dependency policy, Status

### Community 67 - "Community 67"
Cohesion: 0.29
Nodes (6): 8. Query-history capture point and scope, Amendments, Consequences, Context, Decision, Status

### Community 68 - "Community 68"
Cohesion: 0.29
Nodes (6): 15. Configurable, scope-aware keybindings via a command registry, Amendments, Consequences, Context, Decision, Status

### Community 69 - "Community 69"
Cohesion: 0.29
Nodes (6): 🚀 Added, 🐛 Fixed, ✨ Highlights, 📦 Install, Krust Studio v1.2.3, ⚠️ Notes

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (6): Add column moved to the footer, 🔧 Changed, Check for updates (manual), 🐛 Fixed, 📦 Install, Structure editor scroll

### Community 71 - "Community 71"
Cohesion: 0.33
Nodes (5): 1. Electron over Tauri for the desktop shell, Consequences, Context, Decision, Status

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (5): 2. Capture GUI-generated DDL as raw, unsquashed Changesets, Consequences, Context, Decision, Status

### Community 73 - "Community 73"
Cohesion: 0.33
Nodes (5): 3. In-app MCP server with structured read-only tools, not SQL, Consequences, Context, Decision, Status

### Community 74 - "Community 74"
Cohesion: 0.33
Nodes (5): 5. Mutation safety: staged edits, transactions, and guards, Consequences, Context, Decision, Status

### Community 75 - "Community 75"
Cohesion: 0.33
Nodes (5): 6. SQLite via Node's built-in `node:sqlite`, not better-sqlite3, Consequences, Context, Decision, Status

### Community 76 - "Community 76"
Cohesion: 0.33
Nodes (5): 7. Cross-column text search as a separate driver method, Consequences, Context, Decision, Status

### Community 77 - "Community 77"
Cohesion: 0.33
Nodes (5): 9. Auto-update via GitHub Releases, Consequences, Context, Decision, Status

### Community 78 - "Community 78"
Cohesion: 0.33
Nodes (5): 10. Optional database name + multi-database switching, Consequences, Context, Decision, Status

### Community 79 - "Community 79"
Cohesion: 0.33
Nodes (5): 11. Column reordering & unified MySQL MODIFY, Consequences, Context, Decision, Status

### Community 80 - "Community 80"
Cohesion: 0.33
Nodes (5): 12. Tab-centric UI with a persistent per-connection workspace, Consequences, Context, Decision, Status

### Community 81 - "Community 81"
Cohesion: 0.33
Nodes (5): 13. Connection resilience: transparent auto-retry + manual reconnect, Consequences, Context, Decision, Status

### Community 82 - "Community 82"
Cohesion: 0.33
Nodes (5): ADR-0014 — Query Plan: visual tree over raw table output, Context, Decision, Rejected alternative, Trade-offs accepted

### Community 83 - "Community 83"
Cohesion: 0.33
Nodes (5): 16. Pinned columns: settings-driven freeze with DOM reorder, Consequences, Context, Decision, Status

### Community 84 - "Community 84"
Cohesion: 0.33
Nodes (5): compilerOptions, composite, types, extends, include

### Community 85 - "Community 85"
Cohesion: 0.47
Nodes (4): formatRows(), Row, toCsv(), toJson()

### Community 86 - "Community 86"
Cohesion: 0.40
Nodes (4): 🐛 Fixed, In-app "Restart now" race condition, 📦 Install, Installer "application is running" error

### Community 88 - "Community 88"
Cohesion: 0.50
Nodes (3): png1024, src, tmp

### Community 89 - "Community 89"
Cohesion: 0.50
Nodes (3): 🐛 Fixed, 📦 Install, Sidebar covers title bar

### Community 90 - "Community 90"
Cohesion: 0.50
Nodes (3): 🐛 Fixed, 📦 Install, What's new

## Knowledge Gaps
- **414 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+409 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Sidebar Primitives` to `Context Menu UI`, `Dropdown Menu UI`, `App Shell & Sidebar`, `Columns Editor & Templates`, `Dialog UI`, `Sheet UI`, `Command Menu UI`, `History View`, `Popover UI`, `Settings Modal`, `Query Plan Panel`, `Alert UI`, `Tooltip UI`, `Title Bar & Updater`, `Mobile Sidebar Hook`, `Button UI`, `Combobox UI`, `Checkbox UI`, `Input UI`, `Separator UI`, `Skeleton UI`, `Community 58`, `Community 64`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `EntityRef` connect `Community 51` to `DB Drivers (mysql/pg/sqlite)`, `Main Process & Session`, `Shared Types & Preload API`, `App Shell & Sidebar`, `Tabs & Query State`, `Structure View`, `Community 50`, `Community 52`, `Community 57`, `Community 58`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `useConnections` connect `App Shell & Sidebar` to `Connection Switcher`, `Connection Store & Form`, `Data View Panels`, `Tabs & Query State`, `Columns Editor & Templates`, `Structure View`, `Table & Query Tab Views`, `History View`, `SQL / Structure Editors`, `Settings Modal`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Are the 84 inferred relationships involving `cn()` (e.g. with `AppSidebar()` and `ColumnsEditor()`) actually correct?**
  _`cn()` has 84 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _414 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DB Drivers (mysql/pg/sqlite)` be split into smaller, more focused modules?**
  _Cohesion score 0.13903743315508021 - nodes in this community are weakly interconnected._
- **Should `Main Process & Session` be split into smaller, more focused modules?**
  _Cohesion score 0.07015959048479374 - nodes in this community are weakly interconnected._