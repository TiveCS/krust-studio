# Krust Studio — Context

Modern, fast database explorer. Personal daily tool, vibe-coded, open-sourced
on GitHub (use-at-own-risk, no maintenance pledge). Goal: the UX of Beekeeper
Studio without the paywall, and nothing like the clunky Java/Swing tools
(DBeaver, MySQL Workbench).

## Core principle

**No silent mutations.** Every change made through the GUI surfaces and logs the
exact database command it generated: SQL for relational databases and Redis
commands for Redis. Relational schema edits feed **Captured DDL** / **Changeset**
(handed to DevOps); relational data edits feed the **Data Mutation** history.
This is the central differentiator: comparable database tools perform GUI
mutations but hide the underlying commands.

## Glossary

### Connection
A saved endpoint, credentials, and Driver that lets Krust talk to one data
engine. Distinct from a **Session** (an active, live link using a Connection).

Secrets are encrypted at rest via the OS keychain (Electron `safeStorage` /
Windows DPAPI — key tied to the OS login, no master password). Supports SSL/TLS
for securing network connections. SSH tunneling is deferred.
Connections are personal (no team-share export in v1). Stored in the
configurable data directory (see **Data Location**).

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

Redis uses the same switcher for logical databases (`DB 0`, `DB 1`, etc.).
Switching resets key discovery and closes the previous logical database's key
tabs. Krust discovers the configured database count when permitted; otherwise
the user can select a database index manually.

### Driver
Adapter for one data engine. Relational Drivers expose databases, schema
objects, SQL queries, and relational mutations. A Redis Driver exposes logical
databases, keys, Redis commands, and key mutations. A Driver presents only the
capabilities native to its engine rather than pretending every engine has
tables and SQL.

### Redis Key
A named entry in a Redis logical database, consisting of a value type, value,
and optional expiry. A key opens in a **Redis Key tab**, whose viewer and editor
match the key's native type (string, hash, list, set, sorted set, or stream).
Key edits are staged per tab and preview the exact Redis commands before an
explicit commit. Expiry can be inspected, added, changed, or removed. Redis
support is key-centric; a raw command console is outside the initial scope.

The **commit unit is one key** (one tab): its staged commands run as a single
`WATCH key` + `MULTI`/`EXEC`, captured as one **commit group** in **Redis
Mutation** history. On a concurrency conflict (`EXEC` returns null because the
watched key changed under it), the user is always offered **Reload** (re-read,
rebase the staged edits). **Force overwrite** (replay the staged `MULTI` without
`WATCH`, behind a second typed confirmation) is offered **only when the key still
exists with the same value type** — a benign concurrent edit. If the key was
deleted, expired, or its type changed, Force is **disabled** and only Reload is
offered, because replaying type-specific commands against a changed key risks a
`WRONGTYPE` error or corruption. (The recurring *automate for convenience, never
force a silent overwrite* value, applied to optimistic concurrency.)

The value is read through one polymorphic driver call whose result is
discriminated by type (string / hash page / list range / set page / sorted-set
page / stream range); collection types page lazily (cursor for hash/set/sorted
set, index range for list, id range for stream). Strings over ~1 MB are gated:
the size is shown (`STRLEN`) and explicit load is required. Binary-safe
throughout — a value that is not valid UTF-8 defaults to a hex viewer (base64
available) rather than text; a **binary key name** is escaped on display and, in
the beta, limited to read/delete (key creation and rename accept UTF-8 names
only).

**TTL is preserved across value edits** by construction: string edits use `SET …
KEEPTTL`, native collection ops leave expiry untouched, and only a full-collection
rebuild re-applies the original expiry (`PEXPIRE` from the pre-read `PTTL`) inside
the same `MULTI`/`EXEC`.

Because **Redis cannot store an empty collection**, staged member removals that
would empty a hash/list/set/sorted set are detected at commit (via `SCARD`/
`HLEN`/`LLEN`/`ZCARD`) and surfaced as a **key deletion** — marked Destructive and
routed through the same typed key-name confirmation as an explicit delete, never a
silent vanish.

**Editor interaction** reuses the data grid's **Staged Edits** language. Hash,
set, and sorted-set collections render as a member grid with the same staged
highlighting (amber = edited, red = staged-removed, green = staged-added) and a
per-tab reviewed commit. Value/score changes are in-place single commands; editing
a member's *identity* (hash field name, set member, sorted-set member) has no
Redis primitive, so it is surfaced honestly in the preview as the **remove + add**
pair it really is — never a fake atomic rename. A string edits in a value pane and
writes the **exact bytes** of the active mode (text / hex / base64 / verbatim
JSON); display transforms (JSON pretty-print) are never persisted, mirroring the
SQL **Pretty** toggle. **Lists** are constrained in the beta to in-place edit at a
loaded index, prepend/append, end-pop, and remove-by-value — no arbitrary
insert/delete at an index (index shifting is unsafe under paged loads). **Streams**
are append-only (`XADD`); existing entries are immutable.

