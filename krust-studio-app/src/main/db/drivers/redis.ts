// `redis` is imported LAZILY inside connect() (like mysql2/pg) so a packaging
// or dependency problem in node-redis surfaces as a connect-time error toast —
// never a fatal main-process crash at startup (session.ts imports this module
// eagerly). Type-only import here is erased and triggers no runtime load.
import type { createClient } from 'redis'
import type {
  ConnectionConfig,
  ReadValueOpts,
  RedisArg,
  RedisCommitBatch,
  RedisCommitResult,
  RedisConflict,
  RedisDbInfo,
  RedisKeyInfo,
  RedisKeyMeta,
  RedisKeyType,
  RedisScanResult,
  RedisValuePage
} from '../../../shared/types'
import type { DriverCore, KeyValueCapable } from '../driver'
import { randomUUID } from 'crypto'

type Client = ReturnType<typeof createClient>

/** Redis verbs that remove a member from a collection (decision 10 empty-delete gate) */
const REMOVAL_VERBS = new Set(['HDEL', 'SREM', 'ZREM', 'LREM', 'LPOP', 'RPOP'])
/** Redis verbs that add/replace a member, so the collection can't end up empty */
const ADD_VERBS = new Set(['HSET', 'SADD', 'ZADD', 'LPUSH', 'RPUSH', 'LSET', 'XADD'])

function isValidUtf8(buf: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return true
  } catch {
    return false
  }
}

/** turn a shared RedisArg into a node-redis arg (Buffer for binary writes) */
function toClientArg(a: RedisArg): string | Buffer {
  return typeof a === 'string' ? a : Buffer.from(a.b64, 'base64')
}

/** strings larger than this require an explicit load (decision 11) */
const LARGE_STRING_BYTES = 1024 * 1024

interface Deps {
  config: ConnectionConfig
  password?: string
}

/**
 * Redis driver (ADR-0020): lifecycle + key/value, no tables/SQL. node-redis
 * client; reconnect is owned by Krust's Session auto-recovery (session.ts
 * withRetry recreates the driver), so the client's own reconnect is OFF and the
 * offline queue is disabled — a mutation never silently replays after a drop.
 */
export class RedisDriver implements DriverCore, KeyValueCapable {
  private client: Client | null = null
  /** same connection, but BLOB_STRING replies come back as Buffer (binary reads) */
  private bufClient: Client | null = null
  private dbIndex: number
  private readonly config: ConnectionConfig
  private readonly password?: string

  constructor({ config, password }: Deps) {
    this.config = config
    this.password = password
    this.dbIndex = config.redisDb ?? 0
  }

  private get c(): Client {
    if (!this.client) throw new Error('Redis client is closed')
    return this.client
  }

  /** buffer-typed view of the same connection (raw bytes for binary keys/values) */
  private get b(): Client {
    if (!this.bufClient) throw new Error('Redis client is closed')
    return this.bufClient
  }

