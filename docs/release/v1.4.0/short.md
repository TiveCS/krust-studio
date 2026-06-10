Feature release — faster grids, easier schema edits, nicer history, reusable templates.

## What's new
- **⚡ Virtualized data grid** — only visible rows render; large tables scroll smoothly.
- **🔗 Drop relations from the Relations tab** — staged like any schema edit; dropping an FK-backing index warns and offers "drop both / index only".
- **🗄️ Backup & Restore as a tab** — roomy two-panel view instead of a modal (sidebar button).
- **🎨 Highlighted Query History** — color-highlighted rows; click to expand the full statement with a Format toggle. Copy stays verbatim.
- **📋 Local table templates** — save column sets (id + audit columns) and apply to a new table or insert into an existing one. Local-only, engine-specific.

## 🐛 Fixed
- Committing a structure change now clears staged edits.
- Release workflow always ships `latest.yml` (auto-update fix).

## 📦 Install
Grab `krust-studio-app-1.4.0-setup.exe` below. SmartScreen may warn (unsigned) → **More info → Run anyway**.

> ⚠️ Use at your own risk — keep backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