One staged value-commit carries all value/member edits **plus an expiry change**
for that key in a single `WATCH`+`MULTI`/`EXEC`; **key rename** and **key
deletion** stay separate guarded actions with their own typed confirmations,
outside the value-commit.
_Avoid_: Table, row, entity

### Routine
A named database program: either a **Stored Procedure** or a **Stored
Function**. Routines are first-class schema objects that can be browsed,
executed, created, and edited; every definition mutation surfaces and captures
its exact DDL. In PostgreSQL, a Routine's identity includes its schema, kind,
name, and input argument types; routines with the same name but different input
signatures are distinct overloads.

A Routine is **not a table** — no rows, no primary key, and (on PG) an overload
signature — so it is modelled by its own driver capability (`RoutineCapable`,
continuing the ADR-0020 capability split) rather than the tabular
`EntityType`/`EntityRef` path, and opens in its own **Routine tab** with a
definition viewer + an **Execute** panel. Only relational engines that support
routines compose the capability (MySQL 8.0+, MariaDB 10.5+, PostgreSQL 12+);
SQLite, Redis, and StarRocks do not.

**Execution.** The Execute panel serves both kinds, engine-aware. Each `IN`/
`INOUT` parameter is a free-text SQL-literal field with an explicit NULL toggle,
plus typed helpers for common scalars (number/bool/date/enum); exotic types
(array, composite, JSON) fall back to a raw literal and the database validates on
run (the *automate for convenience, never force trust* stance). Calls run
**parameter-bound** but preview and history record the **inlined** command (the
no-silent-mutation principle, reusing the DML render path). A **procedure** runs
as `CALL` — treated as potentially mutating, so it requires confirmation, is
blocked on read-only connections, and is captured to **Routine Execution**
history. A **function** runs as `SELECT f(…)` (scalar) or `SELECT * FROM f(…)`
(table-returning) and stays **Data Retrieval** (no confirm). MySQL/MariaDB
`OUT`/`INOUT` values, which a bare `CALL` cannot return, are surfaced by
generating the `SET @p := …; CALL …(@p); SELECT @p` sequence — shown verbatim in
the preview — and rendering the trailing `SELECT` as the OUT panel; PG returns
`INOUT` in its result row directly. Result sets, notices, and OUT values are
displayed but **never persisted** (nor are execution parameter values).

**Authoring** is a raw SQL definition editor (never a form designer). The server
definition is preserved faithfully — automatic formatting never rewrites saved
text; a **Format** action is explicit and user-triggered, and the read-only
viewer's **Pretty** toggle is display-only. An in-progress routine draft is
**durable across restart** keyed by routine identity (aligned with ADR-0018
editor-draft durability, a deliberate exception to ADR-0012's transient-schema-
draft rule), with a captured server-definition **baseline** so external drift is
flagged and never silently overwrites the local draft. Beta scope is split:
**beta.1** ships browse, execute, PG `CREATE OR REPLACE`/`DROP`, and MySQL/
MariaDB **create + drop** — MySQL editing of an *existing* routine is **blocked**
(a "safe replace lands in a later beta" banner) because MySQL has no atomic
replace and the **Routine Recovery Copy** safety net is deferred to **beta.2**.
Drop requires a typed-name confirmation and exact-DDL preview; PG drops target
the exact overload signature; no cascade in the beta.
_Avoid_: Query, script

### Routine Recovery Copy
A temporary local copy of a Routine's original definition, identity, and grants,
created before a non-atomic MySQL/MariaDB replacement. It supports an explicit,
reviewed restoration after partial failure and expires after 30 days. **Deferred
to 1.7.0-beta.2** together with MySQL grant/`DEFINER` preservation and
restoration; beta.1 blocks MySQL edit-of-existing rather than shipping an
unguarded DROP+CREATE.
_Avoid_: Backup, draft

### Query History
Log of executed database commands, split into distinct streams (never mixed):

- **Data Retrieval** — `SELECT` and other read-only reads.
- **Data Mutation** — `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` (row-contents
  changes).
- **Schema Mutation** — DDL: `ALTER` / `CREATE` / `DROP` affecting schema
  objects such as tables, views, indexes, constraints, procedures, and
  functions. See **Captured DDL** — this is the most important feature.
- **Routine Execution** — an explicitly confirmed stored-procedure call. Every
  procedure is treated as potentially mutating because its effects cannot be
  inferred reliably from `CALL`; execution is blocked on read-only connections.
  Function calls made through ordinary `SELECT` remain Data Retrieval.
