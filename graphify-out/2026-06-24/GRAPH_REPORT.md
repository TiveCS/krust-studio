# Graph Report - Krust Studio  (2026-06-24)

## Corpus Check
- 148 files · ~101,958 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1184 nodes · 2053 edges · 112 communities (90 shown, 22 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 140 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c26b365f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_readStore writeStore|readStore writeStore]]
- [[_COMMUNITY_tsx ConnectionSwitcher|tsx ConnectionSwitcher]]
- [[_COMMUNITY_electron react|electron react]]
- [[_COMMUNITY_tsx CommandPalette|tsx CommandPalette]]
- [[_COMMUNITY_full Fixed|full Fixed]]
- [[_COMMUNITY_applyChanges driver|applyChanges driver]]
- [[_COMMUNITY_codemirror react|codemirror react]]
- [[_COMMUNITY_utils sidebar|utils sidebar]]
- [[_COMMUNITY_DbDriver quoteIdent|DbDriver quoteIdent]]
- [[_COMMUNITY_update auto|update auto]]
- [[_COMMUNITY_Registry shadcn|Registry shadcn]]
- [[_COMMUNITY_index api|index api]]
- [[_COMMUNITY_Command History|Command History]]
- [[_COMMUNITY_MysqlDriver alterTable|MysqlDriver alterTable]]
- [[_COMMUNITY_components json|components json]]
- [[_COMMUNITY_connections ConnectionWorkspace|connections ConnectionWorkspace]]
- [[_COMMUNITY_ADR Krust|ADR Krust]]
- [[_COMMUNITY_readRows FkInlinePicker|readRows FkInlinePicker]]
- [[_COMMUNITY_DONE TODO|DONE TODO]]
- [[_COMMUNITY_context menu|context menu]]
- [[_COMMUNITY_dropdown menu|dropdown menu]]
- [[_COMMUNITY_SettingsModal tsx|SettingsModal tsx]]
- [[_COMMUNITY_build typecheck|build typecheck]]
- [[_COMMUNITY_PostgresDriver connect|PostgresDriver connect]]
- [[_COMMUNITY_ADR Table|ADR Table]]
- [[_COMMUNITY_BackupDialog tsx|BackupDialog tsx]]
- [[_COMMUNITY_ConnectionForm tsx|ConnectionForm tsx]]
- [[_COMMUNITY_mysql coldef|mysql coldef]]
- [[_COMMUNITY_AppSidebar tsx|AppSidebar tsx]]
- [[_COMMUNITY_TemplateManager tsx|TemplateManager tsx]]
- [[_COMMUNITY_dialog tsx|dialog tsx]]
- [[_COMMUNITY_sheet tsx|sheet tsx]]
- [[_COMMUNITY_Connection Install|Connection Install]]
- [[_COMMUNITY_tsconfig web|tsconfig web]]
- [[_COMMUNITY_command tsx|command tsx]]
- [[_COMMUNITY_columnDiff addFkOp|columnDiff addFkOp]]
- [[_COMMUNITY_commands CommandDef|commands CommandDef]]
- [[_COMMUNITY_you Browse|you Browse]]
- [[_COMMUNITY_Backup Restore|Backup Restore]]
- [[_COMMUNITY_ExportDialog tsx|ExportDialog tsx]]
- [[_COMMUNITY_JsonViewerPanel tsx|JsonViewerPanel tsx]]
- [[_COMMUNITY_package json|package json]]
- [[_COMMUNITY_Drop Back|Drop Back]]
- [[_COMMUNITY_popover tsx|popover tsx]]
- [[_COMMUNITY_Reorder Freeze|Reorder Freeze]]
- [[_COMMUNITY_stack frontend|stack frontend]]
- [[_COMMUNITY_visual tree|visual tree]]
- [[_COMMUNITY_filter builder|filter builder]]
- [[_COMMUNITY_Added Fixed|Added Fixed]]
- [[_COMMUNITY_Builder Raw|Builder Raw]]
- [[_COMMUNITY_over electron|over electron]]
- [[_COMMUNITY_captured ddl|captured ddl]]
- [[_COMMUNITY_read only|read only]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_database switching|database switching]]
- [[_COMMUNITY_reordering unified|reordering unified]]
- [[_COMMUNITY_centric persistent|centric persistent]]
- [[_COMMUNITY_resilience auto|resilience auto]]
- [[_COMMUNITY_Configurable scope|Configurable scope]]
- [[_COMMUNITY_columns freeze|columns freeze]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_tsconfig node|tsconfig node]]
- [[_COMMUNITY_export formatRows|export formatRows]]
- [[_COMMUNITY_README Download|README Download]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Cross column|Cross column]]
- [[_COMMUNITY_QueryPlanPanel tsx|QueryPlanPanel tsx]]
- [[_COMMUNITY_enums bareTypeName|enums bareTypeName]]
- [[_COMMUNITY_alert tsx|alert tsx]]
- [[_COMMUNITY_card tsx|card tsx]]
- [[_COMMUNITY_tooltip tsx|tooltip tsx]]
- [[_COMMUNITY_MCP Read|MCP Read]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_TitleBar tsx|TitleBar tsx]]
- [[_COMMUNITY_CONTEXT Core|CONTEXT Core]]
- [[_COMMUNITY_gen icon|gen icon]]
- [[_COMMUNITY_cellDisplay tsx|cellDisplay tsx]]
- [[_COMMUNITY_theme krustHighlight|theme krustHighlight]]
- [[_COMMUNITY_select tsx|select tsx]]
- [[_COMMUNITY_short Fixed|short Fixed]]
- [[_COMMUNITY_SqlDisplay tsx|SqlDisplay tsx]]
- [[_COMMUNITY_mobile useIsMobile|mobile useIsMobile]]
- [[_COMMUNITY_tsconfig json|tsconfig json]]
- [[_COMMUNITY_button tsx|button tsx]]
- [[_COMMUNITY_combobox tsx|combobox tsx]]
- [[_COMMUNITY_short Install|short Install]]
- [[_COMMUNITY_short Install|short Install]]
- [[_COMMUNITY_short Install|short Install]]
- [[_COMMUNITY_short Install|short Install]]
- [[_COMMUNITY_CLAUDE graphify|CLAUDE graphify]]
- [[_COMMUNITY_checkbox tsx|checkbox tsx]]
- [[_COMMUNITY_input tsx|input tsx]]
- [[_COMMUNITY_label tsx|label tsx]]
- [[_COMMUNITY_separator tsx|separator tsx]]
- [[_COMMUNITY_skeleton tsx|skeleton tsx]]
- [[_COMMUNITY_Prettier Config|Prettier Config]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 113|Community 113]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 86 edges
2. `EntityRef` - 49 edges
3. `Glossary` - 35 edges
4. `SqliteDriver` - 31 edges
5. `MysqlDriver` - 24 edges
6. `Filter` - 21 edges
7. `Changelog` - 21 edges
8. `Krust Studio Handover` - 20 edges
9. `getConnectionConfig()` - 19 edges
10. `useConnections` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Electron + electron-vite + React 19 Stack` --references--> `shadcn/ui`  [INFERRED]
  krust-studio-app/README.md → llm.md
- `Krust Studio README` --conceptually_related_to--> `No Silent Mutations (core principle)`  [INFERRED]
  README.md → CONTEXT.md
- `App()` --calls--> `useConnections`  [INFERRED]
  krust-studio-app/src/renderer/src/App.tsx → krust-studio-app/src/renderer/src/store/connections.ts
- `BackupDialog()` --calls--> `useConnections`  [INFERRED]
  krust-studio-app/src/renderer/src/components/BackupDialog.tsx → krust-studio-app/src/renderer/src/store/connections.ts
- `BackupView()` --calls--> `useConnections`  [INFERRED]
  krust-studio-app/src/renderer/src/components/BackupView.tsx → krust-studio-app/src/renderer/src/store/connections.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **No-Silent-Mutation Capture & Review Flow** — context_no_silent_mutations, context_staged_edits, context_captured_ddl, context_changeset, context_query_history [INFERRED 0.85]
- **Three FK Affordances** — context_fk_navigation, context_fk_expansion, context_fk_picker [EXTRACTED 1.00]
- **MCP Read-only AI Subsystem** — context_mcp_server, context_ai_read_allowlist, context_ai_access_audit [EXTRACTED 1.00]
- **Auto-Update Feature Lifecycle Across Releases** — v1_2_3_auto_update, v1_3_1_manual_update_check, v1_3_3_restart_race_fix, v1_3_3_installer_running_fix [INFERRED 0.85]
- **Staged Schema-Edit Workflow Evolution** — v1_2_3_staged_schema_edits, v1_3_4_staged_edits_on_tab, v1_3_4_fk_column_drop, v1_4_0_relation_drop_toggle [INFERRED 0.75]
- **Inline Filter Two-Mode Design** — 0017_builder_mode, 0017_raw_where_mode, 0017_one_way_seed, 0017_statement_separator_guard [EXTRACTED 1.00]

## Communities (112 total, 22 thin omitted)

### Community 0 - "readStore writeStore"
Cohesion: 0.06
Nodes (90): BackupProgress, fkGuards(), pgArrayBody(), quoteIdent(), restorePreview(), restoreRun(), runBackup(), sqlLiteral() (+82 more)

### Community 1 - "tsx ConnectionSwitcher"
Cohesion: 0.21
Nodes (5): DataGrid(), Sel, NewTableEditor(), TYPES, QueryView()

### Community 2 - "electron react"
Cohesion: 0.05
Nodes (41): GitHub Publish (draft release), NSIS Assisted Installer Config, Multi-platform Build Targets (win/mac/linux), devDependencies, electron, electron-builder, @electron-toolkit/eslint-config-prettier, @electron-toolkit/eslint-config-ts (+33 more)

### Community 3 - "tsx CommandPalette"
Cohesion: 0.15
Nodes (10): DIALECTS, Props, LIMITS, StructureEditor(), TYPES, COLORS, dialectFor(), highlighter (+2 more)

### Community 4 - "full Fixed"
Cohesion: 0.06
Nodes (33): Auto-Update via GitHub Releases, MySQL Column Reorder (AFTER), Ctrl/Cmd+P Command Palette, Krust Studio v1.2.3 Release Notes, Staged Reviewable Schema Edits, Custom Frameless Title Bar, Add column moved to the footer, 🔧 Changed (+25 more)

### Community 5 - "applyChanges driver"
Cohesion: 0.05
Nodes (56): Props, buildCreateTable(), buildDelete(), buildInsert(), buildOrderBy(), buildSearch(), buildUpdate(), buildWhere() (+48 more)

### Community 6 - "codemirror react"
Cohesion: 0.06
Nodes (32): dependencies, class-variance-authority, clsx, cmdk, codemirror, @codemirror/autocomplete, @codemirror/commands, @codemirror/lang-sql (+24 more)

### Community 7 - "utils sidebar"
Cohesion: 0.13
Nodes (27): cn(), Sidebar(), SidebarContent(), SidebarContext, SidebarContextProps, SidebarFooter(), SidebarGroup(), SidebarGroupAction() (+19 more)

### Community 8 - "DbDriver quoteIdent"
Cohesion: 0.16
Nodes (12): ConnectionWorkspace, QueryResult, RowEdit, SaveConnectionInput, SerializedTab, QueryState, SessionStatus, StructureSub (+4 more)

### Community 9 - "update auto"
Cohesion: 0.06
Nodes (44): 9. Auto-update via GitHub Releases, Consequences, Context, Decision, Status, [1.0.0], [1.1.0], [1.2.0] — 2026-06-03 (+36 more)

### Community 10 - "Registry shadcn"
Cohesion: 0.10
Nodes (21): Advanced, Components, Dark Mode, Display & Media, Feedback & Status, Form & Input, Forms, Installation (+13 more)

### Community 11 - "index api"
Cohesion: 0.14
Nodes (14): Window, BackupApi, CaptureInput, ConnectionsApi, DialogApi, HistoryApi, IndexInfo, KrustApi (+6 more)

### Community 12 - "Command History"
Cohesion: 0.14
Nodes (25): ADR-0003 In-app MCP Read-only Structured Tools, AI Access Audit, AI Read Allowlist, Backup, Captured DDL, Changeset, Command Palette, Data Location (+17 more)

### Community 13 - "MysqlDriver alterTable"
Cohesion: 0.20
Nodes (7): DEFAULT_COLS, Editing, Props, TemplateManager(), TYPES, NewColumnSpec, TableTemplate

### Community 14 - "components json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 15 - "connections ConnectionWorkspace"
Cohesion: 0.20
Nodes (9): EMPTY_ADDS, EMPTY_COLS, INDEX_METHODS, METHOD_DESC, MYSQL_HASH_ENGINES, StructureView(), SUB_LABEL, SUBS (+1 more)

### Community 16 - "ADR Krust"
Cohesion: 0.24
Nodes (10): Krust Studio Context (Domain Glossary), Architecture, Built (working), Dev loop, Gaps — prioritized TODO, Krust Studio Handover, How to run the grilling workflow, Krust Studio — Handover (+2 more)

### Community 17 - "readRows FkInlinePicker"
Cohesion: 0.33
Nodes (6): ADR-0010 Optional Database & Switching, ADR-0013 Connection Resilience Auto-retry, Connection, Database Switching, Driver, Session

### Community 18 - "DONE TODO"
Cohesion: 0.12
Nodes (15): Known bugs / sharp edges, Krust Studio — TODO (gap backlog), P0 — next: inline filter builder + raw WHERE — DONE, P0 — v1.3.0: workspace & connection resilience — DONE, P0 — v1.3.4 + v1.4.0: editor/history/backup UX — PLANNED, P0 — v1.5.0: shortcuts, settings & history UX — PLANNED, P0 — v1.6.0: pinned columns — DONE, P1 — high value, mostly cheap (+7 more)

### Community 19 - "context menu"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 20 - "dropdown menu"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 21 - "SettingsModal tsx"
Cohesion: 0.13
Nodes (9): SCOPE_LABELS, SettingsModal(), DEFAULT_PINS, PinPrimaryKey, PinRule, PinSettings, PinSide, SettingsState (+1 more)

### Community 22 - "build typecheck"
Cohesion: 0.13
Nodes (15): scripts, build, build:linux, build:mac, build:unpack, build:win, dev, format (+7 more)

### Community 23 - "PostgresDriver connect"
Cohesion: 0.18
Nodes (7): ConnectionSwitcher(), DRIVER_LABEL, DatabaseSwitcher(), TableTabView(), VIEWS, ViewSwitch(), useConnections

### Community 24 - "ADR Table"
Cohesion: 0.26
Nodes (11): ADR-0002 Captured DDL Changesets, No Squash, ADR-0011 Column Reordering & Unified MySQL MODIFY, Automate for Convenience, Never Force Trust, Filter (Data Grid), FK Picker, No Silent Mutations (core principle), Query Execution, Staged Edits (+3 more)

### Community 25 - "BackupDialog tsx"
Cohesion: 0.20
Nodes (10): BackupDialog(), MODES, PanelTab, Props, BackupView(), MODES, Panel, BackupTableMode (+2 more)

### Community 26 - "ConnectionForm tsx"
Cohesion: 0.33
Nodes (5): 19. In-app update restart: let quitAndInstall own the quit, Consequences, Context, Decision, Status

### Community 27 - "mysql coldef"
Cohesion: 0.16
Nodes (15): ConnectionForm(), DEFAULT_PORTS, emptyValues(), FormValues, Props, schema, toFormValues(), testConnection() (+7 more)

### Community 28 - "AppSidebar tsx"
Cohesion: 0.47
Nodes (5): WorkspaceData, EMPTY, loadWorkspace(), saveWorkspace(), workspacePath()

### Community 29 - "TemplateManager tsx"
Cohesion: 0.18
Nodes (10): ✨ Added, 🔧 Changed, Configurable grid virtualization, 🐛 Fixed, Inline filter builder + raw WHERE (ADR-0017), 📦 Install, Pinnable, reorderable tabs, Pinned columns / freeze panes (ADR-0016) (+2 more)

### Community 30 - "dialog tsx"
Cohesion: 0.18
Nodes (6): DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogTitle()

### Community 31 - "sheet tsx"
Cohesion: 0.18
Nodes (6): SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle()

### Community 32 - "Connection Install"
Cohesion: 0.22
Nodes (7): Connection Resilience (Idle-Drop Auto-Retry), Everything-Is-A-Tab Layout, Also added, 📦 Install, Persistent Per-Connection Workspace, 📦 Install, What's new

### Community 33 - "tsconfig web"
Cohesion: 0.20
Nodes (9): compilerOptions, baseUrl, composite, jsx, paths, extends, include, @/* (+1 more)

### Community 34 - "command tsx"
Cohesion: 0.20
Nodes (8): Command(), CommandDialog(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator(), CommandShortcut()

### Community 35 - "columnDiff addFkOp"
Cohesion: 0.19
Nodes (10): ColumnsEditor(), EditorColumn, FK_ACTIONS, addFkOp(), diff(), diffMoves(), Fk, fkSame() (+2 more)

### Community 36 - "commands CommandDef"
Cohesion: 0.22
Nodes (4): CommandDef, CommandId, COMMANDS, KeybindingScope

### Community 37 - "you Browse"
Cohesion: 0.22
Nodes (9): Browse data, Captured changes → a script for production *(the headline feature)*, Change schema — and see the SQL, Edit safely (nothing writes until you say so), Inspect, Search & navigate, Stay where you left off, What you can do (+1 more)

### Community 38 - "Backup Restore"
Cohesion: 0.19
Nodes (12): Backup & Restore (.sql dump), Backup & Restore as a Tab, ✨ Added, Backup & Restore as a tab, Drop a relation where you look for it, 🐛 Fixed, 📦 Install, Local table templates (+4 more)

### Community 39 - "ExportDialog tsx"
Cohesion: 0.25
Nodes (5): fmtLang(), HistoryView(), tryFormat(), View, HistoryEntry

### Community 40 - "JsonViewerPanel tsx"
Cohesion: 0.12
Nodes (15): CommandPalette(), FilterBar(), Group, OPS, Row, seed(), appendCellCondition(), filtersToWhere() (+7 more)

### Community 41 - "package json"
Cohesion: 0.25
Nodes (7): author, description, homepage, main, name, packageManager, version

### Community 42 - "Drop Back"
Cohesion: 0.22
Nodes (10): Back up & restore, 💾 Backup & Restore, 🔌 Connection resilience, 🪟 Custom title bar, ✨ Highlights, 🗂️ Persistent workspace, 🔗 Reverse foreign keys + walkable graph, Reverse Foreign Keys + Walkable FK Graph (+2 more)

### Community 43 - "popover tsx"
Cohesion: 0.25
Nodes (4): PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle()

### Community 44 - "Reorder Freeze"
Cohesion: 0.33
Nodes (7): DOM Reorder + Sticky Pinning, effectivePins Computation, Freeze Shadow Boundary Marker, Per-Tab Pin Override (Tab.pinnedOverride), ADR-0016: Pinned Columns Freeze and Reorder, SerializedTab filterMode + rawWhere, Virtualized Data Grid (TanStack Virtual)

### Community 45 - "stack frontend"
Cohesion: 0.29
Nodes (6): 4. Frontend stack and UI conventions, Consequences, Context, Decision, Dependency policy, Status

### Community 46 - "visual tree"
Cohesion: 0.29
Nodes (6): ADR-0014 — Query Plan: visual tree over raw table output, Context, Decision, Rejected alternative, Trade-offs accepted, Query Plan

### Community 47 - "filter builder"
Cohesion: 0.29
Nodes (6): 17. Inline filter builder with a raw-WHERE escape hatch, Consequences, Considered alternatives, Context, Decision, Status

### Community 48 - "Added Fixed"
Cohesion: 0.29
Nodes (6): 🚀 Added, 🐛 Fixed, ✨ Highlights, 📦 Install, Krust Studio v1.2.3, ⚠️ Notes

### Community 49 - "Builder Raw"
Cohesion: 0.53
Nodes (6): Structured Builder Filter Mode, FilterBar Component, ADR-0017: Inline Filter Builder with Raw-WHERE Escape Hatch, One-Way Builder-to-Raw Seed, Raw-WHERE Predicate Mode, Statement Separator (;) Guard

### Community 50 - "over electron"
Cohesion: 0.16
Nodes (11): 1. Electron over Tauri for the desktop shell, Consequences, Context, Decision, Status, 8. Query-history capture point and scope, Amendments, Consequences (+3 more)

### Community 51 - "captured ddl"
Cohesion: 0.33
Nodes (5): 2. Capture GUI-generated DDL as raw, unsquashed Changesets, Consequences, Context, Decision, Status

### Community 52 - "read only"
Cohesion: 0.33
Nodes (5): 3. In-app MCP server with structured read-only tools, not SQL, Consequences, Context, Decision, Status

### Community 53 - "Community 53"
Cohesion: 0.40
Nodes (5): 5. Mutation safety: staged edits, transactions, and guards, Consequences, Context, Decision, Status

### Community 54 - "database switching"
Cohesion: 0.33
Nodes (5): 10. Optional database name + multi-database switching, Consequences, Context, Decision, Status

### Community 55 - "reordering unified"
Cohesion: 0.33
Nodes (5): 11. Column reordering & unified MySQL MODIFY, Consequences, Context, Decision, Status

### Community 56 - "centric persistent"
Cohesion: 0.33
Nodes (5): 12. Tab-centric UI with a persistent per-connection workspace, Consequences, Context, Decision, Status

### Community 57 - "resilience auto"
Cohesion: 0.33
Nodes (5): 13. Connection resilience: transparent auto-retry + manual reconnect, Consequences, Context, Decision, Status

### Community 58 - "Configurable scope"
Cohesion: 0.25
Nodes (7): ADR-0012 Tab-centric Persistent Workspace, 15. Configurable, scope-aware keybindings via a command registry, Amendments, Consequences, Context, Decision, Status

### Community 59 - "columns freeze"
Cohesion: 0.33
Nodes (5): 16. Pinned columns: settings-driven freeze with DOM reorder, Consequences, Context, Decision, Status

### Community 60 - "Community 60"
Cohesion: 0.10
Nodes (17): Data, ExportDialog(), Format, Props, Scope, FkInlinePicker(), classify(), FkExpand() (+9 more)

### Community 61 - "tsconfig node"
Cohesion: 0.33
Nodes (5): compilerOptions, composite, types, extends, include

### Community 62 - "export formatRows"
Cohesion: 0.50
Nodes (3): 🐛 Fixed, 📦 Install, What's new

### Community 63 - "README Download"
Cohesion: 0.33
Nodes (5): Download & install, Getting started, Krust Studio, License, Supported databases

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (5): 6. SQLite via Node's built-in `node:sqlite`, not better-sqlite3, Consequences, Context, Decision, Status

### Community 65 - "Community 65"
Cohesion: 0.29
Nodes (6): 18. Editor draft durability — explicit-tabId flush, Consequences, Considered alternatives, Context, Decision, Status

### Community 66 - "Cross column"
Cohesion: 0.40
Nodes (5): 7. Cross-column text search as a separate driver method, Consequences, Context, Decision, Status

### Community 68 - "enums bareTypeName"
Cohesion: 0.70
Nodes (4): bareTypeName(), enumForType(), enumValues(), inlineEnumValues()

### Community 69 - "alert tsx"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 70 - "card tsx"
Cohesion: 0.40
Nodes (4): Card, CardContent, CardHeader, CardTitle

### Community 73 - "Community 73"
Cohesion: 0.29
Nodes (6): [javascript], editor.defaultFormatter, [json], editor.defaultFormatter, [typescript], editor.defaultFormatter

### Community 75 - "CONTEXT Core"
Cohesion: 0.50
Nodes (3): Core principle, Decisions, Krust Studio — Context

### Community 77 - "gen icon"
Cohesion: 0.50
Nodes (3): png1024, src, tmp

### Community 78 - "cellDisplay tsx"
Cohesion: 0.83
Nodes (3): dateSpan(), dateTip(), display()

### Community 79 - "theme krustHighlight"
Cohesion: 0.50
Nodes (3): krustHighlight, krustSyntax, krustTheme

### Community 80 - "select tsx"
Cohesion: 0.50
Nodes (3): SelectContent, SelectItem, SelectTrigger

### Community 81 - "short Fixed"
Cohesion: 0.50
Nodes (3): 🐛 Fixed, 📦 Install, What's new

### Community 108 - "Community 108"
Cohesion: 0.50
Nodes (3): fmtNum(), PlanRow(), QueryPlanPanel()

### Community 111 - "Community 111"
Cohesion: 0.50
Nodes (3): compounds, configurations, version

## Knowledge Gaps
- **423 isolated node(s):** `P0 — next: inline filter builder + raw WHERE — DONE`, `v1.3.4 — fix (data-loss feel) — DONE (merged 69c7791, manually verified)`, `v1.4.0 — features`, `P0 — v1.5.0: shortcuts, settings & history UX — PLANNED`, `P0 — v1.6.0: pinned columns — DONE` (+418 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `utils sidebar` to `context menu`, `dropdown menu`, `SettingsModal tsx`, `dialog tsx`, `sheet tsx`, `command tsx`, `columnDiff addFkOp`, `ExportDialog tsx`, `JsonViewerPanel tsx`, `popover tsx`, `Community 60`, `alert tsx`, `tooltip tsx`, `TitleBar tsx`, `mobile useIsMobile`, `button tsx`, `combobox tsx`, `checkbox tsx`, `input tsx`, `separator tsx`, `skeleton tsx`, `Community 108`, `Community 110`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `EntityRef` connect `applyChanges driver` to `readStore writeStore`, `DbDriver quoteIdent`, `index api`, `Community 110`, `connections ConnectionWorkspace`, `Community 60`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `useConnections` connect `PostgresDriver connect` to `tsx ConnectionSwitcher`, `tsx CommandPalette`, `QueryPlanPanel tsx`, `ExportDialog tsx`, `JsonViewerPanel tsx`, `DbDriver quoteIdent`, `MCP Read`, `MysqlDriver alterTable`, `Community 110`, `connections ConnectionWorkspace`, `BackupDialog tsx`, `mysql coldef`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 85 inferred relationships involving `cn()` (e.g. with `AppSidebar()` and `ColumnsEditor()`) actually correct?**
  _`cn()` has 85 INFERRED edges - model-reasoned connections that need verification._
- **What connects `P0 — next: inline filter builder + raw WHERE — DONE`, `v1.3.4 — fix (data-loss feel) — DONE (merged 69c7791, manually verified)`, `v1.4.0 — features` to the rest of the system?**
  _423 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `readStore writeStore` be split into smaller, more focused modules?**
  _Cohesion score 0.05797979797979798 - nodes in this community are weakly interconnected._
- **Should `electron react` be split into smaller, more focused modules?**
  _Cohesion score 0.048625792811839326 - nodes in this community are weakly interconnected._