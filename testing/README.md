# Redis test fixture

Spins up a password-protected Redis and seeds it with one key of every type plus
the edge cases Krust Studio's Redis key browser (ADR-0020) handles. Use it to
smoke-test the feature without a live server.

## Run

```bash
cd testing
docker compose up            # starts Redis, waits for health, runs the seeder
```

The `seeder` exits when done; Redis keeps running. Then in Krust:

- **Driver** Redis · **Host** `localhost` · **Port** `6379`
- **Password** `krust` · **User** blank · **Initial logical database** `0`

Reset / re-seed (resets db0 + db1):

```bash
docker compose run --rm seeder
```

Tear down and wipe:

```bash
docker compose down -v
```

## What gets seeded (db0)

| Key | Exercises |
|-----|-----------|
| `str:hello` | UTF-8 string, multibyte emoji → **Text** view |
| `str:json` | JSON string → **JSON** view (validate on stage) |
| `str:binary` | non-UTF-8 bytes → **binary** value, Text/JSON disabled, **Hex/Base64** only |
| `str:large` | 1.5 MB → **>1MB size gate** (Reload to load) |
| `str:ttl` | string with `EX 3600` → **TTL** in header + sidebar |
| `hash:user:1` | hash member grid (HSET/HDEL) |
| `set:tags` | set member grid (SADD/SREM) |
| `set:drainme` | 2 members → remove both → **empty-delete confirm** |
| `zset:scores` | sorted set, editable scores (ZADD/ZREM) |
| `list:queue` | list index editor (LSET/LPUSH/RPUSH/LREM) |
| `stream:events` | append-only stream (XADD) |
| `key\xff\xfe` | **binary key name** → `bin` badge, open disabled |
| `user:1..5`, `session:1..3` | **MATCH glob** filter (try `user:*`) |

`db1` holds `db1:marker` + `db1:config` to test the **logical-db switcher**.

## Suggested smoke test

1. Connect → sidebar lists keys, types and TTLs show.
2. Open `str:hello`, edit, **Commit** → reload shows the change; **History** has a
   `redis_mutation` entry.
3. Open `str:binary` → defaults to Hex; toggle Base64; edit hex; commit.
4. Open `str:large` → size gate; **Reload** loads it.
5. Open `set:drainme`, stage remove of both members, **Commit** → empty-delete
   confirm appears.
6. Rename a key onto an existing name → **Overwrite** confirm.
7. Switch to **DB 1** → only `db1:*` keys.
8. WATCH conflict: with the tab open, change the key via `redis-cli`, then commit
   → conflict banner with Reload / Force.

```bash
# external edit for the conflict test
docker compose exec redis redis-cli -a krust set str:hello changed-externally
```
