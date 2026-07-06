import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getMcpConfig, mcpToken } from '../store/mcp'
import { registerMcpTools } from './tools'
import type { McpStatus } from '../../shared/types'

const HOST = '127.0.0.1'

let http: Server | null = null
let boundPort = 0
let lastError: string | undefined

/** app version, injected once at startup for the MCP server identity */
let appVersion = '0.0.0'
export function setMcpAppVersion(v: string): void {
  appVersion = v
}

/** Build a fresh MCP server with all tools. Stateless: one per request, so no
 *  session bookkeeping — tools reach live app state through the main modules. */
function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'krust-studio', version: appVersion },
    { capabilities: { tools: {} } }
  )
  registerMcpTools(server)
  return server
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers['authorization']
  if (!h || Array.isArray(h)) return null
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1] : null
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 4_000_000) reject(new Error('Request body too large'))
    })
    req.on('end', () => {
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(s)
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // token auth on every request — the loopback bind is not a trust boundary
  const token = bearer(req)
  if (!token || token !== mcpToken()) {
    return sendJson(res, 401, { error: 'unauthorized' })
  }
  // stateless streamable HTTP: messages arrive on POST; GET/DELETE (session
  // streams) are unused here, so refuse them per the SDK stateless pattern.
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return
  }
  let body: unknown
  try {
    body = await readBody(req)
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : 'bad request' })
  }
  const server = buildServer()
  // stateless + JSON responses (not SSE) so the stdio bridge is a plain
  // request→response pass-through for stdio-first agents (Codex CLI).
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, body)
}

/** (re)start the HTTP server on the configured port when enabled. Idempotent.
 *  Resolves only once the socket is bound (or has errored), so the returned
 *  status is accurate — not a "still binding" snapshot. */
export async function startMcpServer(): Promise<McpStatus> {
  const cfg = getMcpConfig()
  stopMcpServer()
  if (!cfg.enabled) return mcpServerStatus()
  lastError = undefined
  await new Promise<void>((resolve) => {
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    try {
      const s = createServer((req, res) => {
        handle(req, res).catch((err) => {
          try {
            sendJson(res, 500, { error: err instanceof Error ? err.message : 'server error' })
          } catch {
            // response already sent
          }
        })
      })
      s.on('error', (err) => {
        lastError = err instanceof Error ? err.message : String(err)
        http = null
        boundPort = 0
        done()
      })
      s.listen(cfg.port, HOST, () => {
        http = s
        boundPort = cfg.port
        done()
      })
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      done()
    }
  })
  return mcpServerStatus()
}

export function stopMcpServer(): void {
  if (http) {
    http.close()
    http = null
  }
  boundPort = 0
}

export function mcpServerStatus(): McpStatus {
  const cfg = getMcpConfig()
  return {
    enabled: cfg.enabled,
    running: http !== null && boundPort === cfg.port,
    port: cfg.port,
    error: lastError
  }
}
