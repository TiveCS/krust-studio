Feature release — smarter filtering, frozen columns, query plans, and a faster grid.

## What's new
- **🔎 Inline filter + raw WHERE** — the filter is always visible with two modes: a structured **Builder** and a hand-written **Raw WHERE** that Krust still wraps in its own `SELECT … ORDER BY … LIMIT …`, so sort, pagination, count, inline edit, export and FK navigation keep working. Compact icon controls, persists per tab.
- **📌 Pinned columns (freeze panes)** — pin by name rule or primary key (Settings), or per-tab via the column header menu.
- **🌳 Query plan** — `EXPLAIN` / `EXPLAIN ANALYZE` as a visual tree (full-scan/index badges, rows, cost, ms).
- **🗂️ Pinnable, reorderable tabs** — pin tabs to a sticky left block and drag to reorder.
- **🐘 Postgres schema selector** — filter tables/views/enums by schema in the sidebar.
- **🎨 Colour-coded foreign keys** — FK values render indigo in the grid and FK picker.
- **⚡ Faster grid** — DOM-overlay drag-select (no per-cell re-render) + configurable virtualization threshold.

## 🐛 Fixed
- Empty filter values no longer crash Postgres integer columns; clearing a value now shows all rows.
- FK picker: highlighting, sticky header, and no redundant edit when re-picking the same value.
- Relation-opened tabs now load rows when switched to the Data view.
- Keybinding collisions resolved; `DROP INDEX` no longer flagged destructive.

## 📦 Install
Grab `krust-studio-app-1.6.0-setup.exe` below. SmartScreen may warn (unsigned) → **More info → Run anyway**.

> ⚠️ Use at your own risk — keep backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
