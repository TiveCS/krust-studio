Installer fix — no more "application is running" prompt on manual or auto updates.

## What's new
- **🐛 Installer closes running instance** — the NSIS installer now runs `taskkill` before extracting files, so you no longer need to close Krust Studio manually before running the setup.
- **🐛 In-app "Restart now" race fixed** — windows are destroyed synchronously before handing off to the installer, preventing the same stall on the in-app update path.

## 📦 Install
Grab `krust-studio-app-1.3.3-setup.exe` below. SmartScreen may warn (unsigned) → **More info → Run anyway**. **v1.3.1 users: install manually** — the v1.3.2 auto-update was broken by the same issue this release fixes.

> ⚠️ Use at your own risk — keep backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
