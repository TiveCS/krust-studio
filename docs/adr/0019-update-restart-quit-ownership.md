# 19. In-app update restart: let quitAndInstall own the quit

Date: 2026-06-17

## Status

Accepted and verified. Fix shipped in 1.6.5; a real `1.6.5 → 1.6.6` update
downloaded, installed, and relaunched successfully on 2026-06-25.

## Context

The **Restart now** toast sends `update:install` → `autoUpdater.quitAndInstall`
([ADR-0009](0009-auto-update-github-releases.md)). On Windows this consistently
failed: the app closed but **no installer ran**, and reopening showed the old
version.

`quitAndInstall` (electron-updater, NSIS) spawns the **detached** installer
process and then quits the app at its own pace (via `setImmediate`). The
installer waits for the app to exit, installs, and relaunches.

The `update:install` handler had accreted a guard from an earlier fix
(v1.3.3): it force-closed every window with `win.destroy()` before calling
`quitAndInstall`, to stop NSIS from detecting the app as "still running".
Destroying the windows fires `window-all-closed`, whose handler calls
`app.quit()`. That second, unpaced `app.quit()` **races** electron-updater's own
shutdown and exits the process before the installer child finishes detaching —
so nothing installs. Because the cause is in the shutdown code path, it
reproduced on **every** update.

Crucially, v1.3.3 *also* made the NSIS installer `taskkill` any running instance,
which already solves the "app still running" problem the `win.destroy()` was
added for. The destroy is now redundant **and** the trigger for the new race.

## Decision

Let electron-updater own the entire update shutdown:

- The `update:install` handler **no longer destroys windows**. It sets a
  module-level `quittingForUpdate` flag and calls `quitAndInstall(false, true)`.
- `window-all-closed` **returns early when `quittingForUpdate` is set** — it must
  not issue its own `app.quit()` during an update restart. Outside an update, its
  behaviour is unchanged (quit on non-macOS).
- "App still running" detection is left to the installer's own taskkill (v1.3.3),
  not to force-closing windows from the app.

## Consequences

- One source of truth for the update quit (`quitAndInstall`'s paced shutdown),
  removing the race. Normal app-close behaviour is untouched.
- This area has a regression history (v1.3.3 added the destroy, v1.3.4 touched
  the restart path). The flag-guard + the rule *"don't force-quit during an
  update; the installer taskkills"* are recorded here so the `win.destroy()` loop
  is not reintroduced.
- The fix lives in the **installed** binary, so it only takes effect for updates
  *after* a user manually installs a build that contains it. Existing users do
  one manual install regardless; there is no rush-patch advantage to a dedicated
  point release over shipping it in the next minor.
- Verification requires a real packaged update cycle (publish a build, update to
  it from a prior version) — it cannot be reproduced in dev (`is.dev` skips the
  updater).

## Verification

Verified on 2026-06-25 through a real packaged `1.6.5 → 1.6.6` update. The
download completed, **Restart now** launched the installer, 1.6.6 installed, and
the app relaunched on the new version.
