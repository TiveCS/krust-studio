# 7. Cross-column text search as a separate driver method

Date: 2026-05-29

## Status

Accepted

## Context

The **FK Picker** (see CONTEXT.md) needs a quick-search box (in its compact inline
picker row) where the user types a few characters and finds the right parent record
by *any* visible field — a name, an email, a status — not just the foreign key
value. Parent tables can be large (millions of rows), so the search must run on the
server, not over a fetched window.

The existing query path (`readRows` + `buildWhere`) is deliberately
**structured and AND-only**: each filter is `column op value`, parameterized, and
the clauses are AND-joined. That model is safe and index-friendly but cannot
express "match this substring in *any* column," which is exactly what a
type-to-find lookup needs.

Three options were weighed (grilled in the FK Picker design):

1. **Client-side filter on a fetched window** — fetch the first N parent rows,
   filter in JS. No backend change, but a parent past row N is invisible. Fails
   on large tables.
2. **Single-column server search** — reuse the AND filter with one `LIKE` on a
   chosen column. No new SQL, but the user must know which column holds the label
   and can't just type a name and find it anywhere.
3. **Server cross-column search** — a query that ORs a `LIKE` across every column
   (cast to text), parameterized and limited.

## Decision

Add a dedicated **`searchRows(entity, term, limit, offset)`** method to the
`DbDriver` contract, separate from `readRows`. It builds a parameterized
`WHERE (CAST(col1 AS text) LIKE $term OR CAST(col2 AS text) LIKE $term OR …)`
across all columns, case-insensitive, ordered by the referenced/first column,
with load-more paging (50 at a time).

- The search term is bound as a parameter (`%term%`); only identifiers are
  interpolated, and they are engine-quoted — same injection discipline as the
  rest of the driver layer.
- Each engine casts to its text type and picks its case-insensitive form:
  Postgres `CAST(col AS text) ILIKE`, MySQL `CAST(col AS CHAR) LIKE` (CI
  collation), SQLite `CAST(col AS TEXT) LIKE` (CI for ASCII).
- It is kept **separate from `buildWhere`** so the structured AND-only filter
  stays simple and the free-text OR-LIKE concern doesn't leak into it.

## Consequences

- The FK Picker can search huge parent tables server-side from one input box. Its
  other mode — the reused `FilterBar` + sortable headers + pagination — runs the
  normal `readRows` + `buildWhere` path; quick-search and the filter builder are
  mutually exclusive per query.
- These queries are **un-indexable full scans** (OR across cast columns). Accepted
  for a capped (50-row, load-more) lookup popover; this is not a general data-grid
  search and must not be wired into the main browse path expecting index use.
- New contract method = all three drivers implement it; future engines must too.
- This seeds the **P3 "Filter OR + grouping / cross-column search"** backlog item.
  If that lands, revisit whether the FK Picker rides the general search or keeps
  its own narrow method.
- No cross-dialect translation: each driver owns its cast + CI form. Consistent
  with the dialect assumption in ADR 0002 (dev engine == target engine).