- **Redis Mutation** — the exact Redis command(s) a **Redis Key** edit generated
  (`SET`, `HSET`, `DEL`, `EXPIRE`, …), shown only on Redis connections. A
  separate stream rather than folded into Data Mutation: it is a distinct command
  class (not SQL DML), mirroring the Routine Execution precedent. Commands from
  one staged commit share a **commit group** (the `MULTI`/`EXEC` batch) and are
  ordered as executed. Redis commands **never** enter a **Changeset** — the
  changeset export is **SQL only** (Schema=DDL, Data=DML) and Redis is a distinct
  non-SQL command class with no `.sql` handoff. `DEL`, `UNLINK`, and setting an
  expiry in the past are flagged **Destructive**.

The dividing rule is **object shape vs row contents**: a statement that changes
the existence or shape of an object is **Schema Mutation**; one that changes only
the rows inside it is **Data Mutation**. So `DROP` (removes the object) is Schema
Mutation, but `TRUNCATE` (keeps the object, empties its rows) is Data Mutation —
filed with `DELETE`, despite being DDL syntactically. This keeps a destructive
data-wipe out of the schema-migration **Changeset** export by default.

Stored in a local SQLite file in the data directory. Each entry records:
statement, timestamp, connection, source (`gui` / `manual` / `ai` — GUI-generated,
hand-typed in the SQL editor, or committed from an **AI Proposal**; history is
filterable by origin, so "what did the agent change last week?" is answerable),
status
(success/error), affected-row count — not result sets — and a **Destructive**
flag (see below). Retention differs by stream: **Data Retrieval** auto-trims on a
rolling cap (high volume, low long-term value); **Data Mutation**, **Schema
Mutation**, and **Redis Mutation** are never auto-purged (audit value), pruned
only manually — by the per-stream **Clear** or by selecting entries and deleting
them (hard delete, confirmed).

### Destructive (history tag)
A cross-cutting flag on a history entry marking a statement that destroys data:
`TRUNCATE`, `DROP`, and `DELETE`/`UPDATE` without a `WHERE`. **`DROP INDEX` is
excluded** — dropping an index is not data loss, so it is never flagged
destructive (this matches the GUI drop-index path, which also treats it as
ordinary DDL). Independent of stream — the flag controls **visibility** (flagged
wherever the entry is shown) and **changeset eligibility**, not classification.

By default a destructive entry is **changeset-eligible** but its auto-attach
behaviour depends on the **Auto-attach destructive DDL** setting (Settings →
History, default **on**):

- **On** (default): destructive **Schema Mutation** DDL (`DROP TABLE`/`DROP VIEW`)
  auto-attaches to the active changeset like any other DDL — so a forgotten drop
  isn't left out of an exported migration. Because the export orders by execution
  time, a manually-added drop also slots into its correct chronological place.
- **Off**: destructive entries are **not** auto-attached (they land in the
  Unassigned inbox) and must be **Moved to changeset** manually — the original
  no-silent-ride behaviour.

`TRUNCATE` and row deletes are **never** auto-attached either way (they are Data
Mutation, and only Schema Mutation auto-attaches). The toggle lives globally in
the history store (`history.db` `meta`), not per-connection. (Distinct from the
**Read-only Connection** typed-confirmation, which gates *execution*; this tag is
about *history/export* handling.)

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
A named (ticket/feature-tied) group of captured statements, kept in the exact
chronological order they were applied — never squashed. Exported as a commented
`.sql` file (each statement annotated with timestamp + target object) for the
DevOps prod handoff. Raw steps are preserved deliberately: squashing to a
net-result script would be migration-style logic, which the team avoids for
data-loss reasons.

**Typed — a changeset has a kind, and kinds never mix in storage:**

- **Schema changeset** — groups **Captured DDL** (`CREATE`/`ALTER`/`DROP` …),
  the original migration-handoff artifact (ADR-0002).
- **Data changeset** — groups **Data Mutation** DML (`INSERT`/`UPDATE`/`DELETE`)
  for the seed/reference-data handoff, the same "hand-applied to prod by DevOps"
  need applied to data. A statement only attaches to a **matching-kind**
  changeset. The separation is enforced by the type, not by user discipline —
  the same "history streams are never mixed" instinct applied to the export
  artifact, and it keeps a destructive data-wipe (**TRUNCATE**, § **Destructive**)
  out of a schema handoff by construction.

**Export-together (the flexible escape hatch).** Storage stays cleanly separated,
but at export the user can select a Schema changeset **and** a Data changeset and
**"Export together"** into a single `.sql` — statements **interleaved in
execution-time order** (a data backfill can legitimately belong *between* two DDL
steps), never schema-block-then-data-block. Separation is the source of truth;
the merged file is a render, not a persistent fused changeset. (The recurring
*separate for convenience, but let the user override non-destructively at the
moment of use* value.)

