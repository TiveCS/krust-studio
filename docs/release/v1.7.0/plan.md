# Krust Studio 1.7.0 Release Plan

Target the first prerelease as `1.7.0-beta.1`. Development happens on
`feat/v1.7.0`, created from updated `main`; stable `1.7.0` merges back only after
the release gates pass. Existing 1.6.x hotfixes continue from `main`.

## Goals

1. Add a native Redis key browser and staged editor.
2. Add stored procedure and function browsing, execution, creation, and editing.
3. Extend 1.6.6 SQL prettification to routines and StarRocks.
4. Expose StarRocks as a distinct Experimental, read/query-focused engine.
5. Replace the assumed-relational driver boundary with capability-based drivers.

Lakekeeper/Trino is deferred for separate design.

## Engine capability matrix

| Capability | MySQL / MariaDB | PostgreSQL | SQLite | Redis | StarRocks |
| --- | --- | --- | --- | --- | --- |
| SQL query editor | Yes | Yes | Yes | No | Yes |
| Tables/views and row viewing | Yes | Yes | Yes | No | Yes |
| Data/schema editing | Existing support | Existing support | Existing support | Key editing | No |
| Procedures/functions | Yes | Yes | No | N/A | No |
| Query plans | Existing support | Existing support | Existing support | N/A | Yes, where compatible |
| SQL prettification | MySQL dialect | PostgreSQL dialect | SQLite dialect | N/A | MySQL dialect |
| Public status | Stable | Stable | Stable | Beta | Experimental |

StarRocks uses MySQL protocol transport but has its own public driver identity,
default port `9030`, navigation model, and capability set. See
[ADR 0020](../../adr/0020-capability-based-data-engine-drivers.md).

## Capability-based drivers

Drivers share connection lifecycle operations but advertise independent
capabilities for SQL, schema objects, tabular data, routines, query plans,
mutations, Redis logical databases, and Redis keys. Product behavior must be
selected from capabilities rather than scattered engine-name checks.

StarRocks may reuse MySQL transport code without inheriting MySQL mutation
features. Redis receives native key APIs rather than implementing fake tables,
rows, or SQL.

## Redis

### Connection and navigation

- Use the MIT-licensed official `redis`/node-redis client.
- Support standalone Redis 6.0+; Redis 5 is best-effort.
- Defer Cluster, Sentinel, Valkey/Dragonfly claims, SSH tunnels, and raw commands.
- Connection fields: host, port (`6379`), username, encrypted password, TLS, and
  initial logical database. A paste-URL action accepts `redis://` and
  `rediss://`, then stores normalized fields rather than the credential-bearing
  URL.
- Test connection through authentication, `PING`, `SELECT`, non-mutating
  capability probes, and optional server-version discovery. Denied
  `CONFIG GET databases` is a warning.
- Switch logical databases through the sidebar. Discover database count when
  permitted; otherwise allow manual indices and initially offer `0–15`.
- Persist workspaces per logical database. Persist key identity and viewer mode,
  never fetched values or staged edits.

### Key discovery

- Use incremental `SCAN`, never `KEYS`.
- Load 200 keys per page with `SCAN MATCH` glob filtering.
- Pipeline type and `PTTL` metadata lookup.
- Show loaded count rather than claiming a filter-specific total.
- Preserve cursor per database/filter and deduplicate repeated scan results.
- No fuzzy/substring search or automatic polling.

### Key viewer/editor

- A key opens in a dedicated Redis Key tab.
- Support strings, hashes, lists, sets, sorted sets, and streams.
- Strings offer text, detected JSON, hex, and base64 handling.
- Hash/set/sorted-set collections use cursor pagination; lists use index ranges;
  streams show newest entries first. Page size is 200.
- Streams are read/append-only. Existing stream entries are immutable.
- Unknown/module types are read-only when display is possible.
- Show size before loading strings larger than 1 MB and require explicit load.
- Fully support binary values. Binary key names are escaped and limited to
  read/delete in the beta; creation and rename use UTF-8 key names.

### Mutations and safety

