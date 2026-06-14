Feature release — smarter filtering, frozen columns, query plans, pinnable tabs, and a much faster data grid.

## ✨ Added

### Inline filter builder + raw WHERE (ADR-0017)
The data-grid filter is now always visible with two modes, one active at a time. **Builder** is the structured per-column condition builder (operators, IN/BETWEEN/IS NULL, AND/OR groups). **Raw WHERE** is a hand-written predicate — not a full statement — that Krust still wraps in its own `SELECT … ORDER BY … LIMIT …`, so sort, pagination, total-count, inline editing, export and FK navigation all keep working exactly as in Builder mode. Switching Builder → Raw seeds the box with the SQL the builder generated (one-way); Raw is trusted like the SQL editor with one guard — a statement separator (`;`) is rejected so a predicate can't smuggle a second statement. A failed raw predicate shows the engine's error inline while the last good rows stay visible. Mode and raw text persist per tab. The whole filter is a compact icon cluster now — no header row eating vertical space.

### Pinned columns / freeze panes (ADR-0016)
Freeze columns to the left or right edge. Global rules live in **Settings → Pinned Columns** (match by name, or auto-pin the primary key); per-tab overrides via the column header right-click menu (Pin left/right · Unpin · Reset). Reordering is Excel-like — selection, edits and export follow display order.

### Query plan (ADR-0014)
Run `EXPLAIN` or `EXPLAIN ANALYZE` from the SQL editor and get a visual plan tree across all three engines — full-scan (red) / index badges, estimated + actual rows, cost, and timing, with a Raw toggle.

### Pinnable, reorderable tabs
Pin tabs to a sticky left block that survives bulk-close, drag to reorder, and a tab right-click menu (pin/unpin, new query tab, close / close others / close to the right / close all).

### Postgres schema selector
When a connection exposes more than one schema, the sidebar shows a schema dropdown that filters the Tables / Views / Enums lists.

### Configurable grid virtualization
**Settings → Data Grid** exposes a row threshold: pages larger than it render virtualized (only visible rows in the DOM); smaller pages render plainly. Default 150.

## 🔧 Changed
- **Foreign-key values are colour-coded** (indigo) in both the grid and the FK picker mini-table, regardless of the underlying type.
- The **Data / Structure** switch moved out of its own strip into each view's footer (bottom-left).
- Destructive DDL (`DROP TABLE`/`VIEW`) auto-attach to the active changeset is now a toggle (**Settings → History**).

## 🐛 Fixed
- An empty filter value no longer emits `col = ''` — fixes a Postgres `22P02` crash on integer columns, and clearing a value now falls back to all rows.
- FK picker: value syntax-highlighting, sticky-header background bleed, and picking the already-selected value no longer stages a redundant edit.
- **Drag-select performance** — the selection rectangle is painted via a DOM overlay during the drag (no React re-render per cell) with mouse handling delegated to a single listener; a virtualizer cache fix stops rows collapsing after the FK picker closes.
- Opening a table via a relation and switching to the Data view now fetches its rows.
- Keybinding collisions resolved (`table.toggleView` moved off `Ctrl/⌘+B`; the sidebar toggle is a real rebindable command), and a hand-typed `DROP INDEX` is no longer flagged destructive.

## 📦 Install
Grab `krust-studio-app-1.6.0-setup.exe` below. On first run, Windows SmartScreen may warn (app isn't code-signed) → **More info → Run anyway**.

> ⚠️ Personal project, vibe-coded and open-sourced. **Use at your own risk** — always have backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
