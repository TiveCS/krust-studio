Patch release focused on making the macOS artifact runnable without paid Apple signing and preserving database-style date/time values in the table explorer.

## Fixed
### Date and datetime display

`DATE` / `DATETIME` values in the table explorer could appear as JavaScript ISO strings such as `2026-06-16T17:00:00...`, which made date-only columns look like shifted datetimes.

Krust Studio now renders Date-like values as database-style literals in the visible table UI:

- `DATE`: `yyyy-mm-dd`
- `DATETIME` / timestamp-like values: `yyyy-mm-dd hh:mm:ss`
- millisecond precision is preserved when present

The same literal formatting is used for the main grid, FK picker, copy text, filter-by-value, edit drafts, and commit review text. Hover tooltips still expose readable local and UTC time.

## Install

Grab the `1.6.3` installer for your OS below:

- Windows: `krust-studio-app-1.6.3-setup.exe`
- macOS Apple Silicon: `krust-studio-app-1.6.3.dmg`
- Linux: `krust-studio-app-1.6.3.AppImage` or `.deb`

Windows SmartScreen and macOS Gatekeeper may warn because these builds are not publicly notarized/code-signed.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
