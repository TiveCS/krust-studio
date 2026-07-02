# Krust Studio 1.7.0-beta.1

The first pre-release of the 1.7.0 line. Beta builds are **opt-in**: enable
Settings → Updates → **Receive beta (pre-release) updates**. Stable users are
unaffected; beta users keep getting newer betas and then stable 1.7.0. Turning
the toggle off stops future betas but does not downgrade a beta already
installed.

## Redis (Beta)

- Native key browser driven by incremental `SCAN` (never `KEYS`), MATCH glob,
  logical-database switcher, live TTL countdown.
- Key tab per key with a type-aware viewer/editor: strings (text/JSON/hex/base64,
  binary-safe), hashes, lists, sets, sorted sets, and append-only streams.
- Staged edits preview the exact Redis commands and commit atomically
  (`WATCH` + `MULTI`/`EXEC`) with conflict Reload / compatibility-gated Force.
- Rename (`RENAMENX`), delete (`UNLINK`) and expiry changes with typed confirms;
  TTL preserved across value edits.
- Every mutation captured in a dedicated **Redis Mutation** history stream.
- Redis keys are searchable in the command palette (Ctrl/⌘+P).

## Procedures & Functions (Beta)

- Sidebar **Procedures** and **Functions** sections (MySQL/MariaDB + PostgreSQL).
- Routine tab: definition viewer + metadata + an **Execute** panel. Procedures
  run as `CALL` (confirmed, blocked on read-only, captured as **Routine
  Execution**); functions run as `SELECT` and stay Data Retrieval.
- Typed parameter form with explicit NULL; MySQL `OUT`/`INOUT` values surfaced
  via the generated `SET @v; CALL; SELECT @v` sequence; PostgreSQL overloads
  targeted by signature.
- Create (PG `CREATE OR REPLACE`) and drop (typed confirm, exact signature) with
  captured DDL. A durable definition draft survives restart.
- **Known limitation:** editing an existing MySQL/MariaDB routine is blocked in
  this beta (safe non-atomic replacement + recovery copy lands in a later beta).

## Data grid

- Keyboard navigation: arrows / Shift+arrows, Tab/Shift+Tab, Home/End,
  PageUp/PageDown, with the active cell auto-scrolled into view.
- Enter/F2 edits the active cell (staged, not persisted) and stays put; type any
  character to start editing; Ctrl/⌘+A selects all loaded cells (also the "#"
  corner).
- Client-side **Find** (Ctrl/⌘+F): case-insensitive search over the loaded
  page's displayed text; highlights matches; Next/Prev jump the active cell.

## Settings

- Configurable **Find** shortcut in Keybindings.
- **Toast position** (Notifications).
- **Beta update channel** (Updates) + Check for updates.

## Other

- Vertical mouse-wheel now scrolls the tab strip horizontally (VSCode-style).
- Sidebar toolbar: filter input gets its own row so it isn't cramped.

## Under the hood

- Capability-based drivers (ADR-0020) — engines advertise only what they support
  (SQL, tabular, routines, keys, …) instead of assuming everything is relational.
- New capability: routines (ADR-0021).

## Not in this beta (planned for later 1.7.0 betas)

- StarRocks (Experimental engine).
- MySQL/MariaDB safe routine replacement (Routine Recovery Copy + grants).
- Routine-aware autocomplete, typed scalar param helpers, routine viewer Pretty
  toggle.

## Verification still needed

Redis (ACL, TLS, expiry, optimistic concurrency, binary, large collections) and
routine CRUD/execution against real MySQL, MariaDB, and PostgreSQL servers.
Please report through the 1.7.0-beta tracking issue.
