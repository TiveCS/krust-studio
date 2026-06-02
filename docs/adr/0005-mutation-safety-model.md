# 5. Mutation safety: staged edits, transactions, and guards

Date: 2026-05-28

## Status

Accepted

## Context

The author's team manually applies changes (no migration tooling) and is acutely
wary of data loss. The recurring design value is "automate for convenience, but
never force trust — everything inspectable and overridable." A database tool's
edit path is where that value matters most: a careless UPDATE or autocommitted
cell change can destroy production data.

## Decision

All data mutation goes through a deliberate, reviewable path:

- **Staged edits.** Grid edits do not write immediately; they pend (highlighted).
  A review panel shows the generated DML before anything runs.
- **Transactional commit.** Committing a staged batch runs inside a transaction
  and rolls back on any error — no partial writes. Discard throws the batch away.
- **Read-only connection flag.** A connection can be marked read-only (e.g.
  prod). This blocks ALL mutation paths — grid edits, DML, DDL — enforced in the
  **main process**, not merely hidden in the UI.
- **Destructive-statement guard.** UPDATE/DELETE without WHERE, and
  DROP/TRUNCATE, require an explicit typed confirmation before running.
- **Affected-row preview.** Before committing DML, show the count of rows that
  will be affected (via the WHERE) so an over-broad change is caught first.
- **Explicit NULL handling.** The grid distinguishes NULL from empty string and
  offers a dedicated "set NULL" action.

## Consequences

- More clicks than an autocommit tool — intentional. The friction is the feature
  for a cautious user.
- The Driver interface must expose transactions and a way to compute affected-row
  counts and detect statement shape (missing WHERE, DDL kind).
- Read-only enforcement must live below the UI (main process) so it cannot be
  bypassed by a renderer bug.
- Staged data edits feed **Data Mutation** history just like committed DML; the
  no-silent-mutation principle holds across both schema and data edits.
