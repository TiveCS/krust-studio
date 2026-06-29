// Seeds Redis with fixtures that exercise every path in Krust Studio's Redis key
// browser (ADR-0020): all value types, TTL, the >1MB size gate, binary VALUES,
// binary KEY NAMES, an empty-drainable collection (empty-delete confirm), and a
// MATCH-glob set. db0 is the rich fixture; db1 is light, to test the db switcher.
//
// Run via docker-compose (see ../docker-compose.yml). Standalone:
//   REDIS_URL=redis://:krust@localhost:6379 node seed.mjs

import { createClient } from 'redis'

const url = process.env.REDIS_URL ?? 'redis://:krust@localhost:6379'

const client = createClient({ url })
client.on('error', (e) => console.error('redis error:', e.message))
await client.connect()

async function seedDb0() {
  await client.select(0)
  await client.flushDb()

  // ── strings ───────────────────────────────────────────────────────────────
  // valid UTF-8 incl. a multi-byte emoji → Text view
  await client.set('str:hello', 'Hello, Krust 👋 — UTF-8 with multibyte ✓')
  // JSON → JSON view (pretty-print + validate on stage)
  await client.set(
    'str:json',
    JSON.stringify({ id: 42, name: 'Ada', roles: ['admin', 'dev'], active: true })
  )
  // non-UTF-8 bytes → binary value; Text/JSON disabled, Hex/Base64 only
  await client.set('str:binary', Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x80, 0x7f, 0xc3, 0x28]))
  // >1MB → size gate (must click Reload to load)
  await client.set('str:large', 'a'.repeat(1.5 * 1024 * 1024))
  // TTL → header + sidebar TTL display
  await client.set('str:ttl', 'expires in 1h', { EX: 3600 })

  // ── hash ──────────────────────────────────────────────────────────────────
  await client.hSet('hash:user:1', { name: 'Ada Lovelace', email: 'ada@krust.dev', age: '36' })

  // ── sets ────────────────────────────────────────────────────────────────--
  await client.sAdd('set:tags', ['alpha', 'beta', 'gamma', 'delta'])
  // exactly 2 members → remove both to trigger the empty-delete confirm
  await client.sAdd('set:drainme', ['only', 'two'])

  // ── sorted set ──────────────────────────────────────────────────────────--
  await client.zAdd('zset:scores', [
    { score: 10, value: 'alice' },
    { score: 20, value: 'bob' },
    { score: 30, value: 'carol' }
  ])

  // ── list ────────────────────────────────────────────────────────────────--
  await client.rPush('list:queue', ['job-1', 'job-2', 'job-3', 'job-4', 'job-5'])

  // ── stream (append-only) ────────────────────────────────────────────────--
  await client.xAdd('stream:events', '*', { type: 'login', user: 'ada' })
  await client.xAdd('stream:events', '*', { type: 'click', target: 'commit' })
  await client.xAdd('stream:events', '*', { type: 'logout', user: 'ada' })

  // ── binary KEY NAME → flagged `bin`, open disabled in the sidebar ─────────--
  await client.set(Buffer.from([0x6b, 0x65, 0x79, 0xff, 0xfe]), 'value of a binary-named key')

  // ── MATCH-glob fixtures (test the sidebar MATCH filter, e.g. user:*) ──────--
  for (let i = 1; i <= 5; i++) await client.set(`user:${i}`, `profile #${i}`)
  for (let i = 1; i <= 3; i++) await client.set(`session:${i}`, `token-${i}`, { EX: 1800 })

  console.log('seeded db0')
}

async function seedDb1() {
  await client.select(1)
  await client.flushDb()
  await client.set('db1:marker', 'you are on logical database 1')
  await client.hSet('db1:config', { theme: 'dark', lang: 'en' })
  console.log('seeded db1')
}

await seedDb0()
await seedDb1()

await client.select(0)
await client.quit()
console.log('\nDone. Connect Krust → host localhost, port 6379, password krust (user blank).')
