import { existsSync } from 'fs'
import type {
  ConnectionConfig,
  TestConnectionResult
} from '../../shared/types'

const CONNECT_TIMEOUT_MS = 8000

async function testMysql(
  config: ConnectionConfig,
  password?: string
): Promise<{ serverVersion: string }> {
  const mysql = await import('mysql2/promise')
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port ?? 3306,
    user: config.user,
    password,
    database: config.database,
    ssl: config.ssl ? {} : undefined,
    connectTimeout: CONNECT_TIMEOUT_MS
  })
  try {
    const [rows] = await conn.query('SELECT VERSION() AS version')
    const version = (rows as Array<{ version: string }>)[0]?.version ?? 'unknown'
    return { serverVersion: version }
  } finally {
    await conn.end()
  }
}

async function testPostgres(
  config: ConnectionConfig,
  password?: string
): Promise<{ serverVersion: string }> {
  const { Client } = await import('pg')
  const client = new Client({
    host: config.host,
    port: config.port ?? 5432,
    user: config.user,
    password,
    // pg requires a db to connect; fall back to the maintenance db when empty
    database: config.database || 'postgres',
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS
  })
  await client.connect()
  try {
    const res = await client.query('SHOW server_version')
    const version = res.rows[0]?.server_version ?? 'unknown'
    return { serverVersion: version }
  } finally {
    await client.end()
  }
}

async function testSqlite(
  config: ConnectionConfig
): Promise<{ serverVersion: string }> {
  const { DatabaseSync } = await import('node:sqlite')
  if (!config.sqlitePath) throw new Error('SQLite file path is required')
  if (!existsSync(config.sqlitePath))
    throw new Error(`SQLite file not found: ${config.sqlitePath}`)
  const db = new DatabaseSync(config.sqlitePath, {
    readOnly: config.readOnly ?? false
  })
  try {
    const row = db.prepare('SELECT sqlite_version() AS version').get() as {
      version: string
    }
    return { serverVersion: row?.version ?? 'unknown' }
  } finally {
    db.close()
  }
}

async function testRedis(
  config: ConnectionConfig,
  password?: string
): Promise<{ serverVersion: string }> {
  const { createClient } = await import('redis')
  const client = createClient({
    socket: {
      host: config.host ?? '127.0.0.1',
      port: config.port ?? 6379,
      tls: config.ssl ? true : undefined,
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: false
    },
    username: config.user || undefined,
    password: password || undefined,
    database: config.redisDb ?? 0,
    // RESP2: node-redis v6 defaults to RESP3 (HELLO handshake), which Redis <6
    // rejects. Legacy AUTH keeps the test compatible with old + new servers.
    RESP: 2
  })
  client.on('error', () => {})
  await client.connect()
  try {
    // auth + PING + SELECT exercised by connect(database); probe version
    await client.ping()
    let serverVersion = 'unknown'
    try {
      const info = await client.info('server')
      const m = /redis_version:([^\r\n]+)/.exec(String(info))
      if (m) serverVersion = m[1].trim()
    } catch {
      // INFO denied by ACL — connection still works
    }
    return { serverVersion }
  } finally {
    await client.disconnect()
  }
}

export async function testConnection(
  config: ConnectionConfig,
  password?: string
): Promise<TestConnectionResult> {
  const start = Date.now()
  try {
    let result: { serverVersion: string }
    switch (config.driver) {
      case 'mysql':
        result = await testMysql(config, password)
        break
      case 'postgres':
        result = await testPostgres(config, password)
        break
      case 'sqlite':
        result = await testSqlite(config)
        break
      case 'redis':
        result = await testRedis(config, password)
        break
      default:
        throw new Error(`Unsupported driver: ${config.driver}`)
    }
    return {
      ok: true,
      latencyMs: Date.now() - start,
      serverVersion: result.serverVersion
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
