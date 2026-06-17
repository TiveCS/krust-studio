// Throwaway diagnostic: connect mysql2 to a MySQL-protocol server (StarRocks FE,
// MySQL, MariaDB) with packet-level debug, to see WHERE the handshake stalls.
//
// Run (PowerShell):
//   $env:SR_HOST="10.0.0.5"; $env:SR_PORT="9030"; $env:SR_USER="root"; $env:SR_PASS=""
//   node scripts/diag-mysql-connect.mjs
//
// Or (bash):
//   SR_HOST=10.0.0.5 SR_PORT=9030 SR_USER=root SR_PASS= node scripts/diag-mysql-connect.mjs
//
// What to look for in the output:
//   - "<== Handshake..." packets = the server's initial handshake (good: server speaks).
//   - "==> Handshake response" = mysql2 replied with auth.
//   - then either an OK/Error/AuthSwitch, or SILENCE until "FAILED after ~8000ms"
//     -> silence after our response = capability/auth mismatch the FE ignores.
//
// Tries plaintext first, then a couple of option variations to bisect the cause.
import mysql from 'mysql2/promise'

const {
  SR_HOST,
  SR_PORT = '9030',
  SR_USER = 'root',
  SR_PASS = ''
} = process.env

if (!SR_HOST) {
  console.error('Set SR_HOST (and optionally SR_PORT/SR_USER/SR_PASS).')
  process.exit(1)
}

const base = {
  host: SR_HOST,
  port: Number(SR_PORT),
  user: SR_USER,
  password: SR_PASS,
  connectTimeout: 8000
}

async function attempt(label, extra) {
  const t0 = Date.now()
  process.stdout.write(`\n===== ${label} =====\n`)
  try {
    const conn = await mysql.createConnection({ ...base, ...extra })
    console.log(`CONNECTED in ${Date.now() - t0}ms`)
    const [rows] = await conn.query('SELECT VERSION() AS v')
    console.log('VERSION():', rows?.[0]?.v)
    await conn.end()
    return true
  } catch (e) {
    console.error(
      `FAILED after ${Date.now() - t0}ms:`,
      e?.code ?? '(no code)',
      '-',
      e?.message ?? e
    )
    return false
  }
}

// 1) plaintext + full packet debug (the revealing one)
if (await attempt('plaintext + debug', { debug: true })) process.exit(0)
// 2) force mysql_native_password (StarRocks/Doris commonly use it)
await attempt('force native password', {
  authPlugins: {
    mysql_clear_password: () => () => Buffer.from(SR_PASS + '\0')
  }
})
// 3) disable connection attributes (some MySQL-protocol forks choke on CLIENT_CONNECT_ATTRS)
await attempt('no connectAttributes', { connectAttributes: false })
