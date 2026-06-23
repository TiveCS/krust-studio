Patch release focused on getting the macOS CI artifact building again and improving date/time edits in the table data grid.

## Added

### Date and datetime picker editing

The table data editor now uses native browser inputs for date-like columns:

- `DATE`: calendar input, committed as `yyyy-mm-dd`
- `DATETIME` / timestamp-like columns: date-time input, committed as `yyyy-mm-dd hh:mm:ss`

This only changes the editor control. Normal table display still preserves database-style values, and hover tooltips still show readable local and UTC time.

## Fixed

### macOS unsigned build packaging

The previous v1.6.3 release attempt used a custom post-pack signing hook to ad-hoc sign macOS artifacts when Apple Developer credentials were not configured. That hook failed in GitHub Actions before artifacts could be uploaded.

Krust Studio now uses Electron Builder's supported ad-hoc signing configuration (`mac.identity: "-"`) and enables Electron's library validation entitlement for unsigned builds. CI verification still checks the app bundle with `codesign` and catches real Team ID mismatches, while accepting the empty Team ID expected from ad-hoc signatures.

This does not remove the normal macOS unidentified-developer warning. Users may still need to right-click and open manually, but the app should launch after that bypass.

## Install

Grab the `1.6.4` installer for your OS below:

- Windows: `krust-studio-app-1.6.4-setup.exe`
- macOS Apple Silicon: `krust-studio-app-1.6.4.dmg`
- Linux: `krust-studio-app-1.6.4.AppImage` or `.deb`

Windows SmartScreen and macOS Gatekeeper may warn because these builds are not publicly notarized/code-signed.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
