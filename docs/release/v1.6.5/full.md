Patch release adding the ability to open and save `.sql` files directly from the SQL editor.

## Added

### Open / save `.sql` files

You can now move SQL between files and Krust's editor:

- **Open SQL file…** - in the tab bar (button) or the tab right-click menu. Opens an OS file dialog and loads the chosen `.sql` into a new query tab. The filename shows as the tab title.
- **Save .sql** - in the editor toolbar. Writes the current editor SQL to a `.sql` file via a save dialog (defaults to the opened filename, else `query.sql`).

Opening is a **one-shot import**: the file's text seeds the tab, but the tab is not linked to the file. Editing the tab never changes the file on disk, and saving always goes through an explicit save dialog. A file-backed editor (live path, Ctrl+S write-back, dirty-vs-file tracking) is deferred to a later release.

## Install

Grab the `1.6.5` installer for your OS below:

- Windows: `krust-studio-app-1.6.5-setup.exe`
- macOS Apple Silicon: `krust-studio-app-1.6.5.dmg`
- Linux: `krust-studio-app-1.6.5.AppImage` or `.deb`

Windows SmartScreen and macOS Gatekeeper may warn because these builds are not publicly notarized/code-signed.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
