Structure-editor fixes — your pending schema edits stick around, and FK-column drops work.

## What's new
- **🐛 Staged schema edits survive tab switches** — adding/altering columns or indexes and switching tabs no longer wipes your uncommitted changes. (Still in-memory: a restart starts clean.)
- **🐛 Dropping a foreign-key column works** — the DDL now drops the FK before the column, so MySQL no longer rejects it with "needed in a foreign key constraint".
- **✨ Unsaved-changes dot + close confirm** — dirty tabs show an amber dot and ask before discarding work.
- **✨ Bulk tab close** — right-click for Close / others / right / all (middle-click closes too); confirms if any tab has unsaved work.

## 📦 Install
Grab `krust-studio-app-1.3.4-setup.exe` below. SmartScreen may warn (unsigned) → **More info → Run anyway**.

> ⚠️ Use at your own risk — keep backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
