Hotfix patch on v1.3.1 — the title-bar app menu introduced last release was unreachable because the sidebar covered it.

## 🐛 Fixed

### Sidebar covers title bar
The sidebar used `fixed inset-y-0` positioning, anchoring it to the very top of the viewport and overlapping the 32 px title bar. The "Krust Studio ▾" menu — and its **Check for updates** item — was therefore invisible and unclickable. The sidebar now starts at `top-8` (`2rem`) so the title bar is always exposed.

## 📦 Install
Grab `krust-studio-app-1.3.2-setup.exe` below. On first run, Windows SmartScreen may warn (app isn't code-signed) → **More info → Run anyway**. Existing installs **auto-update** from this release.

> ⚠️ Personal project, vibe-coded and open-sourced. **Use at your own risk** — always have backups before editing real data.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
