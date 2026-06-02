# 1. Electron over Tauri for the desktop shell

Date: 2026-05-28

## Status

Accepted

## Context

Krust Studio is a desktop SQL explorer. The motivating pain was that existing
tools feel "clunky and heavy." Investigation clarified that the target of that
complaint is the old Java/Swing generation (DBeaver, MySQL Workbench) — not
Electron apps like Beekeeper Studio, which the author considers acceptably light
and modern.

Two stacks were considered seriously:

- **Tauri** (Rust backend + system webview): ~10MB binaries, low RAM. But the
  author reports worse platform compatibility and, decisively, it requires
  installing C++ build tooling on Windows — which the author will not do.
- **Electron** (Node backend + bundled Chromium): heavier baseline
  (~100–150MB install, ~150–300MB idle RAM), but trivial to build, best-in-class
  UI ecosystem (AG Grid, Monaco), and Node DB drivers (`mysql2`, `pg`) are dead
  simple. Vibe-coding friendly (TypeScript end to end).

## Decision

Use **Electron**. The "heavy" pain is not about Chromium overhead; it is about
dated UX. Electron + a modern UI stack solves the real problem, while avoiding
the Tauri toolchain friction the author refuses to take on.

## Consequences

- Accept Electron's RAM/disk baseline as a non-goal to optimize.
- All logic (DB drivers, query exec) lives in Node — no Rust layer.
- Installer must support a **custom install location** and a **configurable
  settings/data directory** (not hard-locked to `%AppData%`).
- If footprint ever becomes the dominant concern, this is the expensive decision
  to revisit — the UI would port to a Tauri webview but the Node DB layer would
  need rewriting in Rust.
