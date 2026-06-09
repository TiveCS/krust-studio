# Krust Studio — Context

Modern, fast SQL database explorer. Personal daily tool, vibe-coded, open-sourced
on GitHub (use-at-own-risk, no maintenance pledge). Goal: the UX of Beekeeper
Studio without the paywall, and nothing like the clunky Java/Swing tools
(DBeaver, MySQL Workbench).

## Core principle

**No silent mutations.** Every change made through the GUI — schema edits *and*
data edits — surfaces and logs the exact SQL it generated. Schema edits feed
**Captured DDL** / **Changeset** (handed to DevOps); data edits feed the **Data
Mutation** history. This is the central differentiator: Beekeeper performs GUI
mutations but hides the underlying SQL.

## Glossary

### Connection
A saved set of credentials + host + driver that lets Krust talk to one database
server. Distinct from a **Session** (an active, live link using a Connection).

Secrets are encrypted at rest via the OS keychain (Electron `safeStorage` /
Windows DPAPI — key tied to the OS login, no master password). Supports SSH
tunnel and SSL/TLS for reaching/securing prod databases. Connections are
personal (no team-share export in v1). Stored in the configurable data
directory (see **Data Location**).

The **database name is optional** for network drivers (MySQL/MariaDB,
PostgreSQL): leaving it empty connects at the server level so the user can
**browse all databases** and switch between them (see **Database Switching**).
MySQL connects with no default schema (entities empty until one is picked);
PostgreSQL falls back to the `postgres` maintenance database for the initial
connection. SQLite is single-file — its "database" is the file path, not a name.

### Session
The live link to a database opened from a **Connection**. Lifecycle:

- **Connect / Disconnect / Reconnect** are explicit, available from the footer
  connection menu. **Disconnect** closes the live socket and returns to the
  landing state; the connection's open tabs are saved (see **Workspace & Tabs**)
  and restored on reconnect or when you switch back. A status indicator shows
  connected / connecting / disconnected.
