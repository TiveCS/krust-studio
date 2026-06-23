Patch release - macOS CI packaging fix and date/datetime cell editors.

## Added

- **Date and datetime picker editing** - table data grid edits now use a native calendar input for `DATE` columns and a native date-time input for `DATETIME` / timestamp-like columns. Picked values are committed as SQL-style literals (`yyyy-mm-dd` / `yyyy-mm-dd hh:mm:ss`).

## Fixed

- **macOS unsigned build packaging in CI** - macOS artifacts now use Electron Builder's built-in ad-hoc signing identity with the required library validation entitlement, replacing the custom signing hook that failed on GitHub Actions.

## Install

Grab the `1.6.4` installer for your OS below. Windows SmartScreen and macOS Gatekeeper may warn because these builds are not publicly notarized/code-signed.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
