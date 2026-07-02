# 1.7.0-beta tracking issue

Draft body for the single GitHub tracking issue that collects all 1.7.0 beta
feedback. Create with:

```
gh issue create --title "1.7.0 beta feedback" --label beta \
  --body-file docs/release/v1.7.0-beta.1/beta-tracking-issue.md
```

---

Thanks for testing the **1.7.0 beta**! Enable it via **Settings → Updates →
Receive beta (pre-release) updates**. Post reports as comments under the matching
section. Please include: **engine + version, OS, reproduction steps**, and
sanitized capabilities/logs. **Do not** paste credentials, row values, or routine
bodies.

## Redis
Key browsing, staged edits + commit, WATCH conflicts, TTL, binary values, large
collections, ACL-restricted commands, TLS.

## Procedures & Functions
Browsing, execute (params, OUT/INOUT, result sets), create/replace/drop, captured
DDL + Routine Execution history. (MySQL edit-of-existing is intentionally blocked
this beta.)

## SQL prettification
Global Pretty preference + per-tab display toggle behaviour.

## StarRocks (Experimental)
Not shipped yet — reserved for a later beta.

## Existing-driver regressions
Anything that worked in 1.6.x and now misbehaves on MySQL/MariaDB, PostgreSQL, or
SQLite (data grid, editor, structure, backup/restore, history/changesets).