  async connect(): Promise<void> {
    const { createClient, RESP_TYPES } = await import('redis')
    const client = createClient({
      socket: {
        host: this.config.host ?? '127.0.0.1',
        port: this.config.port ?? 6379,
        tls: this.config.ssl ? true : undefined,
        // Krust owns reconnect — don't let the client reconnect on its own.
        reconnectStrategy: false
      },
      username: this.config.user || undefined,
      password: this.password || undefined,
      database: this.dbIndex,
      // Pin RESP2: node-redis v6 defaults to RESP3, which authenticates via a
      // single HELLO handshake. Redis <6 has no HELLO and rejects the whole
      // connect ("ERR unknown command `HELLO`"). RESP2 uses the legacy AUTH
      // command, so we stay compatible with old + new servers (matches ARDM).
      RESP: 2,
      // reject commands while disconnected instead of queueing → no silent
      // replay of a mutation after a reconnect (matches the SQL safety line).
      disableOfflineQueue: true
    })
    // swallow async socket errors so an idle drop doesn't crash main; the next
    // command rejects and Session.withRetry reconnects (recreates this driver).
    client.on('error', () => {})
    await client.connect()
    this.client = client as Client
    // a view over the SAME socket where blob-string replies decode to Buffer
    this.bufClient = client.withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer }) as Client
  }

  async close(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.disconnect()
    } catch {
      // already gone
    }
    this.client = null
    this.bufClient = null
  }

  async cancel(): Promise<void> {
    // Redis has no per-command cancel in this scope; no-op.
  }

  // ── logical databases ────────────────────────────────────────────────────

  async listDatabases(): Promise<string[]> {
    const info = await this.dbInfo()
    const n = info.count ?? 16
    return Array.from({ length: n }, (_, i) => String(i))
  }

  currentDatabase(): string | null {
    return String(this.dbIndex)
  }

  async useDatabase(name: string): Promise<void> {
    const idx = Number(name)
    if (!Number.isInteger(idx) || idx < 0) throw new Error(`Invalid Redis database: ${name}`)
    await this.c.select(idx)
    this.dbIndex = idx
  }

  async dbInfo(): Promise<RedisDbInfo> {
    let count: number | null = null
    try {
      const cfg = (await this.c.configGet('databases')) as Record<string, string>
      const raw = cfg?.databases
      if (raw && Number.isInteger(Number(raw))) count = Number(raw)
    } catch {
      // CONFIG GET denied by ACL — leave count null (manual selection)
    }
    let serverVersion: string | undefined
    try {
      const info = await this.c.info('server')
      const m = /redis_version:([^\r\n]+)/.exec(String(info))
      if (m) serverVersion = m[1].trim()
    } catch {
      // INFO denied — version unknown
    }
    return { current: this.dbIndex, count, serverVersion }
  }

  // ── key discovery ────────────────────────────────────────────────────────

  async scanKeys(match: string, cursor: string, count: number): Promise<RedisScanResult> {
    // scan via the buffer view so non-UTF-8 key names surface as raw bytes and can
    // be flagged (decision: binary keys are read/delete-only, never edited blindly).
    const reply = await this.b.scan(cursor, {
      MATCH: match || '*',
      COUNT: count
    })
    const nextCursor = String(reply.cursor)
    const rawKeys = reply.keys as unknown as (Buffer | string)[]
    // pipeline TYPE + PTTL for the page (node-redis auto-pipelines concurrent cmds)
    const infos: RedisKeyInfo[] = await Promise.all(
      rawKeys.map(async (raw) => {
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))
        const binary = !isValidUtf8(buf)
        // address the key by its raw bytes so binary names aren't mangled
        const [type, ttl] = await Promise.all([this.c.type(buf), this.c.pTTL(buf)])
        return {
          key: buf.toString('utf8'),
          type: normalizeType(type),
          ttl: Number(ttl),
          binary
        }
      })
    )
    return { keys: infos, cursor: nextCursor, loaded: infos.length }
  }

  async keyMeta(key: string): Promise<RedisKeyMeta> {
    const [type, ttl] = await Promise.all([this.c.type(key), this.c.pTTL(key)])
    const t = normalizeType(type)
    let bytes: number | null = null
    let cardinality: number | null = null
    if (t === 'string') bytes = Number(await this.c.strLen(key))
    else cardinality = await this.cardinality(key, t)
    return { key, type: t, ttl: Number(ttl), bytes, cardinality }
  }

  /** element count for a collection type; null for non-collections */
  private async cardinality(key: string, type: RedisKeyType): Promise<number | null> {
    switch (type) {
      case 'hash':
        return Number(await this.c.hLen(key))
      case 'set':
        return Number(await this.c.sCard(key))
      case 'zset':
        return Number(await this.c.zCard(key))
      case 'list':
        return Number(await this.c.lLen(key))
      case 'stream':
        return Number(await this.c.xLen(key))
      default:
        return null
    }
  }

  // ── value read (polymorphic, decision 5) ─────────────────────────────────

  async readValue(key: string, opts: ReadValueOpts): Promise<RedisValuePage> {
    const type = normalizeType(await this.c.type(key))
    const count = opts.count > 0 ? opts.count : 200
    const cursor = opts.cursor ?? '0'
    switch (type) {
      case 'none':
        return { type: 'none' }
      case 'string': {
        const bytes = Number(await this.c.strLen(key))
        if (bytes > LARGE_STRING_BYTES && !opts.forceLoadLarge) {
          return {
            type: 'string',
            text: '',
            base64: '',
            encoding: 'utf8',
            bytes,
            truncated: false,
            binary: false,
            tooLarge: true
          }
        }
        // read raw bytes so non-UTF-8 values are preserved for hex/base64 views
        const raw = (await this.b.get(key)) as unknown as Buffer | string | null
        const buf = raw == null ? Buffer.alloc(0) : Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))
        const binary = !isValidUtf8(buf)
        return {
          type: 'string',
          text: buf.toString('utf8'),
          base64: buf.toString('base64'),
          encoding: binary ? 'binary' : 'utf8',
          bytes: buf.length,
          truncated: false,
          binary
        }
      }
      case 'hash': {
        const r = await this.c.hScan(key, cursor, { COUNT: count })
        return {
          type: 'hash',
          fields: r.entries.map((e) => ({ field: String(e.field), value: String(e.value) })),
          cursor: String(r.cursor)
        }
      }
      case 'set': {
        const r = await this.c.sScan(key, cursor, { COUNT: count })
        return { type: 'set', members: r.members.map((m) => String(m)), cursor: String(r.cursor) }
      }
      case 'zset': {
        const r = await this.c.zScan(key, cursor, { COUNT: count })
        return {
          type: 'zset',
          members: r.members.map((m) => ({ member: String(m.value), score: Number(m.score) })),
          cursor: String(r.cursor)
        }
      }
      case 'list': {
        const length = Number(await this.c.lLen(key))
        const start = opts.start ?? 0
        const end = Math.min(start + count - 1, length - 1)
        const items = end >= start ? await this.c.lRange(key, start, end) : []
        return { type: 'list', items: items.map((i) => String(i)), start, end, length }
      }
      case 'stream': {
        const entries = await this.c.xRevRange(key, '+', '-', { COUNT: count })
        return {
          type: 'stream',
          entries: entries.map((e) => ({
            id: String(e.id),
            fields: Object.entries(e.message).map(([k, v]) => [String(k), String(v)] as [string, string])
          })),
          lastId: entries.length ? String(entries[entries.length - 1].id) : '0-0'
        }
      }
      default:
        // unknown/module type — read-only, no value surfaced
        return { type: 'none' }
    }
  }

  // ── staged value-commit (WATCH+MULTI/EXEC, decisions 6 + 16) ──────────────

  async commit(batch: RedisCommitBatch): Promise<RedisCommitResult> {
    const { key, expectedType, commands, force, confirmEmptyDelete } = batch
    if (commands.length === 0) return { ok: true, commitGroup: randomUUID() }

    if (!force) {
      await this.c.watch(key)
      const currentType = normalizeType(await this.c.type(key))
      const conflict = classifyConflict(expectedType, currentType)
      if (conflict) {
        await this.c.unwatch()
        return { ok: false, conflict }
      }
      // empty-delete gate (decision 10): staged removals that drain a collection
      // make Redis drop the key. Surface that explicitly before committing.
      if (!confirmEmptyDelete && emptiesCollection(commands)) {
        const card = await this.cardinality(key, currentType)
        const removals = commands.filter((cmd) => REMOVAL_VERBS.has(verbOf(cmd))).length
        if (card !== null && card - removals <= 0) {
          await this.c.unwatch()
          return { ok: false, emptyDelete: true, cardinality: card }
        }
      }
    }

    const multi = this.c.multi()
    for (const cmd of commands) multi.addCommand(cmd.args.map(toClientArg))
    const res = await multi.exec()
    if (res === null) {
      // WATCH tripped between read and EXEC — re-evaluate for forceAllowed
      const currentType = normalizeType(await this.c.type(key))
      return { ok: false, conflict: buildConflict(expectedType, currentType) }
    }
    return { ok: true, commitGroup: randomUUID() }
  }

  async renameKey(from: string, to: string, overwrite: boolean): Promise<RedisCommitResult> {
    const exists = (await this.c.exists(to)) === 1
    if (exists && !overwrite) throw new Error('TARGET_EXISTS')
    if (overwrite) await this.c.rename(from, to)
    else await this.c.renameNX(from, to)
    return { ok: true, commitGroup: randomUUID() }
  }

  async deleteKey(key: string): Promise<RedisCommitResult> {
    try {
      await this.c.unlink(key)
    } catch {
      await this.c.del(key)
    }
    return { ok: true, commitGroup: randomUUID() }
  }
}

