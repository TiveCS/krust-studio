# Redis — Build Plan (1.7.0)

Resolved design for the Redis key browser + staged editor, from the
grill-with-docs session on 2026-06-29. Decisions below are locked; this is the
handoff to implementation. See [plan.md](plan.md) for the full 1.7.0 scope,
[ADR-0020](../../adr/0020-capability-based-data-engine-drivers.md) for the driver
architecture, and CONTEXT.md (**Redis Key**, **Driver**, **Query History →
Redis Mutation**) for the domain language.

## Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Driver boundary | **Capability sub-interfaces** — split `DbDriver` into `DriverCore` + optional `SqlCapable` / `TabularCapable` / `SchemaMutCapable` / `TabularMutCapable` / `RoutineCapable` / `KeyValueCapable` |
| 2 | Capability discovery | **Hybrid** — structural caps compile-time per `DriverType` (drive UI mount); connect-time probe refines within an engine (db count, ACL, version, read-only) |
| 3 | Tab model | **Extend the fat `Tab`** — add `kind: 'redis-key'` + `redisKey?: RedisKeyTabState`, mirroring `query?` / `draft?`; `entity` gets a synthetic ref |
| 4 | History | **Dedicated `redis_mutation` stream** + a `commit_group` column on `history_entries`; never changeset-eligible |
| 5 | Value-read API | **One polymorphic `readValue(key, opts)`** → type-discriminated payload; one `redis:readValue` channel |
| 6 | Conflict Force | **Compatibility-gated** — always Reload; Force only when key exists with same type, behind a second typed confirm |
| 7 | TTL | **In-place + `KEEPTTL`**; re-apply `PEXPIRE` (from pre-read `PTTL`) only on full-collection rebuild, inside the same `MULTI` |
| 8 | Client + reconnect | **node-redis (MIT)**, reconnect owned by Krust's Session auto-recovery; offline-queue replay **off** for mutations |
| 9 | Sidebar | **Shared shell + db switcher**, body follows capability — `KeyValueCapable` → flat `KeyList`; `TabularCapable` → entity tree (scales to Mongo) |
| 10 | Empty collection | **Detect at commit** (`SCARD`/`HLEN`/`LLEN`/`ZCARD`) → treat as key deletion: Destructive + typed confirm |
| 11 | Large value / binary | **`STRLEN` gate** strings >1 MB; UTF-8 probe picks text/hex viewer; binary key names escaped, read/delete-only in beta |
| 12 | Edit paradigm | **Reuse Staged Edits** visual language (amber/red/green member grid for collections, value pane for strings, append form for streams) |
| 13 | List edits | **Constrained, no rebuild** — `LSET` at loaded index, `LPUSH`/`RPUSH`, `LPOP`/`RPOP`, `LREM` by value; no arbitrary insert/delete-at-index |
| 14 | Member identity | **Allowed, shown as remove+add** — value/score = in-place single command; identity edit = honest `*REM`+`*ADD`/`HDEL`+`HSET` pair |
| 15 | String write | **Active-mode → exact bytes**, never reformat JSON (pretty-print display-only) |
| 16 | Commit scope | **Value+member+expiry in one MULTI**; key rename + delete are separate guarded typed-confirm actions |

## Editor interaction model (decisions 12–16)

Collections render as a member grid reusing the data grid's **Staged Edits**
highlighting + per-tab reviewed commit. Each affordance maps 1:1 to a command;
the preview shows exactly what runs (no-silent-mutation).

| Type | In-place edit | Add | Remove | Identity edit |
| --- | --- | --- | --- | --- |
| string | value pane → `SET k v KEEPTTL` | — | — | — |
| hash | value → `HSET f v` | `HSET f v` | `HDEL f` | field rename → `HDEL old` + `HSET new v` |
| set | — (no value) | `SADD m` | `SREM m` | member → `SREM old` + `SADD new` |
| zset | score → `ZADD m s` | `ZADD m s` | `ZREM m` | member → `ZREM old` + `ZADD new s` |
| list | index → `LSET i v` | `LPUSH`/`RPUSH` | `LREM cnt v`, `LPOP`/`RPOP` | — (no arbitrary index insert/delete) |
| stream | — (immutable) | `XADD` (auto `*` or explicit id) | — | — |

- A string writes the **exact bytes** of its active mode (text=UTF-8,
  hex/base64=decoded, JSON=verbatim); JSON pretty-print is display-only, never
  persisted. Invalid JSON warns but still saves raw.
- One staged value-commit = all value/member edits **+ an expiry change**
  (`PEXPIRE`/`PERSIST`) in a single `WATCH key` + `MULTI`/`EXEC`. **Rename**
  (`RENAMENX`, 2nd typed confirm) and **delete** (`UNLINK`→`DEL`, typed key-name
  confirm) are separate guarded actions, outside the value-commit.
- Empty-collection detection (decision 10) and compatibility-gated conflict
  (decision 6) apply to the value-commit.

## Capability layer (decision 1 + 2)