Lifecycle: there are **two independent, optional active slots** — one active
Schema changeset and one active Data changeset. Setting a slot active is the
explicit opt-in to auto-attach for that kind: captured DDL auto-attaches to the
active Schema changeset, captured DML to the active Data changeset. **With no
active slot of that kind, nothing auto-attaches** — statements stay in their
history stream, addable later (the guard against a Data changeset sweeping up
scratch edits: you only collect data changes once you say so). **Destructive DML
never auto-attaches** even with an active Data changeset — it lands in
**Unassigned** and is promoted manually behind the destructive/typed confirm
(consistent with the schema destructive rule). Statements captured with no active
slot land in an **Unassigned** inbox (never lost); the user can always manually
move/regroup between same-kind changesets and out of the inbox. Status:
Draft → Exported. Persisted in the configurable data directory, tied to a
connection, with kind + name/ticket metadata.

**What a Data changeset collects is per-connection and configurable** (Settings →
the connection): three verb toggles — `INSERT`, `UPDATE`, `DELETE`, all on by
default — plus a separate **"Also collect whole-table wipes"** toggle, off by
default, covering `TRUNCATE` and `DELETE`/`UPDATE` written without a `WHERE`
(i.e. the **Destructive** set). Both gates must pass for a captured statement to
auto-attach; anything that fails still lands in **Unassigned**, addable by hand.
Per-connection rather than global because it tracks the *database's* role (a
reference-data DB collects `UPDATE` only), and the wipes toggle is separate
because an accidental unscoped `DELETE` must not ride silently into a script
DevOps runs on production. The verb gate has no schema-side equivalent —
Schema changesets keep the single global **Auto-attach destructive DDL** toggle.

Design value (recurring): *automate for convenience, but never force trust —
the user must be able to inspect and override anything automatic.*

### Filter (Data Grid)
How the user narrows the rows shown in a data tab. Always-visible in the grid
toolbar — **no hidden/collapsed panel** — with a single live condition row
(column · operator · value) present at rest; a `+` grows additional conditions
and AND/OR groups inline. Has **two modes**, toggled, **one active at a time**:

- **Builder** — the structured per-column condition builder (operators, IN,
  BETWEEN, IS NULL, single-level AND/OR groups). Produces a `Filter[]` compiled
  to a **parameterized** WHERE.
- **Raw** — a hand-written **WHERE predicate only** (not a full statement). Krust
  still wraps it in its own `SELECT … ORDER BY … LIMIT …`, so sort, pagination,
  **Total Row Count**, inline editing, export and FK navigation all keep working
  exactly as in Builder mode. Full arbitrary SQL is **not** here — that is the
  **SQL editor** (see **Query Execution**); Raw is deliberately narrower so the
  grid stays editable (single source table, PK preserved).

Switching **Builder → Raw seeds** the raw box with the SQL the builder generated
(a one-way escape hatch); **Raw → Builder does not parse back** (no SQL parser).
The active mode and raw text are **persisted per tab** (`SerializedTab`) and
re-applied on workspace restore, **fail-soft** — a stale raw predicate (e.g. a
dropped column) surfaces its error but the tab stays open.

Filters **apply explicitly** — on **Apply** or **Enter** in a value/raw field —
never live-on-keystroke (avoids query storms on large tables). A failed raw
predicate shows the engine's error **inline** beneath the filter row while the
**last successful rows remain visible**, so the user iterates editor-style.
Right-click a cell → **Filter by this value** appends to whichever mode is active
(a structured condition in Builder; an engine-quoted ` AND "col" = 'value'` to the
text in Raw). Raw is trusted like the SQL editor (the user's own connection and
data) with one guard: a **statement separator (`;`) is rejected** so a predicate
can't smuggle a second statement. The same builder component is reused, in a
self-contained ephemeral instance, by the **FK Picker**'s parent-table browser.

### Find (Data Grid)
A client-side, in-page text search over the data grid's **currently loaded page**
— a browser-style **Ctrl/⌘+F**. Distinct from **Filter** (which narrows rows via
a server-side WHERE), from the **Command Palette** (schema objects), and from
**History Search** (past statements): Find issues **no SQL** and only sees the
rows already on screen. Case-insensitive substring over each cell's **displayed
text** (staged edits and insert rows included). All matching cells are
highlighted; the current match is emphasised. **Next / Previous** (Enter /
Shift+Enter) set the grid's active cell to each match and scroll it into view, so
the found cell stays selected (ready to edit/copy) after Find closes. Off-page
values are not found — that is what **Filter** is for.
_Avoid_: Filter, Search (unqualified)

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

**Unsaved editor SQL is durable.** The query text you have typed but not yet run
survives switching to another tab and back, and survives an app quit/restart —
not only after **Run**. (Internally the editor keeps the live text in a buffer
for typing speed and flushes it to the persisted **Workspace** on blur, on tab
switch, and idly while you type; see
[ADR-0018](docs/adr/0018-editor-draft-durability.md).)

