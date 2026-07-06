#!/usr/bin/env node
// Krust Studio — MCP stdio bridge (ADR-0022).
//
// A dumb pipe: stdio-first MCP agents (Codex CLI, etc.) spawn this; it forwards
// newline-delimited JSON-RPC from stdin to the running Krust app's in-app HTTP
// MCP endpoint (127.0.0.1) with the bearer token, and writes each JSON-RPC
// response back to stdout. It holds NO secrets or state of its own and enforces
// nothing — the app is the single enforcement point. The token + URL come from
// the client's env config so this file is safe to ship.
//
// Configure your MCP client to run:
//   command: node
//   args:    ["<path>/mcp-bridge.mjs"]
//   env:     { "KRUST_MCP_URL": "http://127.0.0.1:7071/",
//              "KRUST_MCP_TOKEN": "<token from Settings → AI / MCP>" }

import { createInterface } from 'node:readline'

const URL = process.env.KRUST_MCP_URL || 'http://127.0.0.1:7071/'
const TOKEN = process.env.KRUST_MCP_TOKEN || ''

if (!TOKEN) {
  process.stderr.write(
    'krust mcp-bridge: KRUST_MCP_TOKEN is not set. Copy it from Krust Studio → Settings → AI / MCP.\n'
  )
  process.exit(1)
}

const headers = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  authorization: `Bearer ${TOKEN}`
}

async function forward(line) {
  let res
  try {
    res = await fetch(URL, { method: 'POST', headers, body: line })
  } catch (err) {
    // connection refused → app not running / MCP off. Emit a JSON-RPC error if
    // the message had an id, else stay silent (notification).
    emitError(line, `Krust Studio MCP endpoint unreachable at ${URL} (${err.message})`)
    return
  }
  // 202 (notification accepted) or empty body → nothing to write back
  const text = await res.text()
  if (!text) return
  process.stdout.write(text.endsWith('\n') ? text : text + '\n')
}

function emitError(line, message) {
  let id = null
  try {
    id = JSON.parse(line).id ?? null
  } catch {
    // not parseable — no id to answer
  }
  if (id === null || id === undefined) return
  process.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32001, message } }) + '\n'
  )
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (trimmed) void forward(trimmed)
})
rl.on('close', () => process.exit(0))