Split the current `DbDriver` ([driver.ts:28](../../../krust-studio-app/src/main/db/driver.ts#L28))
into a shared core plus capability sub-interfaces. The three relational drivers
recompose from the existing methods — no behaviour change — landing as a
behaviour-preserving refactor **before** any Redis code.

```ts
interface DriverCore {
  connect(): Promise<void>
  close(): Promise<void>
  listDatabases(): Promise<string[]>   // Redis: logical DBs 0..N
  useDatabase(name: string): Promise<void>
  currentDatabase(): string | null
  cancel(): Promise<void>
}

interface KeyValueCapable {
  scanKeys(opts: { match?: string; cursor: string; count: number }): Promise<KeyPage>
  keyMeta(keys: string[]): Promise<KeyMeta[]>          // pipelined TYPE + PTTL
  readValue(key: string, opts: ReadOpts): Promise<RedisValuePage>
  commit(batch: RedisCommitBatch): Promise<RedisCommitResult>  // WATCH+MULTI/EXEC
}

type RedisValuePage =
  | { type: 'string'; text: string; encoding: 'utf8' | 'hex'; bytes: number; truncated: boolean }
  | { type: 'hash';   fields: { field: string; value: string }[]; cursor: string }
  | { type: 'list';   items: string[]; start: number; end: number; length: number }
  | { type: 'set';    members: string[]; cursor: string }
  | { type: 'zset';   members: { member: string; score: number }[]; cursor: string }
  | { type: 'stream'; entries: { id: string; fields: [string, string][] }[]; lastId: string }
```

Capability descriptor on the connection (renderer reads this to mount UI):

```ts
interface DriverCapabilities {
  sql: boolean; tabular: boolean; schemaMut: boolean
  tabularMut: boolean; routines: boolean; plan: boolean; keys: boolean
}
// structural map (compile-time)
redis    -> { keys: true, ...rest false }
mysql    -> { sql, tabular, schemaMut, tabularMut, routines, plan }
// runtime refinement (Redis, at connect): dbCount, deniedCommands[], serverVersion, effectiveReadOnly
```

## IPC surface

- `session:*` — unchanged (Sql/Tabular/SchemaMut).
- `redis:*` — new namespace for `KeyValueCapable`: `redis:scan`, `redis:keyMeta`,
  `redis:readValue`, `redis:commit`, `redis:dbInfo`.
- Every `redis:*` mutation handler enforces `connection.readOnly` in the main
  process (Read-only Connection rule), independent of the UI.

## Implementation sequence

1. **Capability refactor (behaviour-preserving).** Split `DbDriver`; recompose
   mysql/postgres/sqlite from existing methods; add `DriverCapabilities` (static
   map). Migrate the renderer's engine-name checks to capability checks where
   they gate UI mount. Ship green with zero Redis code.
2. **Redis connection.** `redis` `DriverType`; connection-form fields (host, port
   6379, username, encrypted password, TLS, initial logical DB) + paste-URL
   (`redis://`/`rediss://` → normalized fields, never store the URL). Test
   connection: auth → `PING` → `SELECT` → non-mutating probes → optional version;
   denied `CONFIG GET databases` is a warning. node-redis client; reconnect via
   Session auto-recovery, mutation offline-queue off.
3. **Key discovery + sidebar.** `KeyValueCapable.scanKeys` (incremental `SCAN`,
   200/page, `MATCH` glob, cursor per db+filter, dedup); `keyMeta` pipelines
   `TYPE`+`PTTL`. `KeyList` body mounts when `caps.keys`; reuses shell + db
   switcher; shows loaded-count, not a fabricated total.
4. **Key viewer (read-only first).** `redis-key` tab + `RedisKeyTabState`;
   polymorphic `readValue`; six viewers (string text/JSON/hex/base64, hash/set/
   zset cursor pages, list index range, stream newest-first append-only). `STRLEN`
   gate >1 MB; UTF-8 probe selects viewer; binary key names escaped.
5. **Staged editor + commit.** Stage per key tab; preview exact commands;
   `commit` = `WATCH key` + `MULTI`/`EXEC`. TTL rule (decision 7). Empty-collection
   detection (decision 10). Conflict handling (decision 6: Reload always,
   compatibility-gated Force with second typed confirm). Rename `RENAMENX`
   (overwrite = second typed confirm); delete `UNLINK`→`DEL` (typed key-name
   confirm).
6. **History.** `redis_mutation` stream + `commit_group` migration; capture each
   executed command grouped by commit, ordered as executed; destructive flags
   (`DEL`/`UNLINK`/expiry-past); never enters Changesets; no passive-read logging.
7. **Workspace persistence.** Persist per logical database: key identity + viewer
   mode only — never fetched values or staged edits (Workspace & Tabs rule).

## Test matrix (Redis slice)

- **Unit:** capability composition; `scanKeys` cursor/dedup/loaded-count;
  `readValue` payload per type; command generation per edit; TTL preservation
  (string KEEPTTL, collection in-place, rebuild re-apply); empty-collection →
  delete classification; destructive classification; UTF-8 probe / hex fallback;
  binary key-name escaping; paste-URL normalization.
- **Integration (Redis 6 + latest):** auth (incl. ACL), TLS, `SELECT` db switch,
  SCAN paging + glob, all six type viewers + paging, staged commit success,
  WATCH-conflict (same-type Force, type-changed Reload-only, deleted-key
  Reload-only), TTL round-trips, large + binary values, read-only enforcement in
  main, reconnect-mid-session (no silent mutation replay).
- **Gates (stable):** ACL, TLS, expiry, optimistic concurrency, binary values,
  large collections all verified; no unresolved data-loss/security issue.

## Deviations from plan.md

- History: dedicated **Redis Mutation** stream (plan.md originally said Data
  Mutation) — reconciled in plan.md and CONTEXT.md.