**Open / save `.sql` files.** A `.sql` file can be opened into a new query tab
(tab bar **Open SQL file…** / tab right-click), and the editor's SQL saved out to
a `.sql` file (**Save .sql** in the editor toolbar). Opening is a **one-shot
import**: the file text seeds the tab and the filename shows as the tab label,
but the tab is **not** linked to the file — editing it never touches the file on
disk, and saving always goes through an explicit save dialog. (A file-backed
editor — live path, Ctrl+S write-back, dirty-vs-file tracking — is deliberately
deferred.)

### Command Palette
A VSCode-style quick switcher (**Ctrl/⌘+P**) to fuzzy-search every table/view on
the current connection and open it in a tab. Contains-match (startsWith ranked
first), results capped for speed on large schemas. Convenience layer over the
schema tree, not a replacement. Searches **schema objects only** — past
statements are found via the History view's own search (below), a deliberately
separate surface.

### History Search
A text filter inside the **Query History** view for finding a past statement by
its content. Scoped to the entries currently shown (active stream / changeset),
filters their statement text client-side (entries are already capped, so it's
instant). Distinct from the **Command Palette**, which only finds schema objects.

### Settings
A global, app-wide configuration surface — a large VSCode-style **modal** (not a
tab, not per-connection) reachable from the title bar even with no connection
open. Persisted to a `settings.json` in the data directory, alongside
connections/history (main-process store + IPC). First home of user
**Keybindings** and **Pin Rules**; future app-level preferences live here too.

### Pinned Column
A Data Grid column frozen to the left or right edge during horizontal scroll —
the "freeze panes" feature. Pinned columns stay visible while scrollable columns
pass behind them.

Pinning is driven by global **Pin Rules** in **Settings** — never per-tab
persistence. Two rule types:

- **Name rules** — an exact column-name list, each entry tagged `left` or
  `right`. Applied to every table opened; columns matching a rule are frozen to
  the specified side.
- **PK rule** — a toggle that auto-pins primary key column(s) (from
  `RowsResult.primaryKey`), with a configurable `left` / `right` side.

At render time the Data Grid reorders columns into three groups: left-pinned
(original relative order) → scrollable → right-pinned. A **freeze shadow** marks
the boundary between the pinned and scrollable zones. See
[ADR-0016](docs/adr/0016-pinned-columns-freeze-and-reorder.md).

**Per-tab override**: right-clicking a column header exposes "Unpin" / "Re-pin"
to suppress or restore a settings-driven pin for the current tab session only
(not persisted).

### Keybinding / Command
Krust's actions are exposed as named **Commands** (e.g. `table.commit`,
`table.addRow`, `table.refresh`, `table.toggleView`, `filter.add`,
`sidebar.toggle`), each with a default **Keybinding** the user can rebind in
**Settings**. Bindings are **scope-aware** (VSCode `when`-clause style): a command
declares the context it fires in — `global`, `table-tab`, `data-view`,
`structure-view`, `query-view` — so one physical key can mean different things in
different contexts, and two commands conflict only when they share a key *and* an
overlapping scope. A central keydown dispatcher resolves the active command from
the focused tab/view. Defaults: **Ctrl/⌘+S** commit (review staged changes for the
active tab — DDL preview in structure-view, affected-row dialog in data-view),
**Ctrl/⌘+N** add row (data-view), **F5** refresh the active table tab,
**Ctrl/⌘+G** toggle data ⇄ structure, **Ctrl/⌘+Shift+F** add filter (expand the
FilterBar, append a focused empty condition), **Ctrl/⌘+P** Command Palette,
**Ctrl/⌘+B** toggle the sidebar. The sidebar toggle (`sidebar.toggle`) is routed
through the same registry — the shadcn sidebar primitive reads its key from the
keybindings store rather than hard-coding it — so it is rebindable like any other
command. `table.toggleView` moved off `Ctrl/⌘+B` (which the shadcn sidebar
already owned) onto `Ctrl/⌘+G` to remove the collision.

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

Saved SQL text includes **unrun** editor text, captured even on an abrupt quit
(see **Query Execution** and [ADR-0018](docs/adr/0018-editor-draft-durability.md)).

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

**Table rename is a separate, immediate action — outside the staged commit.**
Renaming the table is not a column/index op and never joins the staged batch:
it applies at once through its own guarded dialog (reachable from both the
sidebar and the Structure footer), surfaces its exact DDL in a hideable
server-generated preview *before* it runs, and is captured to **Schema Mutation**
history like any other DDL. It is **disabled while column/index edits are
pending**, so the immediate rename never overlaps a not-yet-committed batch built
against the old name. This mirrors the **Redis Key** decision where key rename
stays a separate guarded action outside the value-commit — the same "identity
changes are their own reviewed step" instinct, applied to tables.

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

