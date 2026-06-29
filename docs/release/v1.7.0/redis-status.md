# Redis — Implementation Status (1.7.0)

Autonomous build pass on branch `feat/v1.7.0`, 2026-06-29. Implements the Redis
key browser + staged editor per [redis-build-plan.md](redis-build-plan.md) and
the 16 locked decisions. **Typecheck green, full `pnpm build` succeeds, existing
tests pass.** Not yet exercised against a live Redis server — runtime behaviour
needs verification (see below).

## Done (compiles + builds)

### Capability refactor (ADR-0020)
- `DbDriver` split into `DriverCore` + `SqlCapable` / `TabularCapable` /
  `SchemaMutCapable` / `TabularMutCapable`; `DbDriver` = their intersection
  (relational drivers unchanged). `KeyValueCapable` + `RedisDriver` added.
- Static `DriverCapabilities` map (`shared/capabilities.ts`).
- Sessions map is now `DriverCore`; relational paths cast via `rel()`.

### Backend
- `RedisDriver` (`main/db/drivers/redis.ts`): node-redis v6, Krust-owned
  reconnect (`reconnectStrategy:false`, `disableOfflineQueue:true`),
  `dbInfo`/`scanKeys`/`keyMeta`/`readValue`/`commit`/`renameKey`/`deleteKey`.
- `redis:*` IPC + preload; read-only enforced in main on every mutation.
- Capture into a dedicated **`redis_mutation`** history stream, grouped by
  `commit_group` (new column + migration). Destructive flags on DEL/UNLINK/
  expiry-past.
- `test-connection` Redis arm (auth + PING + version probe).
- `isConnectionFatal` recognises node-redis socket-closed errors.

### Renderer
- `RedisSidebar`: flat SCAN-paged key list, logical-db switcher, MATCH glob
  (Enter), "Load more", loaded-count. Mounted from `AppSidebar` when the
  connection is Redis; connect flow skips the relational schema fetch.
- Redis Key tab (`kind:'redis-key'`, identity on the fat Tab; value/staged
  state in the new `useRedis` store). `RedisKeyView` with per-type bodies:
  string pane, hash/set/zset member grid, list index editor, append-only stream.
- Staged edits → `buildCommands` → command preview + Commit (WATCH/MULTI/EXEC).
  Conflict banner with Reload + compatibility-gated Force (typed confirm).
  Staged expiry (PEXPIRE/PERSIST in the same commit). Separate guarded rename
  (RENAMENX) + delete (UNLINK, typed key-name confirm).
- ConnectionForm: Redis driver option + logical-db field + 6379 default port.

## Needs live-Redis verification (next session, with a server)

Everything runtime. Priority smoke test: create a Redis connection → connect →
sidebar lists keys → open one of each type → read renders → stage an edit →
commit → reload shows the change → history shows the `redis_mutation` entry.
Then: WATCH conflict (edit the key externally mid-stage), TTL preserve, delete,
rename, large-string gate, ACL-denied `CONFIG GET databases`.

## Functional gaps 1–5 — DONE (second pass; compiles + builds, not live-tested)

1. **Binary string values** — `readValue` reads strings via a buffer-typed view
   of the same connection (`withTypeMapping({ BLOB_STRING: Buffer })`), computes a
   UTF-8 validity flag, and returns both `text` and raw `base64`. Binary writes
   flow through a `string-set-bin` staged edit → `SET key <bytes> KEEPTTL` with a
   `{ b64 }` `RedisArg` (Buffer at the wire). **Binary key NAMES** are detected
   during SCAN (buffer view) and flagged `binary:true`; shown with a `bin` badge
   but **open disabled** (a mangled UTF-8 name can't be safely addressed). True
   binary-key read/delete still needs a base64-keyed path (follow-up).
2. **String viewer modes** — text / JSON / hex / base64 toggle in `StringEditor`,
   all derived from `page.base64`. Text/JSON stage as UTF-8 (`string-set`);
   hex/base64 decode to bytes and stage binary (`string-set-bin`). Binary values
   default to the hex view with text/JSON disabled.
3. **Empty-collection → key-deletion confirm** (decision 10) — `commit` runs a
   cardinality check (HLEN/SCARD/ZCARD/LLEN/XLEN) under the WATCH; a removal-only
   batch that would drain the collection returns `{ emptyDelete, cardinality }`
   instead of executing. The view shows a destructive confirm; re-commit carries
   `confirmEmptyDelete`.
4. **Rename overwrite** — `TARGET_EXISTS` surfaces an "Overwrite" confirm in the
   header that re-runs `renameKey(..., overwrite:true)` (`RENAME`).
5. **Key TTL display** — `loadValue` fetches `keyMeta` alongside the value; the
   header shows a formatted remaining TTL and each sidebar row a compact label.

## Known gaps / deliberate simplifications (remaining beta follow-ups)

- **Binary key names read/delete** — flagged + blocked, not yet read/delete-only
  (needs a base64-keyed identity through scan/readValue/deleteKey).
- **Binary collection members** — hash/set/zset/list values are still UTF-8
  decoded; only string values get the binary path.
- **Workspace persistence** — redis-key tabs aren't restored across restart
  (excluded from `SerializedTab`).
- **disposeTab** on close — `useRedis` tab state isn't cleared when a key tab
  closes (minor memory only).
- Stream entry field rendering assumes a flat message map; verify against real
  `XRANGE` shape.

## Commits on feat/v1.7.0 (this pass)

1. `feat(history,sql)` — Schema Mutation rename + global Pretty pref
2. `docs(v1.7.0)` — Redis design + ADR-0020
3. `chore(graphify)` — graph refresh
4. `refactor(driver)` — capability sub-interfaces
5. `feat(redis)` — capability-driver backend
6. `feat(redis)` — key browser + staged editor UI