/** first argv element (the command verb), upper-cased */
function verbOf(cmd: { args: RedisArg[] }): string {
  const a = cmd.args[0]
  return typeof a === 'string' ? a.toUpperCase() : ''
}

/** true when a batch removes members but adds none — i.e. could empty the key */
function emptiesCollection(commands: { args: RedisArg[] }[]): boolean {
  let removes = false
  for (const cmd of commands) {
    const v = verbOf(cmd)
    if (ADD_VERBS.has(v)) return false
    if (REMOVAL_VERBS.has(v)) removes = true
  }
  return removes
}

function normalizeType(t: unknown): RedisKeyType {
  const s = String(t)
  if (s === 'string' || s === 'hash' || s === 'list' || s === 'set' || s === 'zset' || s === 'stream')
    return s
  if (s === 'none') return 'none'
  return 'unknown'
}

/** non-force conflict check after WATCH (decision 6) */
function classifyConflict(expected: RedisKeyType, current: RedisKeyType): RedisConflict | null {
  if (current === expected) return null
  return buildConflict(expected, current)
}

function buildConflict(expected: RedisKeyType, current: RedisKeyType): RedisConflict {
  if (current === 'none') return { kind: 'deleted', currentType: current, forceAllowed: false }
  if (current !== expected) return { kind: 'type-changed', currentType: current, forceAllowed: false }
  // same type but WATCH tripped (a benign concurrent edit) → Force allowed
  return { kind: 'changed', currentType: current, forceAllowed: true }
}
