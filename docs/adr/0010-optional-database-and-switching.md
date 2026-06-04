# 10. Optional database name + multi-database switching

Date: 2026-06-03

## Status

Accepted

## Context

A connection originally required a database name. But a single MySQL or
PostgreSQL server hosts many databases, and the author often wants to connect to
the server and browse/switch between them (the way Beekeeper and DBeaver do)
rather than create one Krust connection per database.

Two engine facts shape the design:

- **MySQL** treats databases as namespaces reachable on one connection. `USE db`
  switches the default schema, and all of Krust's introspection already keys off
  `DATABASE()`, so a switch is in-place and cheap.
- **PostgreSQL** binds a connection to exactly one database at connect time.
  There is no `USE`; reaching another database means opening a **new**
  connection. A connection also can't be opened with *no* database — pg needs
  one to authenticate against.

## Decision

- Make the connection's **database name optional**. Empty means "server-level":
  - MySQL connects with no default schema (entity list is empty until the user
    picks a database from the switcher).
  - PostgreSQL falls back to the `postgres` maintenance database for the initial
    connection (and for the pre-save *Test* path).
  - SQLite is unaffected — its "database" is the file path.
- Add three driver-contract methods — `listDatabases()`, `currentDatabase()`,
  `useDatabase(name)` — and a sidebar-header **Database Switcher** UI.
- Hide the MySQL/Postgres asymmetry behind `useDatabase`: MySQL runs `USE db` on
  the live connection; Postgres **closes and reconnects** bound to the new
  database; SQLite throws (single file).
- Switching a database closes the previous database's open tabs and reloads
  entities/enums (they belong to the old database). Database listing loads
  **lazily/non-blocking** after connect so a slow `SHOW DATABASES` never delays
  the schema tree; failures (no permission / unsupported) leave the switcher
  disabled rather than erroring.

## Consequences

- The Driver interface grows three methods every engine must implement; SQLite's
  are degenerate (single file).
- A Postgres database switch is heavier than MySQL's — it tears down and
  reopens the client (and its backend PID, cancel path, etc.). Acceptable: it
  matches how pg actually works, and switching is a deliberate user action.
- Captured DDL / history remain tied to the connection id, not the active
  database. Cross-database changesets are not modeled; for now a changeset spans
  whatever database was active when each statement ran. Revisit if it bites.
- Server-level connections widen blast radius: a writable server-level
  connection can mutate any database on the server. The read-only flag still
  applies globally, but per-database read-only is not modeled.
