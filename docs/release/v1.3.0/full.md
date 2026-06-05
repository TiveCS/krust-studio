This release is all about **picking up where you left off** — your tabs persist across restarts, connections survive idle drops, and the whole app moved to a clean tab-based layout. Plus a built-in **Backup / Restore**, reverse foreign-key navigation, and a custom title bar.

## ✨ Highlights

### 🗂️ Persistent workspace
Your open tabs — and the active one — are now saved **per connection and per database**, and restored after a restart, a disconnect, or switching connections. Krust reopens your last connection on launch, so you land back exactly where you were. (Only *where* you were is saved — entity, view, sub-tab, filters, sort, SQL text, drafts, column widths — never fetched rows or staged edits.)

### 🔌 Connection resilience
Sessions transparently **auto-recover** from idle drops (serverless DBs like Neon, server-side timeouts): Krust reconnects and retries the operation once, so coming back after lunch and clicking a table just works. Reads and transactional GUI writes retry; a raw SQL-editor run reconnects but is **not** silently re-run. Manual **Disconnect / Reconnect** and a connection **status dot** live in the footer menu.

### 💾 Backup & Restore
Export a self-contained, engine-aware `.sql` dump — no `mysqldump` / `pg_dump` needed. Choose **per table** whether to include schema only, schema + data, or skip it; large tables stream, and FK checks are disabled in the dump so it restores regardless of table order. **Restore** runs a **dry-run preview** that flags destructive statements (`DROP` / `DELETE` / `TRUNCATE`) before a two-step confirm, with a stop-on-error toggle. (Sidebar toolbar → backup icon.)

### 🔗 Reverse foreign keys + walkable graph
A new **"Referenced by"** Structure sub-tab shows which tables point *at* the current one. Click a table in **Relations** (outbound) or **Referenced by** (inbound) to jump to its structure and keep walking the FK graph in either direction.

### 🪟 Custom title bar
A themed, frameless title bar with in-app window controls, replacing the native OS frame.

## Also added
- **Everything is a tab** — Query History and the connection editor are now tabs (singletons per connection), not full-screen takeovers.
- **Column search** in the structure editor — filter the column list by name (display-only; your staged edits stay complete).

## 📦 Install
Grab `krust-studio-app-1.3.0-setup.exe` below. On first run, Windows SmartScreen may warn (app isn't code-signed) → **More info → Run anyway**. Existing installs **auto-update** from this release.

> ⚠️ Personal project, vibe-coded and open-sourced. **Use at your own risk** — always have backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
