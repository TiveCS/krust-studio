# 17. Inline filter builder with a raw-WHERE escape hatch

Date: 2026-06-14

## Status

Accepted — implemented (design resolved via `/grill-with-docs`)

## Context

The data-grid filter UI is collapsed behind a chevron (`FilterBar` `expanded`
state). For a daily driver this is friction: every filtering action starts with
an expand step, and the structured builder can't express predicates the operator
set doesn't cover (functions, `EXISTS`, date math, dialect-specific operators).

We want two things:

1. The filter **always visible** — no hidden panel.
2. A **fallback to hand-written SQL** for predicates the builder can't express.

The question that matters for the future reader: *what* is "hand-written" here,
and why isn't it just the existing SQL editor? Krust already has a full SQL
editor (Query Execution / `runScript`) for arbitrary statements. Putting full
SQL into the grid filter would duplicate it **and** break the things that make a
data tab a data tab — inline editing, insert, pagination, total-row-count, FK
navigation — all of which assume a single source table with a known primary key.

## Decision

The data-grid **Filter** is always present in the toolbar (a single live
condition row at rest; `+` grows conditions/groups inline) and has **two modes,
one active at a time**:

- **Builder** — today's structured `Filter[]` → parameterized WHERE.
- **Raw** — a hand-written **WHERE predicate only**, *not* a full statement.
  Krust still wraps it in its own `SELECT … ORDER BY … LIMIT …`, so sort,
  pagination, count, inline edit, export and FK navigation keep working. This is
  the deliberate boundary: Raw is narrower than the SQL editor **on purpose** so
  the grid stays editable (one source table, PK preserved). Full arbitrary SQL
  stays in the SQL editor.

Supporting decisions:

- **One-way seed.** Switching Builder → Raw pre-fills the raw box with the SQL the
  builder generated (escape hatch). Raw → Builder does **not** parse back — no SQL
  parser; the cost of a per-dialect predicate parser isn't worth it.
- **Trust model = the SQL editor's.** Raw is the user's own SQL on their own
  connection, strictly *less* powerful than the SQL editor they already have, so
  it's trusted — with **one guard: reject a statement separator (`;`)** so a
  predicate can't smuggle a second statement (Postgres' simple-query protocol
  would otherwise run it). No parsing, no parameterization (you can't parameterize
  arbitrary operators/identifiers).
- **Apply is explicit** — Apply button or Enter; never live-on-keystroke (avoids
  query storms on large/slow tables, and a half-typed raw predicate erroring on
  every keystroke).
- **Errors are inline + non-destructive.** A failed raw predicate shows the
  engine's error in a strip under the filter row while the **last successful rows
  stay visible**, so the user iterates editor-style.
- **Filter-by-cell respects the mode.** Right-click → "Filter by this value"
  appends a structured condition in Builder; in Raw it appends an engine-quoted
  ` AND "col" = 'value'` to the text.
- **Persisted per tab, fail-soft.** `SerializedTab` gains `filterMode` +
  `rawWhere`; both restore and re-run on workspace load like structured filters.
  A stale raw predicate (e.g. a dropped column) surfaces its error inline but the
  tab stays open.

## Considered alternatives

- **Full custom SELECT in the grid.** Rejected: duplicates the SQL editor and
  breaks edit/insert/pagination/count (no guaranteed single table or PK).
- **Compose raw AND structured filters.** Rejected: two sources of truth feeding
  one WHERE muddies the condition count, AND/OR grouping, and filter-by-cell.
- **Parse raw → validate it's a side-effect-free boolean expression.** Rejected:
  heavy (per-dialect parser) for a self-hosted tool where the SQL editor already
  grants more power.

## Consequences

- `countRows` and `exportAllRows` take `Filter[]` today; both need a raw-WHERE
  variant on every driver. The `;` guard lives in one shared choke point.
- `SerializedTab` gains `filterMode` (default `'builder'`) + `rawWhere`; absence
  on old persisted tabs defaults to Builder — no migration code needed.
- Raw mode keeps the grid editable, so no read-only-vs-editable special-casing is
  introduced beyond the existing staged-edit machinery.
- The reused `FilterBar` inside the **FK Picker** is an ephemeral instance and is
  unaffected by per-tab mode/persistence.
