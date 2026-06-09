Installer fix patch — v1.3.1 and v1.3.2 users should install manually via the setup below.

## 🐛 Fixed

### Installer "application is running" error
Running the NSIS setup while Krust Studio was open (or had a lingering background process) caused the installer to stall with a "please close the application" dialog. A custom NSIS hook now runs `taskkill /F /IM krust-studio-app.exe /T` before file extraction begins — the installer closes the app itself, so you never have to.

### In-app "Restart now" race condition
When clicking **Restart now** in the update toast, `quitAndInstall()` could spawn the NSIS installer before `app.quit()` fully drained the Electron process, hitting the same "running" check. All windows are now destroyed synchronously first, then `quitAndInstall(false, true)` is called — the process is gone before NSIS starts.

## 📦 Install
Grab `krust-studio-app-1.3.3-setup.exe` below. On first run, Windows SmartScreen may warn (app isn't code-signed) → **More info → Run anyway**.

**v1.3.1 users: please install manually.** The v1.3.2 auto-update path was affected by the same installer issue this release fixes, so auto-update from v1.3.1 may not complete cleanly.

> ⚠️ Personal project, vibe-coded and open-sourced. **Use at your own risk** — always have backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
