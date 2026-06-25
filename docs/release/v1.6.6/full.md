# Krust Studio 1.6.6

SQL formatting and update-path validation.

## Added

### Format SQL

Query tabs now include **Format SQL** with the `Shift+Alt+F` shortcut. Formatting
uses the active connection's dialect:

- MySQL / MariaDB → MySQL
- PostgreSQL → PostgreSQL
- SQLite → SQLite

Formatting rewrites the editor text as a normal undoable edit. Invalid SQL is
left untouched and reports an error.

### Pretty DDL

Structure → DDL and generated DDL review now have a display-only **Pretty**
toggle. This never changes the SQL that Krust copies, executes, captures in
History, or exports through Changesets.

## Fixed

### In-app restart-to-update verified

A real `1.6.5 → 1.6.6` update downloaded, installed, and relaunched
successfully. This confirms the `quitAndInstall` shutdown-race fix shipped in
1.6.5.

## Install

Grab the `1.6.6` installer for your OS below:

- Windows: `krust-studio-app-1.6.6-setup.exe`
- macOS Apple Silicon: `krust-studio-app-1.6.6.dmg`
- Linux: `krust-studio-app-1.6.6.AppImage` or `.deb`

Windows SmartScreen and macOS Gatekeeper may warn because these builds are not
publicly notarized/code-signed.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
