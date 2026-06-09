Structure-editor reliability patch — pending schema edits stick, FK-column drops work, and tabs gained unsaved-change safety.

## 🐛 Fixed

### Staged schema edits no longer vanish on tab switch
Uncommitted structure changes — new or altered columns, staged index add/drop — were held in component-local state and thrown away the moment the tab unmounted on a switch. They now live on the tab itself, alongside the data-grid's staged edits, so switching away and back keeps your pending work. This is in-memory only by design: a restart, disconnect, or connection switch still starts from a clean slate (we never silently re-apply pending writes from a previous session).

### Dropping a foreign-key column no longer errors
Removing a column that backed a foreign key failed on MySQL with "Cannot drop column: needed in a foreign key constraint", because the generated DDL only emitted `DROP COLUMN`. Krust now detects the dependency and emits `DROP FOREIGN KEY` before `DROP COLUMN` in the same transaction — and the full drop chain is shown in the DDL preview before anything runs.

## ✨ Added

### Unsaved-changes indicator + close confirmation
Tabs with uncommitted structure or data edits now show an amber dot, and closing one asks before discarding the work — no more silently losing edits on an accidental close.

### Bulk tab close
Right-click any tab for **Close**, **Close others**, **Close to the right**, and **Close all** (middle-click also closes a tab). Any close that would discard unsaved work confirms first and lists the affected tabs.

## 📦 Install
Grab `krust-studio-app-1.3.4-setup.exe` below. On first run, Windows SmartScreen may warn (app isn't code-signed) → **More info → Run anyway**.

> ⚠️ Personal project, vibe-coded and open-sourced. **Use at your own risk** — always have backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
