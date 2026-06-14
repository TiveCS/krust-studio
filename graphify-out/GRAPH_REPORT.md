# Graph Report - .  (2026-06-14)

## Corpus Check
- 81 files · ~62,350 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 612 nodes · 1403 edges · 49 communities (36 shown, 13 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 105 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `cn()` - 85 edges
2. `EntityRef` - 49 edges
3. `SqliteDriver` - 31 edges
4. `MysqlDriver` - 24 edges
5. `Filter` - 20 edges
6. `getConnectionConfig()` - 19 edges
7. `PostgresDriver` - 18 edges
8. `withRetry()` - 18 edges
9. `useConnections` - 18 edges
10. `connectSession()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `BackupDialog()` --calls--> `useConnections`  [INFERRED]
  krust-studio-app/src/renderer/src/components/BackupDialog.tsx → krust-studio-app/src/renderer/src/store/connections.ts
- `BackupView()` --calls--> `useConnections`  [INFERRED]
  krust-studio-app/src/renderer/src/components/BackupView.tsx → krust-studio-app/src/renderer/src/store/connections.ts
- `ColumnsEditor()` --calls--> `cn()`  [INFERRED]
  krust-studio-app/src/renderer/src/components/ColumnsEditor.tsx → krust-studio-app/src/renderer/src/lib/utils.ts
- `ConnectionSwitcher()` --calls--> `useConnections`  [INFERRED]
  krust-studio-app/src/renderer/src/components/ConnectionSwitcher.tsx → krust-studio-app/src/renderer/src/store/connections.ts
- `ExportDialog()` --calls--> `cn()`  [INFERRED]
  krust-studio-app/src/renderer/src/components/ExportDialog.tsx → krust-studio-app/src/renderer/src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (49 total, 13 thin omitted)

### Community 0 - "DB Drivers (mysql/pg/sqlite)"
Cohesion: 0.05
Nodes (53): buildCreateTable(), buildDelete(), buildInsert(), buildOrderBy(), buildSearch(), buildUpdate(), buildWhere(), DbDriver (+45 more)

### Community 1 - "Main Process & Session"
Cohesion: 0.08
Nodes (66): BackupProgress, fkGuards(), pgArrayBody(), quoteIdent(), restorePreview(), restoreRun(), runBackup(), sqlLiteral() (+58 more)

### Community 2 - "Connection Store & Form"
Cohesion: 0.10
Nodes (33): ConnectionForm(), DEFAULT_PORTS, emptyValues(), FormValues, Props, schema, toFormValues(), testConnection() (+25 more)

### Community 3 - "Data View Panels"
Cohesion: 0.07
Nodes (24): Data, ExportDialog(), Format, Props, Scope, FilterBar(), Group, OPS (+16 more)

### Community 4 - "Sidebar Primitives"
Cohesion: 0.13
Nodes (27): cn(), Sidebar(), SidebarContent(), SidebarContext, SidebarContextProps, SidebarFooter(), SidebarGroup(), SidebarGroupAction() (+19 more)

### Community 5 - "Shared Types & Preload API"
Cohesion: 0.12
Nodes (19): api, Window, BackupApi, BackupResult, ConnectionsApi, DialogApi, HistoryApi, HistoryQuery (+11 more)

### Community 6 - "Context Menu UI"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 7 - "Dropdown Menu UI"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 8 - "App Shell & Sidebar"
Cohesion: 0.14
Nodes (6): AppSidebar(), DatabaseSwitcher(), TabBar(), TemplateManager(), App(), useConnections

### Community 9 - "Tabs & Query State"
Cohesion: 0.18
Nodes (11): ConnectionWorkspace, QueryResult, RowEdit, SerializedTab, QueryState, SessionStatus, StructureSub, tabHasDataChanges() (+3 more)

### Community 10 - "Backup / Restore UI"
Cohesion: 0.20
Nodes (10): BackupDialog(), MODES, PanelTab, Props, BackupView(), MODES, Panel, BackupTableMode (+2 more)

### Community 11 - "Columns Editor & Templates"
Cohesion: 0.20
Nodes (8): ColumnsEditor(), EditorColumn, FK_ACTIONS, DEFAULT_COLS, Editing, Props, TYPES, NewColumnSpec

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
Cohesion: 0.24
Nodes (5): NewTableEditor(), TYPES, QueryView(), TableTabView(), VIEWS

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
Cohesion: 0.33
Nodes (7): addFkOp(), diff(), diffMoves(), Fk, fkSame(), lisKeepSet(), StructureColumn

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
Cohesion: 0.47
Nodes (5): WorkspaceData, EMPTY, loadWorkspace(), saveWorkspace(), workspacePath()

### Community 26 - "Command Palette & UI Store"
Cohesion: 0.40
Nodes (3): CommandPalette(), UiState, useUi

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

### Community 37 - "Select UI"
Cohesion: 0.50
Nodes (3): SelectContent, SelectItem, SelectTrigger

## Knowledge Gaps
- **89 isolated node(s):** `BackupProgress`, `FK_ACTIONS`, `SQL_OP`, `MYSQL_INDEX_METHODS`, `PG_INDEX_METHODS` (+84 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Sidebar Primitives` to `Data View Panels`, `Context Menu UI`, `Dropdown Menu UI`, `App Shell & Sidebar`, `Columns Editor & Templates`, `Dialog UI`, `Sheet UI`, `Command Menu UI`, `History View`, `Popover UI`, `Settings Modal`, `Query Plan Panel`, `Alert UI`, `Tooltip UI`, `Title Bar & Updater`, `Mobile Sidebar Hook`, `Button UI`, `Combobox UI`, `Checkbox UI`, `Input UI`, `Separator UI`, `Skeleton UI`?**
  _High betweenness centrality (0.368) - this node is a cross-community bridge._
- **Why does `EntityRef` connect `DB Drivers (mysql/pg/sqlite)` to `Main Process & Session`, `Data View Panels`, `Shared Types & Preload API`, `App Shell & Sidebar`, `Tabs & Query State`, `Structure View`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `useConnections` connect `App Shell & Sidebar` to `Connection Switcher`, `Connection Store & Form`, `Tabs & Query State`, `Backup / Restore UI`, `Structure View`, `Table & Query Tab Views`, `History View`, `SQL / Structure Editors`, `Command Palette & UI Store`, `Settings Modal`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Are the 84 inferred relationships involving `cn()` (e.g. with `AppSidebar()` and `ColumnsEditor()`) actually correct?**
  _`cn()` has 84 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BackupProgress`, `FK_ACTIONS`, `SQL_OP` to the rest of the system?**
  _89 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DB Drivers (mysql/pg/sqlite)` be split into smaller, more focused modules?**
  _Cohesion score 0.05320634920634921 - nodes in this community are weakly interconnected._
- **Should `Main Process & Session` be split into smaller, more focused modules?**
  _Cohesion score 0.08105022831050228 - nodes in this community are weakly interconnected._