# 11. Column reordering & unified MySQL MODIFY

Date: 2026-06-03

## Status

Accepted

## Context

The Table Editor could add/rename/drop/alter columns but not **reorder** them.
Reordering an existing table's columns is physically possible only on
**MySQL/MariaDB** (`ALTER TABLE t MODIFY col <def> AFTER other` / `FIRST`).
**PostgreSQL** has no column-reorder syntax at all, and **SQLite** cannot either
— both would require a create→copy→drop→rename **table rebuild**, which
[ADR 0002](0002-captured-ddl-changesets-no-squash.md) explicitly refuses
(data/trigger/view loss risk). (Creating a *new* table is different: the column
order is just the order of a not-yet-run `CREATE`, free on every engine.)

MySQL's `MODIFY` is the catch: it does not move a column in isolation — it
**restates the column's entire definition**. Whatever you don't repeat
(`AUTO_INCREMENT`, `DEFAULT`, `ON UPDATE CURRENT_TIMESTAMP`, charset/collation,
comment, generated expression) is dropped. This collided with two facts:

1. The existing `alterColumn` op already emitted `MODIFY col <type> NULL|NOT
   NULL` — i.e. it *already* silently dropped those attributes on any type/null
   edit. A latent no-silent-mutations violation.
2. If reorder and a type/default edit on the same column were staged as two
   separate `MODIFY`s, they would clobber each other (whichever ran last won —
   reverting the type or dropping the extras).

This sits directly under the project's core principle: **no silent mutations**.

## Decision

- **Add column reordering** as a staged `moveColumn` SchemaOp, committed in the
  same transaction + review flow as other structure edits
  ([ADR 0005](0005-mutation-safety-model.md)). UI is a per-row drag handle.
- **Scope by capability, not blanket rule:** the drag handle is always available
  when drafting a *new* table (any engine); on an *existing* table it appears
  **only on MySQL/MariaDB** and is hidden on Postgres/SQLite. No table rebuild is
  ever introduced to fake reorder on pg/sqlite.
- **Unify all MySQL existing-column changes into one `MODIFY` per changed
  column.** Type, nullability, default, *and* position collapse into a single
  statement instead of separate `MODIFY` / `ALTER COLUMN` ops that fight.
- **Build that `MODIFY` by splicing the column's verbatim `SHOW CREATE TABLE`
  line** — swap only the changed token (type / NULL-ness / DEFAULT clause),
  leave the rest of the line untouched, append `AFTER`/`FIRST`. Everything Krust
  doesn't model is preserved *by construction*, not by remembering to re-emit it.

Alternatives rejected:
- *Reconstruct the definition from structured metadata* (extend introspection to
  read EXTRA/collation/charset/comment/generated/…): cleaner code, but every
  attribute not modeled becomes a silent drop — the same bug class, relocated.
- *Forbid editing + moving a column in one batch*: simplest, but leaves the
  pre-existing `alterColumn` silent-drop bug unfixed.
- *Display-only (grid) reorder*: cosmetic, dodges DDL entirely, but isn't what
  was asked — the user wants the physical order changed.

## Consequences

- The MySQL alter path diverges from pg/sqlite: it must parse the relevant
  `SHOW CREATE TABLE` column line and do targeted string surgery. Parsing MySQL
  column DDL is fiddly (quoting, `DEFAULT '…'`, `COMMENT '…'`, expressions) and
  needs careful tests; the payoff is faithful, preservation-by-default edits.
- Fixes the latent bug where a plain type/nullability change dropped
  `AUTO_INCREMENT` / default / collation.
- `moveColumn` is **MySQL-only for existing tables**. Reorder on an existing
  pg/sqlite table is a non-goal until/unless the no-rebuild stance changes.
- Column order remains cosmetic to query *results* (affects `SELECT *`, `INSERT`
  without a column list, and the generated `CREATE`); this feature is about
  faithfully matching the DB's physical order, not changing query semantics.
- New-table drafts gain free reordering on all engines as a side effect (it's
  just the `CREATE` column order).
