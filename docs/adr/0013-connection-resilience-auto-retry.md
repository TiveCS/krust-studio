# 13. Connection resilience: transparent auto-retry + manual reconnect

Date: 2026-06-04

## Status

Accepted

## Context

Database servers (and serverless DBs like Neon) close **idle** connections. Krust
opens one live connection per Connection (a Session) and held it for the app's
lifetime. After an idle gap ("left off for lunch") the connection was dead, and
recovery was broken:

- Drivers only reconnected when their handle was `null`, which happened *only* if
  an async `'error'` event had fired. A **silent** drop (server closed the socket
  without an event yet) left a stale-but-non-null handle, so the next query ran on
  a dead connection and threw.
- The UI "Retry" called `open()` → `connectSession()`, which **early-returns if
  the driver is still in the sessions map** — so retry didn't force a reconnect.

Net effect: come back after lunch, every action fails, and nothing recovers it.

## Decision

Make a Session **transparently auto-recover**, with a safety line that respects
the no-silent-mutation principle, plus an explicit manual fallback.

- **Auto-retry once.** On a connection-fatal error (e.g. `ECONNRESET`,
  `PROTOCOL_CONNECTION_LOST`, pg "Connection terminated"), the driver drops the
  dead handle, reconnects, and retries the operation **once**. The user's next
  click after an idle drop just works.
- **Safety boundary.** Auto-retry covers **reads** and the **transactional GUI
  writes** (staged-edit commit, schema commit) — those run inside `BEGIN/COMMIT`,
  so a drop before commit is a full rollback and re-running is safe. A raw
  **SQL-editor run** (`runScript`) reconnects but is **not** silently re-run,
  because a bare statement may have auto-committed before the drop; the user is
  told "reconnected — re-run your query".
- **Manual Disconnect / Reconnect** from the footer connection menu, for when
  auto-recovery can't help (bad creds, server down) or the user wants to drop the
  link deliberately. Reconnect forces a clean teardown + fresh connect (fixing the
  `connectSession` early-return); Disconnect closes the socket and returns to the
  landing state (open tabs are saved per-connection and restored on reconnect).

## Consequences

- The driver `query`/op path gains a reconnect-and-retry wrapper, and each engine
  must classify which errors are *connection-fatal* (retryable) vs ordinary query
  errors (surfaced, never retried — a SQL syntax error must not trigger a
  reconnect loop).
- Distinguishing retryable from non-retryable is per-engine and best-effort; a
  misclassification either masks a real error (retry an un-retryable) or fails to
  recover (surface a recoverable one). Erring toward *surfacing* is safer.
- "Retry once" is deliberate — repeated auto-retry could hammer a down server or
  loop on a permanent failure. After one failed retry, surface + offer manual
  Reconnect.
- The SQL-editor "reconnect but don't re-run" rule means the editor path needs to
  detect the drop, reconnect for the *next* run, and report the current run as
  needing a manual re-run — it cannot transparently swallow the failure like a
  read.
