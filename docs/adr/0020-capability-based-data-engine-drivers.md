# 20. Capability-based data-engine drivers

Date: 2026-06-29

## Status

Accepted (design). Drives the 1.7.0 Redis work; StarRocks reuses the same
capability model. No code yet — this records the chosen shape before build.

## Context

Every Driver today implements one fat relational interface, `DbDriver` — ~25
methods all assuming tables, rows, and SQL (`listEntities`, `readRows`,
`alterTable`, `query`, `explainQuery`, …). The renderer and main process branch
on engine name (`driver === 'sqlite'`) wherever behaviour differs, and the IPC
`session:*` channels map roughly 1:1 onto `DbDriver` methods.

Redis fits none of this. It has no tables, rows, or SQL — it has logical
databases and keys. Forcing Redis into `DbDriver` would mean faking tables/rows
(the **Redis Key** glossary entry explicitly forbids this) or leaving most of the
interface throwing `unsupported`. StarRocks is the inverse pressure: it speaks
the MySQL wire protocol and could reuse MySQL transport, but must **not** inherit
MySQL's data/schema-editing features.

## Decision

**Split `DbDriver` into one shared core plus optional capability
sub-interfaces.** A Driver composes the capabilities native to its engine; the
product selects behaviour from advertised capabilities, never from engine-name
checks.

```
DriverCore        connect, close, listDatabases, useDatabase,
                  currentDatabase, cancel            (every engine)
SqlCapable        query, explainQuery
TabularCapable    listEntities, readRows, countRows, searchRows,
                  describeTable, getCreateSql, listReferencingTables, listEnums
SchemaMutCapable  createTable, alterTable, dropEntity, renameTable,
                  truncateTable, createIndex, dropIndex
TabularMutCapable applyChanges                       (grid staged edits)
RoutineCapable    (1.7 procedures/functions)
KeyValueCapable   scanKeys, readValue (polymorphic, type-discriminated),
                  keyMeta, commit (WATCH+MULTI/EXEC), rename, del, expire
```

Engine composition:

| Engine | Capabilities |
| --- | --- |
| MySQL / MariaDB | Sql, Tabular, SchemaMut, TabularMut, Routine, plan |
| PostgreSQL | Sql, Tabular, SchemaMut, TabularMut, Routine, plan |
| SQLite | Sql, Tabular, SchemaMut, TabularMut, plan |
| Redis | KeyValue |
| StarRocks | Sql, Tabular, plan *(no mutation/routine)* |

**Capability discovery is hybrid.** *Structural* capabilities — which
sub-interfaces an engine implements, hence which UI mounts — are a compile-time
map per `DriverType`, known before connect, so the renderer never has to connect
to decide what to render. A connect-time probe only **refines within** an engine:
Redis logical-database count, ACL-denied commands (e.g. `CONFIG GET databases`),
server version, effective read-only. Denied probes degrade gracefully; they never
change which UI mounts.

**IPC stays domain-named, not method-generic.** Existing `session:*` channels
keep serving Sql/Tabular/SchemaMut. KeyValue gets its own `redis:*` namespace
(`redis:scan`, `redis:readValue`, `redis:commit`, …). The renderer chooses which
surface to mount from the structural capability descriptor on the connection
(`caps.keys` → key browser; `caps.tabular` → entity tree), not from `driver ===
'redis'`.

## Alternatives considered

- **One fat `DbDriver` with optional methods, capability-flag gated.** Smallest
  type change, single IPC surface. Rejected: every relational driver accretes
  dead `undefined` key methods and vice-versa; the interface rots into an
  untyped grab-bag and the "no fake tables" guarantee lives only in convention.
- **A separate `RedisDriver` parallel to `DbDriver`, sharing only lifecycle.**
  Fastest path to a working key browser, smallest blast radius. Rejected for the
  durable shape because it re-introduces engine-name branching at every boundary
  and gives StarRocks no clean home (it is partly relational); the capability
  split generalises where a second parallel driver would not.

## Consequences

- Larger up-front refactor: `DbDriver` consumers in `session.ts`, the IPC layer,
  and the renderer sidebar/tab layer must read capabilities instead of assuming a
  full relational driver. This lands **before** any Redis UI is visible.
- Once paid, Redis and StarRocks slot in by composing capabilities, and future
  engines (e.g. Mongo, ClickHouse) declare their own capability set without
  touching relational code.
- The renderer's engine-name checks
  ([several components](../../krust-studio-app/src/renderer/src)) migrate to
  capability checks incrementally; the descriptor is the single source of truth.
- **The sidebar body follows capability, not engine.** The sidebar chrome and
  shared logical-db switcher stay common; the body is chosen by capability —
  `KeyValueCapable` mounts a flat `SCAN`-paged key list, `TabularCapable` mounts
  the entity tree. This is what lets a future hierarchical engine (MongoDB:
  `database → collection → documents`) reuse the existing tree by exposing
  collections as a new `EntityType`, while Redis's flat key space gets its own
  body — both without duplicating sidebar chrome. (Mongo's schemaless documents
  will additionally need a document-viewer capability distinct from the relational
  data grid — out of scope here.)