- Stage edits per key tab and preview exact Redis commands before commit.
- Support key creation, value/member edits, rename, expiry changes, and deletion.
- Empty collection types require initial content because Redis cannot retain
  empty hashes/lists/sets/sorted sets.
- Preserve TTL during value edits. Display remaining TTL and estimated absolute
  expiry; allow duration or absolute-time input and removal of expiry.
- Commit related edits through `WATCH` plus `MULTI`/`EXEC`. External change,
  deletion, expiry, or type change blocks commit and offers Reload or explicit
  Force overwrite.
- Rename uses `RENAMENX`; overwrite requires a second typed confirmation.
- Delete uses `UNLINK`, falling back to `DEL`, with typed key-name confirmation.
- No general undo and no hidden value backups.
- Read-only connections expose browsing only and are enforced in the main
  process.

### History

- Do not log passive browsing reads.
- Capture each exact Redis mutation command in Data Mutation history, grouped by
  commit ID and ordered as executed.
- Redis commands never enter SQL Changesets.
- Mark `DEL`, `UNLINK`, and expiry-to-past operations destructive.

## Procedures and functions

### Scope and identity

- UI label: **Procedures & Functions**. Internal/domain umbrella: **Routine**.
- Support MySQL 8.0+, MariaDB 10.5+, and PostgreSQL 12+.
- Older versions are unsupported or best-effort based on detected version.
- SQLite, Redis, and StarRocks do not expose routines.
- PostgreSQL identity includes schema, kind, name, and input argument types.
  Changing an input signature creates an overload unless the user explicitly
  drops the old signature.

### Browsing and execution

- List Procedures and Functions separately in the sidebar.
- Show definitions, metadata, ownership/security context, grants, parameter
  modes/types, and overload signatures.
- Add routine-aware autocomplete: procedures after `CALL`, functions in
  expressions.
- Generate typed parameter fields. `OUT` fields are display-only; `IN`/`INOUT`
  support explicit NULL and suitable controls for common types.
- Every procedure call is treated as potentially mutating, previews the exact
  call, requires confirmation, and is blocked on read-only connections.
- Capture calls in a separate Routine Execution history stream.
- Function calls through normal `SELECT` retain normal query classification.
- Render multiple result sets, affected-row counts, notices/warnings, and
  `OUT`/`INOUT` values. Do not persist results or execution parameter values.

### Create, edit, replace, and drop

- Use a dedicated raw SQL definition editor with engine-specific new-routine
  templates; do not build a form designer.
- Preserve the server definition faithfully. Automatic formatting never changes
  saved text.
- Preview all generated replacement DDL and capture each executed statement as
  Schema Mutation DDL in the active Changeset.
- PostgreSQL uses `CREATE OR REPLACE` where legal.
- MySQL/MariaDB replacement snapshots definition, identity, security context,
  and grants, then previews `DROP`, `CREATE`, and grant restoration. State
  clearly that replacement is non-atomic.
- Preserve `DEFINER`, owner, SQL/security mode, and grants. Block replacement
  when the connected user cannot preserve required ownership/security context.
- Keep a local Routine Recovery Copy for 30 days before non-atomic replacement
  and provide a reviewed Restore original operation after partial failure.
- Drop requires typed-name confirmation and exact DDL preview. PostgreSQL drops
  target the exact input signature. No cascade option in the beta.
- Routine drafts persist across restart under exact routine identity, but server
  definition changes never overwrite local drafts.

### Validation and script handling

- Run non-blocking local parser/formatter validation before save.
- Use server-side validation only where it can be performed without durable
  mutation. Do not pretend MySQL can safely pre-validate a CREATE.
- The routine editor sends MySQL definitions as one SQL statement; `DELIMITER`
  is not sent to the server.
- General script splitting must understand MySQL compound bodies, pasted
  `DELIMITER` directives, PostgreSQL dollar quoting, nested blocks, comments,
  and strings.
- Changeset export adds MySQL delimiter wrappers only where required by client
  scripts and preserves PostgreSQL dollar quoting.

## SQL prettification

Core query-editor formatting and display-only Structure DDL/review toggles ship
in 1.6.6. Version 1.7 extends that foundation:

