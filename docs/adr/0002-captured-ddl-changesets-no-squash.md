# 2. Capture GUI-generated DDL as raw, unsquashed Changesets

Date: 2026-05-28

## Status

Accepted

## Context

The team edits database schema through GUI controls (add/alter/drop column,
create table) rather than hand-writing SQL. Their current tool (Beekeeper
Studio) performs these edits but hides the DDL it generates. The team needs that
DDL to hand to DevOps, who applies schema changes **manually on production**.

The team deliberately does **not** use migration tooling — they report avoiding
it due to data-loss incidents, preferring to apply changes by hand. This is the
core differentiating workflow for Krust Studio.

The open question was how to package captured DDL for the handoff: preserve every
raw step, or squash redundant steps (e.g. add column → rename column → add index)
into a clean net-result script.

## Decision

- Surface and **log every DDL statement** Krust generates from GUI schema edits
  (the "Captured DDL" stream of Table Mutation history).
- Group captured statements into named **Changesets** (tied to a ticket or
  feature).
- Preserve statements in **raw chronological order — never squash**.
- Export a Changeset as one commented `.sql` file (timestamp + target object per
  statement) for the DevOps handoff.

## Consequences

- Krust must have a GUI schema editor that emits visible, capturable DDL for each
  supported engine (MySQL/MariaDB, Postgres, SQLite) — dialect differences are
  Krust's responsibility.
- Exported scripts may contain redundant/superseded steps. This is intentional:
  DevOps sees the exact human sequence and judges what to run. Squashing is
  explicitly rejected because net-result rewriting is migration-style logic and
  reintroduces the data-loss risk the team avoids.
- Krust is **not** a migration tool and should not grow migration semantics
  (versioning, up/down, auto-apply-on-deploy). It is a capture-and-handoff aid.
- Changesets need persistence tied to a connection, plus naming/ticket metadata.
- **Schema edits use native ALTER only — no SQLite table-rebuild.** Add / rename
  / drop column work on all engines; type / nullability / FK changes work on
  MySQL + Postgres (native `ALTER`). On SQLite those are *not* offered (its ALTER
  can't do them, and the create→copy→drop→rename rebuild is too risky for data /
  triggers / views). Edits are staged, the generated DDL is shown and run in a
  transaction on the dev connection, then captured. Rebuild support may come
  later behind an explicit confirmation.
- **Dialect assumption**: Captured DDL is emitted in the *dev* engine's dialect,
  with no cross-dialect translation. This relies on dev == prod engine (staging
  mirrors prod). If they ever diverge, the handoff script is not guaranteed to
  run on prod — translation is explicitly out of scope.
