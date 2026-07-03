# Plan — Rename table from the Structure footer

**Status:** planned (not implemented). Target branch: `feat/v1.7.0`.

## Problem

Renaming a table is fully built end-to-end (`renameTable` in store → main →
drivers → Schema Mutation history → open-tab retarget), but it is reachable
**only** from the sidebar right-click menu. Inside the Table Editor / Structure
view there is no rename affordance, so users perceive rename as impossible —
the feature is undiscoverable, not missing.

## Goal

Surface rename **inside the Structure view** so it is discoverable from the
editor, without introducing a second mutation model.

## Decisions (locked via grill session)

1. **Immediate, not staged.** The footer button reuses the existing immediate
   `renameTable` flow. Rename never joins the staged column/index commit batch.
   Rationale: the ask is a *discoverability* fix; staging a rename would create
   DDL order-of-operations hazards (which name do staged `ALTER`s target?) far
   beyond the need. Mirrors the Redis Key decision — key rename is a separate
   guarded action outside the value-commit.
2. **Hideable SQL preview before execute**, sourced from a **server dry-run**
   (add `dryRun?` to `renameTable`, same pattern as `applySchema`). Not a
   client-built string — the surfaced SQL must be the real driver-generated SQL
   per the no-silent-mutation principle.
3. **Guarded while pending.** The Rename button is **disabled when
   `ops.length > 0`** (pending column/index changes), with a tooltip: "Commit or
   discard pending changes first." Prevents an immediate rename overlapping a
   not-yet-committed batch built against the old name.
4. **Placement:** left footer group next to `Add column`, visible on **all**
   sub-tabs (rename is table-level, not columns-only), gated `!readOnly`. Styled
   with a **soft-amber background** (user's explicit choice — note: amber is also
   the staged-edit "pending" color, a deliberate accepted overload).
5. **Shared dialog.** Extract the inline sidebar rename dialog into a reusable
   `RenameTableDialog` (input + hideable preview + apply); wire both the sidebar
   and the Structure footer to it, so the preview upgrade benefits both entry
   points.
6. **No ADR** — easily reversible UI, reuses existing infra, low stakes.

## Implementation

| # | Change | Files |
|---|---|---|
| 1 | Add `dryRun?: boolean` to `renameTable`; when set, build + return the SQL **without** executing `query()` | `src/main/db/driver.ts` (contract), `drivers/mysql.ts`, `drivers/postgres.ts`, `drivers/sqlite.ts` |
| 2 | Thread `dryRun` through main + IPC + preload + store | `src/main/db/session.ts` (`renameTable`), `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/store/connections.ts` |
| 3 | Extract shared `RenameTableDialog` (input + expand-then-debounced dry-run preview + apply) from the inline sidebar dialog | new `components/RenameTableDialog.tsx`; refactor `components/AppSidebar.tsx` (~L441) |
| 4 | Add Rename button in the footer — left group by `Add column`, all sub-tabs, `!readOnly`, **disabled when `ops.length > 0`**, soft-amber | `components/StructureView.tsx` (~L792 footer) |

### Preview refresh
Fetch the dry-run SQL **only when the preview section is expanded**, then
debounced on input change. No IPC when the section is collapsed.

### Already works — no new work
- Read-only block (`session.ts` throws on `config.readOnly`).
- Schema Mutation history capture (`captureAll(id, 'table_mutation', …)`).
- Open-tab retarget + entity refresh (store `renameTable`).

## Not destructive
Rename loses no data, so **no typed-name confirmation** — consistent with the
existing sidebar dialog. The dialog + SQL preview are the review step.

## Verification checklist (post-implement)
- Rename from footer on MySQL / Postgres / SQLite — correct engine syntax
  (`RENAME TABLE` vs `ALTER TABLE … RENAME TO`).
- Preview SQL matches the executed statement exactly.
- Button disabled while pending column edits exist; tooltip shown.
- Open data + structure tabs for the table retarget to the new name.
- Entry lands in Schema Mutation history.
- Read-only connection: button hidden / rename blocked in main.