- Global Pretty preference defaults off.
- Each object tab can temporarily override the global display preference.
- Routine definition viewers get a display-only Pretty toggle.
- StarRocks uses the MySQL formatter dialect.
- History retains existing formatting.
- Captured statements and Changeset exports are never reformatted automatically.

## StarRocks (Experimental)

- Distinct `starrocks` connection type backed by MySQL protocol transport.
- Default port `9030`.
- Detect StarRocks on existing MySQL connections and offer a non-blocking,
  opt-in conversion that preserves endpoint, credentials, SSL, tabs, and
  history.
- Navigate catalog → database → tables/views, including internal and external
  catalogs. Persist workspaces per catalog/database pair.
- Support metadata, DDL display, SQL queries, and query plans where compatible.
- Disable data editing, schema/routine creation, backup/restore, catalog/database
  administration, external-catalog configuration, and privilege management.
- Label the connection type Experimental and link to a dedicated GitHub issue
  template containing detected version and sanitized capabilities. No telemetry.
- Stable validation requires feedback from at least one real StarRocks user;
  otherwise retain the Experimental label.

## History terminology and persistence

The user-facing **Table Mutation** label becomes **Schema Mutation**, covering
DDL for tables, views, indexes, constraints, procedures, and functions. The
persisted internal `table_mutation` value may remain temporarily for storage
compatibility. **Changeset** and **Captured DDL** remain the canonical terms.

## Beta and branch workflow

- Create `feat/v1.7.0` from updated `main`.
- Selectively integrate relevant work from `feat/starrocks-support`.
- Package prereleases as `1.7.0-beta.1`, `beta.2`, and so on.
- Mark GitHub beta releases as prereleases.
- Stable users remain on stable updates. Beta updates require explicit opt-in.
- Beta users receive newer betas and then stable `1.7.0`.
- Merge into `main` only after stable release gates pass.

## Implementation sequence

1. Create the release branch.
2. Introduce capability-based drivers without changing existing behavior.
3. Extend SQL formatting to new routine and StarRocks surfaces.
4. Add procedures/functions and routine-aware statement splitting.
5. Add the Redis connection, key browser, and staged editor.
6. Integrate StarRocks under its restricted Experimental capability profile.
7. Add beta update-channel behavior and release documentation.
8. Run the full regression matrix and publish `1.7.0-beta.1`.

## Test matrix

- Unit: capabilities, formatter dialect mapping, routine identity and DDL,
  routine-aware splitting, Redis command generation, expiry, binary encoding,
  and destructive classification.
- Integration: MySQL 8.0 and latest; MariaDB 10.5 and latest; PostgreSQL 12 and
  latest; Redis 6 and latest; existing SQLite regression suite.
- Failure paths: read-only enforcement, stale Redis edits, TTL preservation,
  large collections, binary values, MySQL partial routine replacement, grant
  restoration failure, and recovery restore.
- StarRocks: manual smoke testing against a real installation until CI is
  practical.
- Build/typecheck Electron on Windows, macOS, and Linux.

## Stable release gates

- Redis verified with ACL, TLS, expiry, optimistic concurrency, binary values,
  and large collections.
- Routine CRUD, execution, ownership/security preservation, grants, overloads,
  and recovery verified on supported SQL engines.
- Statement splitting regression tests cover compound and dollar-quoted bodies.
- StarRocks tested by a real user or remains explicitly Experimental.
- Existing MySQL/MariaDB, PostgreSQL, and SQLite workflows pass regression tests.
- Beta feedback has no unresolved release-blocking data-loss or security issues.

## Explicit exclusions

- Lakekeeper and Trino
- Redis Cluster and Sentinel
- Redis raw command console
- RedisJSON/module editing
- SSH tunneling
- Valkey/Dragonfly compatibility claims
- StarRocks mutations or administration
- SQLite routines
- Visual routine designer
- Automatic Redis polling

## Beta feedback

Create one `1.7.0-beta.1` GitHub tracking issue with separate sections for
Redis, Procedures & Functions, SQL prettification, StarRocks Experimental, and
existing-driver regressions. Reports should include engine/version, OS,
reproduction steps, and sanitized capabilities/logs. Exclude credentials,
values, and routine bodies by default.
