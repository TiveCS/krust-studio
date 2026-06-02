# 6. SQLite via Node's built-in `node:sqlite`, not better-sqlite3

Date: 2026-05-28

## Status

Accepted

## Context

The SQLite driver was first implemented with `better-sqlite3`, a native
(C++) addon. On Windows this immediately hit a wall:

- Native addons are compiled per ABI (`NODE_MODULE_VERSION`). Electron 39 reports
  ABI **140**; the available `better-sqlite3@12.10.0` prebuilt binaries only went
  up to ABI **137**, producing a runtime load error.
- Building from source to get ABI 140 requires a C++ toolchain (node-gyp + VS
  Build Tools) — which the author explicitly will not install (the same reason
  Tauri was rejected in ADR 0001).
- `electron-builder install-app-deps` / `@electron/rebuild` kept resolving the
  wrong ABI, so even the rebuild path was unreliable.

The MySQL and Postgres drivers (`mysql2`, `pg`) are pure JavaScript and have no
such problem — SQLite was the only native dependency.

A smoke test confirmed Electron 39 (Node 22.22.1) ships the built-in
`node:sqlite` module (`DatabaseSync`), which opened a real database file and
queried it with no native addon.

## Decision

Use Node's built-in **`node:sqlite`** (`DatabaseSync`) for the SQLite driver.
Drop `better-sqlite3` entirely.

## Consequences

- **Zero native dependencies** in the whole app. No node-gyp, no prebuilds, no
  `electron-rebuild`, no ABI mismatches on any future Electron/Node bump. This is
  the decisive win for a no-toolchain, low-maintenance project.
- `node:sqlite` is marked experimental in Node 22 (prints an ExperimentalWarning;
  works without a flag). API is close to better-sqlite3 (`prepare().get/all/run`),
  so the driver code is similar.
- The `DatabaseSync` constructor creates a file if missing, so the connection
  *test* path explicitly checks `existsSync` first to fail on a bad path.
- If a future need exceeds `node:sqlite` (e.g. extensions, custom build), revisit
  — but only with a pure-JS/WASM option, never reintroducing a compiled addon
  unless the toolchain constraint changes.
