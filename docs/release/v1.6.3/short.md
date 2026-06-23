Patch release - macOS launch fix and date/datetime display cleanup.

## Fixed

- **macOS unsigned DMGs can launch after manual Gatekeeper bypass** - CI now ad-hoc signs the full `.app` bundle when Apple Developer ID credentials are absent, and verifies that the main executable and Electron Framework do not have mismatched Team IDs.
- **Date and datetime cells preserve database-style values** - grid cells, FK picker cells, copy text, filter-by-value, edit drafts, and review dialogs now show SQL-style literals (`yyyy-mm-dd` / `yyyy-mm-dd hh:mm:ss`) instead of UTC ISO strings. Hover still shows readable local and UTC time.

## Install

Grab the `1.6.3` installer for your OS below. Windows SmartScreen and macOS Gatekeeper may warn because these builds are not publicly notarized/code-signed.

**Full changelog:** https://github.com/TiveCS/krust-studio/blob/main/CHANGELOG.md