### Table Template
A reusable, **local-only** named set of columns (name/type/nullable/pk/default/fk)
used to scaffold the repetitive parts of a table — typically an `id` plus an
audit block (`CreatedDate` / `CreatedBy` / `LastModifiedBy` / `RecordStatus`). A
template is **never applied to the database directly**: it only pre-fills a draft
or stages column-adds, which the user still reviews and commits through the
normal **Table Editor** path (the no-silent-mutation stance — a template is
scaffolding, not a migration).

A template is **engine-locked**: tagged with the engine it was captured on and
offered only on connections of that engine, so MySQL `VARCHAR(255)` never lands
on a Postgres table. Templates are **global** (not tied to one connection),
stored in a `templates.json` in the configurable **Data Location** alongside
connections — reusable across every same-engine project.

Authored by capturing columns from an existing table's Structure view or from a
new-table draft, and edited in a **Templates** manager (sidebar toolbar dialog).
Applied two ways: into a **new-table draft** (seeds its columns, primary key
kept), or as **"Insert template columns"** into an existing table's Columns
editor — landing as staged column-adds with the primary-key flag stripped and
name-collisions skipped (the table already has its PK and those columns), so a
reused audit block never produces invalid DDL.

### Query Plan

**Status: built (2026-06-14).** Explain/Analyze buttons in the SQL editor
toolbar → `QueryPlanPanel` (visual tree + Raw toggle). See ADR-0014.

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
A Model Context Protocol server hosted **inside** the running Krust app (local
HTTP/SSE on `127.0.0.1`, per-install auth token, user-toggleable). Lets an AI
client inspect schema and sampled data — the "joined a project mid-way, what is
this table for?" problem — and, via **Schema Sync**, propose additive schema fixes.

**Client-agnostic.** The tools are plain MCP (no Claude-only features), so any
spec-compliant agent works — Claude Code, Codex CLI, Cursor, etc. HTTP-native
clients connect to the endpoint directly; stdio-first clients spawn the **MCP
stdio bridge** (a dumb pipe holding no secrets, forwarding stdio ↔ the local
endpoint with the token). The in-app server stays the single enforcement point;
the token pastes into each client's own config. The **AI Access Audit** records
the calling client's identity (from the MCP `initialize` handshake) so it's clear
*which* agent read or proposed.

Exposed only through fixed **structured tools**, never arbitrary SQL. Five tool
families, five separate gates:
- **Data reads** (`list_allowed_tables`, `describe_table`,
  `read_rows(table, filter, orderBy, columns, limit)`) — governed by the **AI
  Read Allowlist**. `read_rows` takes **structured** `filter`/`orderBy`/`columns`
  (Krust's `Filter[]`/`Sort[]`, compiled to a parameterized WHERE via the same
  `buildWhereClause` the grid uses) — **never raw SQL/WHERE**: a raw predicate
  could probe a masked column one boolean at a time (oracle leak), so any column
  named in `filter`/`orderBy`/`columns` must itself be allowlisted **and
  unmasked**, else the call is rejected at the tool boundary.
- **Schema introspection** (`introspect_schema`) — governed by the separate
  **Schema Introspection** scope (see below).
- **Schema-op proposal** (`propose_schema_ops`) — stages **Proposed Schema Ops**
  into **AI Proposals**; **never commits to the DB**.
- **Data-change proposal** (`propose_data_changes`) — stages a **Proposed Data
  Change** into **AI Proposals**; **never commits to the DB**. Governed by the
  **AI Write Allowlist** (per-table, per-verb).
- **History reads** (`read_history`, `list_changesets`) — governed by the separate
  **History Read** scope, with a per-connection **redact list** (see below).

The server lives in the running app, so it reuses the same live connections and
enforcement (no second path to secrets). **The AI can never write to the
database**: MCP can only *propose* staged schema ops and row changes — a human
reviews and commits them through the normal path.

### AI Read Allowlist
Default-deny permission set governing what **data** the **MCP Server** may read.
Granularity is per (connection → table); each allowed table is marked schema-only
or schema+data, with per-table **column exclusions** to mask sensitive fields
(password hashes, emails, tokens). Nothing is readable unless explicitly allowed.
This gate covers row **data** only — whole-schema *structure* visibility is the
separate **Schema Introspection** scope, and the ability to *change* rows is the
separate **AI Write Allowlist**.

### AI Write Allowlist
Default-deny permission set governing which rows the **MCP Server** may propose
changes to. Granularity is per (connection → table → **verb**): a table may allow
`insert`, `update`, `delete` in any combination, or none. Absent = no writes.
Sits alongside the **AI Read Allowlist** on the same per-table entry, behind its
own connection-level master switch — a table can be readable and not writable,
but never writable without being readable (an agent must see a row before it may
change it).

