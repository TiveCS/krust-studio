# 23. Typed Changesets: separate Schema (DDL) and Data (DML) changesets

Date: 2026-07-07

## Status

Accepted — targeting 1.7.0-beta.5. **Amends [ADR-0002](0002-captured-ddl-changesets-no-squash.md):**
a Changeset is no longer DDL-only. Everything in ADR-0002 (raw, unsquashed,
chronological, capture-and-handoff, not a migration tool) still holds — it now
holds for **two kinds** of changeset instead of one.

## Context

ADR-0002 built the Changeset as the DevOps handoff for **schema** changes:
captured DDL, grouped by ticket, exported as a commented `.sql`, applied by hand
on prod. Live use surfaced the symmetric gap: the same team applies **data**
changes (seed/reference rows, config updates) to prod by hand too, but
`INSERT`/`UPDATE`/`DELETE` only ever land in **Data Mutation** history with no way
to bundle them into a handoff artifact. The ask (via `/grill-with-docs`) was to
let DML ride in changesets "cleanly separated" from schema.

The forks resolved:

1. **Model.** One mixed changeset vs typed changesets → **typed**: a changeset is
   **Schema-kind** (DDL) or **Data-kind** (DML), and kinds **never mix in
   storage**. Enforced by the type, not user discipline — the same "history
   streams are never mixed" instinct applied to the export artifact. It also keeps
   a destructive data-wipe (`TRUNCATE`) out of a schema handoff by construction.
2. **Flexibility.** A persistent fused changeset vs an export-time merge → **export
   merge**: storage stays typed, but the user can select a Schema + a Data
   changeset and **"Export together"** into one `.sql`, statements **interleaved in
   execution-time order** (a data backfill can belong *between* two DDL steps).
   Separation is the source of truth; the merged file is a render. A persistent
   fused object was rejected — it reintroduces the ordering hazard and erodes the
   invariant.
3. **Auto-attach + active.** → **two independent, optional active slots** (one
   Schema, one Data). DDL auto-attaches to the active Schema changeset (unchanged);
   DML auto-attaches to the active Data changeset **only when one is set** — the
   guard against a Data changeset sweeping up scratch grid edits. No active slot of
   that kind → statements stay in history, addable manually. **Destructive DML**
   (`TRUNCATE`, no-`WHERE` `DELETE`/`UPDATE`) **never auto-attaches** — Unassigned,
   promoted manually behind the destructive/typed confirm (consistent with the
   schema destructive rule, ADR-0002 + destructive-tag).
4. **Redis.** Stays **out** of changesets — the changeset export is SQL only; Redis
   is a distinct non-SQL command class with no `.sql` handoff (unchanged).

## Decision

- A Changeset carries a **kind**: `schema` or `data`. Attach is kind-scoped — a DDL
  entry can only join a Schema changeset, a DML entry only a Data changeset.
- **Two optional active slots** per connection (active Schema changeset, active
  Data changeset). Setting a slot active is the opt-in to auto-attach for that kind.
- **Export together**: any Schema + Data changeset can be exported as one `.sql`,
  interleaved by execution timestamp; individual export unchanged.
- History left rail groups changesets into a **Schema** section and a **Data**
  section, each with its own **Unassigned** inbox and active-star. "Move to
  changeset" is kind-scoped.
- `history.db` gains a `kind` column on `changesets` (default `schema` so existing
  changesets migrate as Schema-kind) and a second active-slot key in `meta`.

## Consequences

- ADR-0002's DDL-only wording is narrower: the accurate line is "a Changeset groups
  captured statements of one kind (DDL or DML) for the DevOps handoff." CONTEXT.md
  updated (Changeset, Query History).
- Data changesets export **inlined** DML (params already rendered in history) — the
  same display-rendered SQL the Data Mutation stream stores, directly runnable.
- Krust still is **not** a migration tool (ADR-0002): no up/down, no squash, no
  auto-apply. Data changesets are capture-and-handoff for seed/reference data, not
  data migrations.
- The rail's per-changeset action menu (set-active/rename/export/delete) must be
  **persistently visible**, not hover-only — a discoverability bug that worsens
  with two kinds (fixed in the same beta).
