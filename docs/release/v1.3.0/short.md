Pick up where you left off — persistent tabs, resilient connections, and a clean tab-based layout. Plus built-in Backup / Restore and reverse-FK navigation.

## What's new
- **🗂️ Persistent workspace** — open tabs saved per connection *and* per database, restored after restart / disconnect / switching connections. Reopens your last connection on launch.
- **🔌 Connection resilience** — idle drops (Neon, server timeouts) auto-recover: reconnect + retry once, so clicking a table after a break just works. Manual Disconnect / Reconnect + a status dot in the footer.
- **💾 Backup & Restore** — self-contained engine-aware `.sql` dump (per-table schema/data, no `mysqldump`/`pg_dump`). Restore with a dry-run preview that flags `DROP`/`DELETE`/`TRUNCATE` before a two-step confirm.
- **🔗 Referenced by + walkable FK graph** — new Structure sub-tab for inbound FKs; click to walk relations in either direction.
- **🪟 Custom title bar** + **everything-is-a-tab** (history & connection editor are tabs) + **column search** in the structure editor.

## 📦 Install
Grab `krust-studio-app-1.3.0-setup.exe` below. SmartScreen may warn (unsigned) → **More info → Run anyway**. Existing installs auto-update.

> ⚠️ Use at your own risk — keep backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
