A small fix-and-polish patch on top of v1.3.0 — better structure editing on wide tables, plus a manual update check.

## 🐛 Fixed

### Structure editor scroll
Tables with many columns no longer overflow behind the commit bar. The column list now scrolls within its own area and the footer stays put.

## 🔧 Changed

### Add column moved to the footer
**Add column** now sits bottom-left next to **Commit / Discard**, so you don't have to scroll to the end of a long column list to add one. Adding a column also clears any active column filter so the new row is visible.

### Check for updates (manual)
A title-bar app menu — **Krust Studio ▾ → Check for updates** — tells you whether you're up to date or starts the download if a newer version is out (in addition to the automatic check on launch).

## 📦 Install
Grab `krust-studio-app-1.3.1-setup.exe` below. On first run, Windows SmartScreen may warn (app isn't code-signed) → **More info → Run anyway**. Existing installs **auto-update** from this release.

> ⚠️ Personal project, vibe-coded and open-sourced. **Use at your own risk** — always have backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
