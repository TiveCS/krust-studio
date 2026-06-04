# 9. Auto-update via GitHub Releases

Date: 2026-06-03

## Status

Accepted

## Context

Krust Studio ships as a desktop binary the author installs on their own
machines. Manually downloading and reinstalling each new version is friction the
author wants gone ("lazy to download and install manually"). `electron-updater`
was already a dependency; the only question was the update source and how
aggressive the update flow should be.

Options for the publish provider: a self-hosted generic server (the
electron-vite template default, pointing at a placeholder URL), an S3 bucket, or
**GitHub Releases**. The app is already open-sourced on GitHub
(`TiveCS/krust-studio`) and releases are published there, so GitHub Releases
needs no extra infrastructure, auth, or hosting cost.

A complication: the app is **not code-signed** (see README). On Windows an
unsigned auto-update can download but the OS may warn on the relaunch; on macOS
unsigned/un-notarized auto-install is unreliable.

## Decision

- Use the **GitHub provider** in `electron-builder.yml` (`owner: TiveCS`,
  `repo: krust-studio`). The build emits `latest.yml` (+ blockmap) as the update
  manifest alongside the installer; both are uploaded to a `v<version>` GitHub
  Release.
- Wire `autoUpdater` in the main process: check ~5s after the window is shown,
  `autoDownload` in the background, `autoInstallOnAppQuit`. Errors are swallowed
  (logged, never crash the app over a failed update check).
- The renderer is notified via `update:available` / `update:downloaded` IPC and
  shows non-blocking toasts; a persistent **Restart now** toast sends
  `update:install` → `quitAndInstall`.
- Auto-update is **skipped in dev** (`is.dev` guard) — there is no release server
  to hit and it would error on every launch.

## Consequences

- Releasing is a manual GitHub step: bump `package.json` version, build, create
  a tagged Release, upload installer + `latest.yml`. No CI publish pipeline yet.
- Because the app is unsigned, the relaunch-to-update step may still show an OS
  warning; the download/notify flow works regardless, install just needs the
  same "Run anyway" the first install needed. Signing would smooth this and is
  the obvious future upgrade.
- Update enforcement is "soft": the user is prompted, never forced. Consistent
  with the app's overall *automate for convenience, never force* value.
- The provider is coupled to the GitHub repo slug. If the repo moves, the
  publish block **and** in-flight clients' update feed must be updated.
