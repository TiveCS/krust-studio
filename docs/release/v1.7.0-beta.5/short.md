# Krust Studio 1.7.0-beta.5

Follow-up to the AI Schema Sync beta line, from live testing on real projects.
Adds **typed Data changesets**, gives the AI a way to **query big tables**, and
fixes several editor/viewer papercuts. **Opt in via Settings → Updates.**

## Changesets — now Schema *and* Data (ADR-0023)

- **Data changesets.** `INSERT` / `UPDATE` / `DELETE` can now be grouped into a
  **Data changeset** and exported as a `.sql` for the DevOps handoff — the same
  capture-and-hand-off workflow you already had for schema DDL, applied to
  seed/reference-data changes.
- **Cleanly separated by kind.** A changeset is **Schema** (DDL) or **Data**
  (DML); the two never mix in storage. The History rail groups them into a
  **Schema** and a **Data** section, each with its own active changeset and its
  own **Unassigned** inbox; "Move to changeset" only offers same-kind targets.
- **Two optional active slots.** Set a Schema changeset and/or a Data changeset
  active independently; matching captures auto-attach only when a slot is active
  (nothing auto-collects until you say so). Destructive DML (`TRUNCATE`,
  no-`WHERE` `DELETE`/`UPDATE`) never auto-attaches.
- **Export together.** Pick a Schema + a Data changeset and export one `.sql`
  with the statements **interleaved in execution order** — for when a data
  backfill needs to sit between two DDL steps.

## AI / MCP

- **`read_rows` can filter now.** The read tool takes **structured**
  `filter` / `orderBy` / `columns` (no raw SQL), so an agent can target rows in a
  large table instead of paging blind through it. Any column used in a
  filter/sort/projection must be allowlisted and unmasked — a masked column can't
  be probed indirectly.

## Fixes & polish

- **Changeset actions are visible.** The per-changeset menu (set active, rename,
  export, delete) was hover-only and easy to miss — it's now persistently shown.
- **Copy SQL by selecting it.** Read-only SQL displays (history detail, DDL
  preview, routine viewer) are now mouse-selectable with a visible highlight, so
  you can drag-select and copy without hunting for the Copy button.
- **Smoother tab scroll.** Vertical mouse-wheel over the tab strip now glides
  horizontally instead of jumping a notch at a time.
- **JSON viewer FK follows the selection.** Expanding a foreign key in the row
  JSON panel now re-fetches when you pick another row (it used to stick on the
  previously-expanded row's parent). The panel's resize handle is also easier to
  grab.

## Verification still needed

The Data-changeset and `read_rows`-filter paths build clean but want a real run:
a live agent reading a filtered big table, DML auto-attaching to an active Data
changeset, and an export-together `.sql` in the right order. Manual promotion of a
*destructive* DML entry into a Data changeset is not yet behind a typed confirm —
that lands next. Please report through the 1.7.0-beta tracking issue.
