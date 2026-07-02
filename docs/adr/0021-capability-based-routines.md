# Capability-based routines with their own tab, split across betas

## Context

1.7.0 adds stored procedures and functions (**Routines**). A routine is not a
table — it has no rows, no primary key, and on PostgreSQL its identity includes
an overload signature (schema + kind + name + input argument types). Reusing the
tabular `EntityType` / `EntityRef` / `readRows` path would mean special-casing
"non-tabular entities" everywhere. MySQL/MariaDB additionally have **no atomic
`CREATE OR REPLACE PROCEDURE`**, so a safe edit-of-existing needs a
drop-then-recreate with a recovery net.

## Decision

Model routines as their own driver capability, **`RoutineCapable`** (continuing
the ADR-0020 capability split, the same way Redis got `KeyValueCapable` instead
of faking tables), with dedicated `RoutineRef` / `RoutineInfo` / `RoutineDef`
types and a dedicated **`routine` tab kind** (definition viewer + Execute panel).
Only engines that support routines compose the capability — MySQL 8.0+, MariaDB
10.5+, PostgreSQL 12+; SQLite, Redis, and StarRocks do not.

Ship in two beta stages:

- **beta.1** — browse + view definition, engine-aware Execute (procedure →
  `CALL`, confirmed + Routine Execution history + read-only-blocked; function →
  `SELECT`, Data Retrieval), routine-aware statement splitting (MySQL `DELIMITER`
  directive support; PG dollar-quoting already handled), PG `CREATE OR REPLACE`
  and `DROP`, and MySQL/MariaDB **create + drop**. **MySQL edit of an existing
  routine is blocked** with a "safe replace lands in a later beta" banner —
  rather than shipping an unguarded `DROP`+`CREATE` that loses the routine if the
  `CREATE` fails.
- **beta.2** — the MySQL/MariaDB non-atomic replacement machine: **Routine
  Recovery Copy** (30-day local snapshot), grant/`DEFINER` preservation and
  restoration, and reviewed restore-original after partial failure.

Routine definition **drafts are durable across restart** (keyed by routine
identity, with a captured server-definition baseline to detect external drift) —
a deliberate exception to ADR-0012's transient-schema-draft rule, aligned instead
with ADR-0018 (SQL editor text is raw SQL and should survive a quit).

## Consequences

- Routines never touch the tabular read/mutation paths; the sidebar lists
  Procedures and Functions in their own sections.
- beta.1 is usable on all three routine engines quickly, and the one genuinely
  hard-to-reverse safety subsystem (MySQL Recovery Copy) is isolated to beta.2
  where it gets proper attention. The cost: MySQL users cannot edit an existing
  routine until beta.2.
- Automatic formatting never rewrites saved routine text; a Format action is
  explicit and the read-only viewer's Pretty toggle is display-only.
