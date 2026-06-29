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

## Known gaps / deliberate simplifications (beta follow-ups)

1. **Binary values/keys** — node-redis returns decoded UTF-8 strings, so the
   string viewer is `encoding:'utf8'` only; true binary (hex/base64 of non-UTF8
   bytes) needs Buffer type-mapping. The plan's "full binary support" +
   binary-key read/delete-only is **not** yet realised. Flagged in
   [redis.ts](../../../krust-studio-app/src/main/db/drivers/redis.ts).
2. **String viewer modes** — only the plain text pane is built; the
   text/JSON/hex/base64 toggle (decision 11/15 display side) is not. Writes use
   exact bytes of the (utf8) pane.
3. **Empty-collection → key-deletion surfacing** (decision 10) — the cardinality
   check (SCARD/HLEN/LLEN/ZCARD) + explicit "key will be deleted" confirm is
   **not** wired; emptying a collection currently just deletes the key
   server-side without the dedicated warning.
4. **Rename overwrite** — `TARGET_EXISTS` surfaces an error; the second-confirm
   overwrite (`RENAME`) path is not yet offered in the UI.
5. **Workspace persistence** — redis-key tabs are not persisted/restored across
   restart yet (excluded from `SerializedTab`).
6. **Key-list TTL display** — the header has a TTL editor but does not show the
   current remaining TTL (no `keyMeta` fetch in the view yet).
7. **disposeTab** on close — `useRedis` tab state isn't cleared when a key tab
   closes (minor memory only).
8. Stream entry field rendering assumes a flat message map; verify against real
   `XRANGE` shape.

## Commits on feat/v1.7.0 (this pass)

1. `feat(history,sql)` — Schema Mutation rename + global Pretty pref
2. `docs(v1.7.0)` — Redis design + ADR-0020
3. `chore(graphify)` — graph refresh
4. `refactor(driver)` — capability sub-interfaces
5. `feat(redis)` — capability-driver backend
6. `feat(redis)` — key browser + staged editor UI