- **Resilient to idle drops.** Servers (and serverless DBs like Neon) close idle
  connections. A Session **transparently auto-recovers**: on a connection-fatal
  error it reconnects and retries the operation once, so coming back after lunch
  and clicking a table just works — no manual step. The safety line follows the
  no-silent-mutation principle: **reads and the transactional GUI writes**
  (staged-edit commit, schema commit — a drop rolls them back) auto-retry; a raw
  **SQL-editor** run reconnects but is **not** silently re-run (a bare statement
  may have partially applied — you're told to re-run). When auto-recovery can't
  help (bad creds, server down), the manual **Reconnect** is the fallback.

### Database Switching
The sidebar header is a **database switcher**: it lists every database the
connection can see (`SHOW DATABASES` on MySQL, `pg_database` on Postgres) and
switches the active one. The asymmetry is hidden behind one driver method:
MySQL switches in place (`USE db` on the same connection — all introspection
keys off `DATABASE()`); PostgreSQL **reconnects** bound to the new database
(a pg connection is fixed to one database at connect time). Switching closes the
old database's open tabs and reloads entities/enums. SQLite cannot switch
(single file). Database listing loads lazily/non-blocking after connect, so a
slow server never delays the schema tree.

### Driver
Adapter for one database engine. v1 drivers: MySQL/MariaDB, PostgreSQL, SQLite.
Each Driver knows how to connect, introspect schema, and run queries for its
engine. Interface stays open for later engines (MSSQL, etc.) but those are
deferred.

### Query History
Log of executed statements, split into three distinct streams (never mixed):

- **Data Retrieval** — `SELECT` and other read-only reads.
- **Data Mutation** — `INSERT` / `UPDATE` / `DELETE` (row-level changes).
- **Table Mutation** — DDL: `ALTER` / `CREATE` / `DROP`, index/constraint
  changes (structural changes to tables). See **Captured DDL** — this is the
  most important feature.

Stored in a local SQLite file in the data directory. Each entry records:
statement, timestamp, connection, source (`gui`/`manual`), status
(success/error), affected-row count — not result sets. Retention differs by
stream: **Data Retrieval** auto-trims on a rolling cap (high volume, low
long-term value); **Data Mutation** and **Table Mutation** are never auto-purged
(audit value), pruned only manually.

### Captured DDL
The exact DDL statement Krust generates when the user edits schema through the
**GUI** (add/alter/drop column, create table, etc.) — surfaced and logged, not
hidden. Beekeeper performs these UI edits but does not expose the generated DDL;
Krust must.

Capture covers **all DDL executed through Krust** — both GUI-generated and
hand-typed in the SQL editor — each tagged by source (`gui` / `manual`). Typed
DDL must not escape capture or the forgetting problem returns. (Changes made
*outside* Krust entirely — external drift — are out of scope for v1.)

Workflow: the team makes schema changes on a dev/staging DB via Krust's UI; Krust
captures each generated DDL statement; the accumulated statements are exported as
a script handed to **DevOps**, who runs it manually on **production**. The team
does not use migration tooling (avoided due to data-loss fear) — this captured
script *is* their handoff artifact.

### Changeset
A named (ticket/feature-tied) group of **Captured DDL** statements, kept in the
exact chronological order they were applied — never squashed. Exported as a
single commented `.sql` file (each statement annotated with timestamp + target
object) for the DevOps prod handoff. Raw steps are preserved deliberately:
squashing to a net-result script would be migration-style logic, which the team
avoids for data-loss reasons.

Lifecycle: an **active changeset** can be set, and captured DDL auto-attaches to
it. DDL captured with no active changeset lands in an **Unassigned** inbox (never
lost). The user can always manually move/regroup statements between changesets
and out of the inbox — automation is for convenience, but every assignment is
overridable. Status: Draft → Exported. Persisted in the configurable data
directory, tied to a connection, with name/ticket metadata.

Design value (recurring): *automate for convenience, but never force trust —
the user must be able to inspect and override anything automatic.*

### JSON Viewer
A dedicated side panel that renders the currently selected row as full JSON
(including nested JSON columns like `profile`). Has a key filter (text / regex)
at the top. This is where **FK Expansion** happens.

Built as `JsonViewerPanel`: a resizable right-side panel showing the **currently
selected row** as a custom collapsible JSON tree (nested JSON columns parsed and
expandable), reflecting staged edits live. Key filter (text / regex) at top, copy
row-as-JSON. Opened with Space or right-click → "View row (JSON)". FK fields carry
an expand caret (**FK Expansion**, below).

### FK Expansion
Inside the **JSON Viewer**, a foreign-key field shows an expand caret next to its
value (e.g. `"owner_id": "3" ▼`). Clicking expands the referenced parent row
inline, nested and collapsible — the raw FK value stays, the resolved record
appears beside/under it. Nested FKs expand further on click. Resolves parents
outward. (UX modeled on Beekeeper Studio's JSON Viewer — see reference
screenshot.)

Distinct from **FK Navigation** below: FK Expansion shows the related record
*inline* in the JSON Viewer; FK Navigation opens it in a *new tab*.

### FK Navigation
In the data grid, a foreign-key cell shows a click affordance (↗ icon). Clicking
opens the **related table in a new tab**, auto-filtered to the referenced record
(`WHERE target_pk = value`); the filter is clearable to browse the full table.
Outward direction only (FK → parent) for v1; NULL FK = no navigation.

### Referenced By (Reverse FK)
The inverse of an outbound relation: **which tables reference the current table**
(inbound FKs / dependents). Shown as a **"Referenced by" sub-tab** in the
Structure view (alongside Relations, which is outbound-only), with a count badge;
each row opens the referencing table. Answers "what breaks if I drop/change
this". Sourced per engine — MySQL/Postgres from the catalog
(`KEY_COLUMN_USAGE` / `pg_constraint`); SQLite has no reverse index, so it scans
each table's `pragma_foreign_key_list`.

**Walkable both directions.** Clicking a referenced table in either the Relations
(outbound) or Referenced By (inbound) sub-tab **opens that table in Structure
view on its Relations sub-tab** — letting the user walk the FK graph through the
schema (distinct from **FK Navigation**, which jumps to *data* filtered to a
row).

### FK Picker
While **editing or inserting** a row, a foreign-key cell offers a value picker so
the user sets the FK by choosing a real parent record instead of memorizing keys.

The picker surface is an **inline expansion row injected directly beneath the row
being edited** (not a popover — too cramped — and not a panel docked at the bottom
of the whole grid — too far from the row). A small lookup icon on an editable FK
cell (shown on hover; persistent on empty new-row FK cells) **toggles** the inline
picker for that cell, which becomes the highlighted **write target**. Only **one**
inline picker is open at a time: clicking another FK cell's icon moves it there.

The inline picker is a small but full browser of the parent table: a quick
**cross-column search** box (server-side, case-insensitive substring over all
columns) *and* the full **filter builder** (reused `FilterBar`, per-column
`column op value` AND-joined) — the two are mutually exclusive per query (using one
clears the other). Results are a scroll list of parent rows with **sortable**
column headers and **pagination**; the row matching the cell's current value is
marked (✓ + highlight). A header **"Open full"** button opens the parent table in a
new tab (this is **FK Navigation**) for when the inline view isn't enough.

**Clicking a row** writes that row's referenced-column value into the cell above
and **keeps the picker open** (so the user can confirm the marked row is correct,
or re-pick). It closes on the FK icon toggle / Esc / close button / "Open full", or
when the active tab / page / filter changes.

Manual typing in the cell is always still allowed — the picker is a convenience,
never a constraint (the recurring *automate for convenience, never force trust*
value). Single-column FKs only (v1 FK metadata is single-column).

Distinct from the two other FK affordances: **FK Navigation** opens the parent in
a new tab; **FK Expansion** expands the parent inline in the JSON Viewer; the **FK
Picker** writes a chosen parent key *into* an editable cell.

### Backup
Self-contained export of data and/or schema, produced entirely inside Krust with
no external tooling (no `mysqldump`/`pg_dump` install required). Pairs with an
import path to restore.

Output is an engine-aware SQL dump. Export mode is selectable: schema+data,
schema-only, or data-only. Critically, selection is **per-table** — for each
table the user chooses schema-only, schema+data, or skip. Primary use case:
clone a database's structure with only some tables' data (exclude
sensitive/oversized tables). Large tables stream rather than buffer.

### Restore (Import)
Apply a backup `.sql` dump to a target connection. A **dry-run/preview** parses
the dump (`splitStatements`) and reports what it would do — flagging destructive
statements (`DROP`/`DELETE`/`TRUNCATE`) — without executing. Actual execution
requires explicit (two-step) confirmation, since it runs arbitrary, irreversible
SQL against the target. Stop-on-error toggle. Restore does **not** auto-retry on
a connection drop (a partially-applied write must not silently re-run); only DDL
is captured to history (bulk INSERTs would flood the audit log). Read-only
connections block restore in the main process. (Creating a fresh target database
first — the "duplicate database" use case — and CSV/JSON-into-table import are
deferred.)

### Data Location
Connections, query history, changesets, and the persisted **Workspace** (open
tabs per connection) live in a user-configurable data directory (default
`%AppData%/KrustStudio`, changeable in settings). The installer (NSIS) also lets
the user pick a custom install path. No forced AppData/Program Files lock-in.
(Portable mode deferred.)

### Query Execution
The editor can run the selected text, the statement at the cursor, or the whole
script; multiple statements run sequentially, each result in its own panel. A
running query can be **cancelled** (killed on the server — this must be in every
Driver's contract). SELECTs support an optional auto-`LIMIT` (toggle) with
pagination for more — and when auto-LIMIT is applied, the result panel and
history record the **actual executed SQL** (`… LIMIT N`), not the typed text
(the no-silent-mutation principle, applied to reads). Statement timeout is
deferred.

The editor (CodeMirror 6) provides **schema-aware autocomplete**: table names,
plus columns for the tables referenced in the current statement (`FROM`/`JOIN`,
resolving `AS` aliases). Columns load lazily per referenced table to stay snappy
on schemas with hundreds of tables. Highlighting, identifier quoting, and
keywords are **engine-aware** via the per-driver SQL dialect (backtick on
MySQL/MariaDB, double-quote on Postgres/SQLite) — so autocompleted identifiers
are quoted correctly for the target engine. The editor/results split is
drag-resizable.

### Command Palette
A VSCode-style quick switcher (**Ctrl/⌘+P**) to fuzzy-search every table/view on
the current connection and open it in a tab. Contains-match (startsWith ranked
first), results capped for speed on large schemas. Convenience layer over the
schema tree, not a replacement.

### Workspace & Tabs
**Everything the user works in is a Tab** — data browsers, the SQL editor, a
new-table draft, the **Query History** view, and the **connection editor**. There
is no full-area "screen" that hides the tabs: opening the editor or history adds
or focuses a tab, and closing it drops you back to your data tabs. History and
the connection editor are **singletons per connection** (open focuses the
existing one).

A **Workspace** is a connection's set of open tabs + which one is active. It is
**persisted** so the user lands back where they were after a restart, a
disconnect, or switching connections — **per connection** (each connection
remembers its own tabs). Only *where you were* is saved (entity, view, filters,
sort, SQL text, draft, column widths), **not** the fetched rows/results or staged
edits — content is transient and re-fetched on demand. Stored in the configurable
data directory alongside connections/history (see **Data Location**).

### Schema Browser
The left-sidebar navigation: a lazy-loaded, virtualized, filterable tree
(connection → database → [schema, for Postgres] → entities → columns on expand).
Loads on demand so large schemas don't fetch eagerly. v1 entities: **tables**
(with columns, types, PK/FK, indexes) and **views**. Sections (Tables / Views /
Enums) are **collapsible**. Functions/procedures/triggers/sequences are deferred.

### Enum
A named enumerated type (Postgres `pg_type`/`pg_enum`; MySQL enums are inline in
the column type, not named types — SQLite has none). Enums are surfaced, not just
tolerated: the sidebar **Enums** section lists them and each expands inline to show
its allowed values; the column type picker offers existing enum names (reuse); the
Structure column editor badges enum columns with their values; and the data grid
edits an enum cell via a **combobox of allowed values** (free-text still allowed —
the DB validates on apply, per the Table Editor principle). Loaded once per
connection. (Postgres column types are read via `format_type`, so an enum column
reports its type *name*, which is how these surfaces recognise it.)

### Staged Edits
Grid data edits do not write immediately — they pend (highlighted) until the user
reviews the generated DML and explicitly **Commits**. Commit runs the batch in a
transaction (rolls back on error); Discard drops it. Before commit, an
**affected-row preview** shows how many rows a change will touch. The grid also
distinguishes NULL from empty string (dedicated "set NULL" action). See
[ADR 0005](docs/adr/0005-mutation-safety-model.md).

Pending state is visualized cell-precise (target: at least as good as Beekeeper):

- **Edited cell** — only the changed cell highlights (amber), not the whole row;
  each edited cell highlights independently.
- **Deleted row** — whole row highlights (red), still visible until commit.
- **New row** — inserted-but-uncommitted row highlights (green).

Commit or Discard clears all highlights and the grid reflects DB truth.

### Read-only Connection
A connection flagged read-only (typically prod). Blocks ALL mutation paths — grid
edits, DML, and DDL — enforced in the main process, not just hidden in the UI.
Destructive statements (UPDATE/DELETE without WHERE, DROP/TRUNCATE) require typed
confirmation even on writable connections.

### Table Editor
The GUI surface for editing schema (create table, add/alter/drop column, reorder
columns, indexes, constraints). Every action emits visible **Captured DDL** (see
core principle). Column edits **and index add/drop** are **staged together** (not
applied on click) and committed in one batch. The staged schema draft is held in
the **tab's in-memory state** (like the data grid's **Staged Edits**), so it
**survives switching tabs** within a live session — but, per
[ADR 0012](docs/adr/0012-tab-centric-persistent-workspace.md), it is **not**
persisted to disk: a restart/disconnect starts from a clean slate. Committing
opens a **confirmation
showing the exact DDL** the commit will run, in one transaction (the schema-edit
analogue of the data edit's affected-row preview) — generated server-side without
executing or capturing it, so the user always reviews before anything runs. (On
MySQL each DDL still auto-commits per statement — the review-before-run is the
guarantee; true rollback only on Postgres.) Data-type input is an **editable combobox**: a dropdown of the
current engine's common types for convenience, but free-text is always allowed —
Krust cannot enumerate every engine's full type space, so the database remains
the source of truth and validates the type on apply (no client-side rejection of
unknown types).

**Column Order** is editable, but its reach depends on context. When *creating a
new table*, columns reorder freely on any engine (it is only the order of a
not-yet-run `CREATE`). On an *existing table*, reordering physically moves the
column and is **MySQL/MariaDB-only** — PostgreSQL and SQLite cannot reorder
columns without a full table rebuild, which Krust refuses
([ADR 0002](docs/adr/0002-captured-ddl-changesets-no-squash.md)), so the
affordance is hidden there. See
[ADR 0011](docs/adr/0011-column-reordering-and-unified-mysql-modify.md).

A **column search** filters the column list by name (display-only; the staged
draft and diff stay complete). Reorder is disabled while a filter is active —
drag position is undefined relative to hidden rows.

### Query Plan

**Priority: deferred — not in v1.x, design captured for future build.**

Diagnostic surface that answers "will this query do a full table scan?" before
or after running it. Accessible as **Explain** / **Analyze** buttons in the SQL
editor toolbar; result appears in a dedicated panel below the editor alongside
query results.

**Two modes:**
- **Explain** (default) — runs `EXPLAIN` only. Never executes the query; safe on
  writes and large tables. Shows estimated cost/rows/scan type.
- **Analyze** — runs `EXPLAIN ANALYZE` (or engine equivalent). **Actually
  executes the query** — a warning is shown before use; DML would mutate data.
  Shows real timing + actual row counts vs estimates.

**Output: visual plan tree.** The raw engine output is parsed into a unified
node tree with per-node annotations — not a raw result grid. Each node shows
operation type, scan type, index used, estimated rows, and cost score. Engine
parsing is per-driver:
- **Postgres** — `EXPLAIN (FORMAT JSON)` returns structured JSON; parsed
  directly into tree nodes.
- **MySQL / MariaDB** — `EXPLAIN` returns a tabular result (`type`, `key`,
  `rows`, `Extra` columns); parsed into a flat list of step nodes.
- **SQLite** — `EXPLAIN QUERY PLAN` returns rows (`id`, `parent`, `notused`,
  `detail`); parent/child ids form the tree.

**Scan highlights** — the panel badges / highlights each node:
- **Full-scan warning** (red) — MySQL `type=ALL`, Postgres `Seq Scan`, SQLite
  `SCAN TABLE` with no index. The core signal the user asked for.
- **Index used** (green/gray) — which index was chosen, or "none".
- **Estimated row count** — shown prominently; large + no-index = problem.
- **Cost score** — Postgres total cost; MySQL `rows × filtered`; SQLite
  approximate step count.

**Not captured in Query History.** Explain runs are diagnostic tooling, not user
queries — logging them would pollute the Data Retrieval stream.

See [ADR-0014](docs/adr/0014-query-plan-visual-tree.md) for the trade-off
between visual tree and raw-table output.

### MCP Server
**Priority: post-MVP, nice-to-have — not a main feature.** Design is captured but
build it only after the core tool + Captured-DDL/Changeset workflow are solid.

A read-only Model Context Protocol server hosted **inside** the running Krust app
(local HTTP/SSE on `127.0.0.1`, per-install auth token, user-toggleable). Lets an
AI client (Claude Code / Claude Desktop) inspect schema and sampled data so it can
explain unfamiliar tables — the "joined a project mid-way, what is this table
for?" problem — and cross-reference against code.

Access is governed by the **AI Read Allowlist** and exposed only through fixed
**structured tools** (`list_allowed_tables`, `describe_table`,
`read_rows(table, filter, limit)`). No arbitrary SQL — the allowlist, column
masks, and read-only guarantee are enforced server-side on every call, so the AI
cannot escape scope. Because the server lives in the running app, it reuses the
same live connections and enforcement (no second path to secrets).

### AI Read Allowlist
Default-deny permission set governing what the **MCP Server** may read. Granularity
is per (connection → table); each allowed table is marked schema-only or
schema+data, with per-table **column exclusions** to mask sensitive fields
(password hashes, emails, tokens). Nothing is readable unless explicitly allowed.
The AI can never write — MCP is read-only by construction.

### AI Access Audit
Every MCP read is logged to a dedicated audit stream: timestamp, tool called,
connection, table, row count, and which columns were masked. Never auto-purged.
A live indicator shows when the AI is actively reading and what it is reading.
Same no-silent / control-everything instinct as **Table Mutation** history,
applied to the AI's access.

## Decisions

See `docs/adr/` for architecture decision records.