Two boundary rules, enforced at the tool call, not in the UI:

- **Predicate columns follow the read rules.** A proposed change targets rows by
  a structured `Filter[]` predicate (the same shape `read_rows` takes — never raw
  SQL). Every column named in the predicate must itself be allowlisted **and
  unmasked**, exactly as for reads.
- **Unscoped writes are rejected.** The predicate is required and must be
  non-empty, and `TRUNCATE` is not exposed at all — so a **Destructive** DML
  statement cannot even be *staged* over MCP. Whole-table operations stay in the
  GUI, where the typed confirmation already lives.

Deliberately **default-deny like the read side** — a denylist ("everything except
X") was considered and rejected: one forgotten exception is a silent grant.

### Schema Introspection
A connection-level scope (one on/off toggle, **distinct** from the per-table
**AI Read Allowlist**) that lets the MCP server enumerate and describe the whole
connection's **structure** — tables, columns, types, PK/FK, indexes — with **no
row data**. Kept separate because structure is not the sensitive asset (data is),
and a per-table default-deny allowlist makes drift detection impossible: you
can't see what's *missing*. Feeds **Schema Sync**.

### History Read
A connection-level scope (one on/off toggle, default off) letting the MCP server
read **Query History** and **Changeset** listings for that connection —
`read_history` (by stream, by changeset, or the Unassigned inbox) and
`list_changesets` (name, kind, status, entry count, which slot is active).

Kept separate from the **AI Read Allowlist** because history is a *side channel
around it*: history stores DML as display-rendered SQL with values inlined
(ADR-0008), so a raw history read would return
`UPDATE users SET password_hash='…'` — bypassing both the allowlist and its
column masks.

Within a granted connection history is **open by default** (the change story is
only useful whole), narrowed by a per-connection **redact list** of table globs.
A redacted table's entries still appear with full metadata — timestamp, stream,
verb, table, affected count, **Destructive** flag, changeset — but the
**statement text is withheld**. The agent learns *that* something changed and
*when*, never *what to*. Entries with no recorded table are metadata-only too.

Hiding entries outright was rejected: silent gaps make an agent reason from an
incomplete timeline. Scrubbing literals out of the statement text was also
rejected — it needs a per-dialect SQL parser, the parser-as-security-boundary
that ADR-0003 refused.

### AI Proposals
The tab where staged, **un-committed** AI output waits for human review — the
single surface for everything an agent has drafted but nothing it has applied.
Nothing listed here has touched the database.

Holds two proposal types, never mixed within one proposal:

- **Schema proposal** — **Proposed Schema Ops** from a **Schema Sync** run.
- **Data proposal** — a **Proposed Data Change** from `propose_data_changes`.

Each proposal binds to exactly **one Changeset of its own kind** (a Schema
proposal to a Schema changeset, a Data proposal to a Data changeset), so the
typed-changeset invariant holds unchanged. An agent wanting both (add a column,
then backfill it) sends two proposals.

Proposals are **persisted** (in `history.db`, beside changesets), so they survive
quit, crash, and an unattended auto-update restart (ADR-0019) — the point is that
an agent works while the human is elsewhere.

Each carries its origin (which agent, when), a per-item checkbox, the rendered
SQL preview, and **Commit / Export / Dismiss**. On a **read-only** connection
Commit is blocked but **Export still works** — the "verify Prod drift + script
the handoff" case, applied to data as well as schema.

_Avoid_: "Schema Sync tab" — Schema Sync is the **workflow**; AI Proposals is the
**surface** its output lands on.

### Proposed Data Change
A staged set of row changes an AI hands Krust through `propose_data_changes` —
the data-side counterpart to a **Proposed Schema Op**. Structured and
engine-agnostic: an `insert` carries column→value maps; an `update` carries a
structured `Filter[]` predicate plus the columns to set; a `delete` carries a
predicate. Krust renders the dialect-correct DML.

**Rows are targeted by predicate, not primary key.** Deliberate: the handoff
artifact is applied to a *different database* than the one it was drafted
against, where surrogate keys do not correspond — only a business identifier
(`WHERE code = 'ACME'`) survives the trip. It also keeps the exported `.sql`
readable: one set-based `UPDATE`, not eight hundred key-scoped ones.

Consequences the review surface must carry: the affected-row count is shown at
review and **re-counted at commit** (ADR-0005), because the matching row set can
drift between drafting and approval.

### Schema Sync
A workflow (whose output lands in **AI Proposals**) that reconciles a live DB against an
external code model — the motivating case is **.NET EF Core entity classes** whose
tables are applied by hand (no migration tooling, per ADR-0002). The AI reads the
entities (in the repo, via its own file access) and the DB **structure** (via
**Schema Introspection**), computes the drift and the SQL-type mapping **itself**,
and hands Krust **Proposed Schema Ops**. Krust never parses .NET/EF and stores no
"expected schema" — each run is **stateless**, recomputed from current code +
current DB.

- **Target.** The AI picks the connection conversationally (`list_connections`,
  names/engines only) — there is no stored code↔connection binding.
- **Run surface.** Its **AI Proposals** entry lists proposed **additive** ops (dependency-ordered —
  parent tables before FK-bearing children — each with its generated DDL preview)
  plus a **report-only** section (§ **Proposed Schema Op**). Each report-only
  finding shows the code-inferred spec vs the live DB spec side-by-side and can be
  **promoted** to an op behind the existing destructive/typed confirm (ADR-0005);
  a promoted drop lands in the **Unassigned** inbox (ADR-0002 destructive rule).
- **Changeset.** A run is bound to one **Changeset** (the active one, or a named
  new one — usually the ticket). Both the draft export and any committed DDL use
  that changeset, so "this sync" stays self-contained.
- **Export.** The `.sql` handoff exports from the panel's **draft** ops — it does
  not require execution, so it works on a **read-only** connection.
- **Commit.** On a writable connection, Commit first **re-introspects** and
  reconciles against the live DB: ops already satisfied are **skipped**
  (idempotent — no duplicate-column error), ops that now conflict are pulled out
  and **re-reported**, and only genuinely-missing ops run (one transaction where
  the engine allows; MySQL DDL is non-atomic). Executed DDL captures to history as
  normal. On a **read-only** connection the Commit is blocked (main-process guard);
  diff + export still work — the "verify Prod drift + script the fix" handoff case.

_Avoid_: migration, schema diff tool. Krust is not a migration tool (ADR-0002);
Schema Sync is capture-and-handoff, not versioned up/down migrations.

### Proposed Schema Op
A single structured, engine-agnostic schema operation the AI hands Krust through
`propose_schema_ops` — it **reuses Krust's existing `SchemaOp` / `CreateTableSpec`
vocabulary** (`addColumn`, `createTable`, `addIndex`, `addForeignKey`, and the
`alterColumn`/`dropColumn`/`dropIndex`/`dropForeignKey` promotions), keyed by
table. Krust turns it into dialect-correct DDL via its existing generator (Krust
owns dialect, ADR-0002) and stages it into **AI Proposals** for review — it is
**never** raw AI-authored SQL and **never** auto-committed. Only **additive** ops
(`createTable`/`addColumn`/`addIndex`/`addForeignKey`) are auto-staged; type/
nullability changes, drops of DB objects absent from code, and default/constraint
diffs are **report-only** (fuzzy inference + data-loss risk — the human decides,
via promotion).

### MCP Configuration
The MCP surface is configured across three tiers, following the default-deny +
`readOnly` precedents:

- **Global** (Settings → **AI / MCP**): master MCP server on/off, bound port,
  auth token (view/regenerate), `read_rows` default sample size + hard-max
  ceiling, and the **notify-on-proposal** toast (on/off, default on).
- **Per-connection** (default-deny — a fresh connection exposes nothing): five
  independent capability grants — **AI data reads** (→ **AI Read Allowlist**,
  per-table + column masks), **AI data writes** (→ **AI Write Allowlist**,
  per-table + per-verb), **Schema Introspection** (on/off + an exclusion-glob
  list, seeded `__EFMigrationsHistory`, to hide internal tables/schemas from the
  diff), **History Read** (on/off + a redact-glob list), and **accept schema-op
  proposals** (on/off). Persisted with the connection, like `readOnly`.
- **Locked** (never configurable — safety invariants): audit is always on and
  never auto-purged; the AI never auto-commits; no raw SQL; unscoped DML is never
  proposable; `readOnly` enforcement stands. There is deliberately **no
  "auto-approve trusted agent"** setting — it would erode the human-commit
  guarantee.

Panels are laid out **tall, not dense** — full-width stacked sections with room
to read. A per-table, per-verb grant grid is a security posture the user must be
able to take in at a glance; scrolling is cheaper than cramming.

When an agent proposes, the proposal lands in the **AI Proposals** tab with a
badge; a toast (if enabled) names the agent + connection. Arrival never steals
focus.

### AI Access Audit
Every MCP call — data read, **schema introspection**, **history read**,
**schema-op proposal**, and **data-change proposal** — is logged to a dedicated
audit stream: timestamp, tool called, connection, table/op, row count, and which
columns were masked or redacted. Never auto-purged. A live indicator shows when
the AI is actively reading or proposing. Same no-silent / control-everything
instinct as **Schema Mutation** history, applied to the AI's access.

Distinct from **Query History**: the audit records what the AI *asked for*;
history records what actually *ran* against the database. A proposal that is
never committed appears in the audit and never in history.

## Decisions

See `docs/adr/` for architecture decision records.
