# 16. Pinned columns: settings-driven freeze with DOM reorder

Date: 2026-06-11

## Status

Accepted

## Context

The Data Grid renders a plain HTML `<table>` with TanStack Virtual on rows only (no column virtualisation). Columns scroll horizontally as a unit. For wide tables the user loses track of identifying columns (`id`, `RecordStatus`) while scrolling. The request is to freeze selected columns to the left or right edge — like Excel's "Freeze Panes".

Two implementation paths exist:

1. **Sticky-only, no reorder** — apply `position: sticky` with computed `left`/`right` offsets to cells in-place. Simple, but broken when a pinned column is not already at the edge: scrollable columns slide *behind* the sticky cell, causing visual overlap.

2. **DOM reorder + sticky** — render left-pinned columns first (preserving their relative order), then scrollable columns, then right-pinned columns. Each group uses `position: sticky` with cumulative offsets. This is how Excel, Google Sheets, Airtable, and TanStack Table handle it.

Path 1 only works if pinned columns happen to already be at the table edges. Users want to pin `id` (col 1) **and** `RecordStatus` (col ~15) simultaneously — path 1 is broken for that case.

## Decision

Use **DOM reorder + sticky** (path 2).

Pin rules are global, stored in `settings.json`:
- A **name list** — `Array<{ name: string; side: 'left' | 'right' }>`. Exact column-name match, applied to every table opened.
- A **PK toggle** — `{ enabled: boolean; side: 'left' | 'right' }`. Auto-pins primary key column(s) using the `primaryKey` array already present on `RowsResult`.

At render time, `DataGrid` computes `effectivePins`: the merged set of name-rule matches + PK matches for the current table's columns, minus any per-tab unpins (see below).

Columns are then sorted into three groups for rendering:
1. Left-pinned — relative order preserved from original column order.
2. Scrollable — columns not in either pin group.
3. Right-pinned — relative order preserved from original column order.

Each pinned `<th>` / `<td>` receives `position: sticky` with a cumulative `left` (or `right`) offset. The row-number gutter (`ROWNUM_W = 48px`) is always sticky-left at offset 0, so left-pinned column offsets start at 48px.

A **freeze shadow** — a vertical `box-shadow` — is applied to the rightmost left-pinned column and the leftmost right-pinned column to mark the scroll boundary.

**Per-tab override**: the user can right-click any column header → "Unpin" / "Re-pin" to suppress or restore a settings-driven pin for the current tab session. This state lives in `Tab.pinnedOverride` (session-only, not persisted in `workspace.json`).

## Consequences

- Column order visible in the grid may differ from the database's column order for tables where a pinned column is not already at an edge. This is expected and matches the mental model of every spreadsheet tool.
- `SerializedTab` does **not** gain a new field — overrides are intentionally ephemeral.
- The Settings modal gains a new **Pinned Columns** section: tag/chip input for name rules (each chip has an L/R toggle), plus a PK toggle with L/R selector.
- No IPC changes needed — pin rules live in `settings.json` which is already managed by the settings store.
