Feature release — performance, schema-editing, history readability, and reusable table scaffolding.

## ✨ Added

### Virtualized data grid
Large result sets now render only the rows in view (TanStack Virtual), so tables with thousands of rows scroll smoothly instead of janking. Staged edits, selection, and the inline FK picker all keep working.

### Drop a relation where you look for it
Each foreign key in the **Relations** sub-tab has a drop toggle that stages a `DROP FOREIGN KEY`, committed together with your other schema edits. Dropping an index that backs a foreign key now warns and offers **Drop both** (FK then index, in the correct order) or **Drop index only**. (SQLite and read-only connections are excluded.)

### Backup & Restore as a tab
The Backup/Restore modal is now a full-height two-panel tab, opened from the sidebar — more room for the object list, inline progress, and the restore preview. All the safety guards (read-only block, two-step destructive confirm) are unchanged.

### Syntax-highlighted Query History
The history list is color-highlighted (a lightweight static highlighter — no editor per row). Click any row to expand the full statement, with a **Format** toggle (on by default) that pretty-prints long one-line `ALTER`s. Copy always copies the **verbatim** captured SQL.

### Local table templates
Save reusable column sets — the classic `id` + audit columns (`CreatedDate`, `CreatedBy`, `LastModifiedBy`, `RecordStatus`) — and apply them to a brand-new table or **insert** them into an existing one (PK/FK stripped, name collisions skipped). Templates are **local-only** and **engine-specific** (a MySQL template never lands on a Postgres table) and never touch the database until you commit a normal create/alter. Managed from the new **Templates** button in the sidebar; author via "Save as template" on a new-table draft or a table's columns.

## 🐛 Fixed
- Committing a table-structure change now clears the staged edits — the pending indicator and queued operations no longer linger after a successful commit.
- The release workflow no longer races two publishers, so the auto-update manifest (`latest.yml`) always ships with a release.

## 📦 Install
Grab `krust-studio-app-1.4.0-setup.exe` below. On first run, Windows SmartScreen may warn (app isn't code-signed) → **More info → Run anyway**.

> ⚠️ Personal project, vibe-coded and open-sourced. **Use at your own risk** — always have backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
