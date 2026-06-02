# 4. Frontend stack and UI conventions

Date: 2026-05-28

## Status

Accepted

## Context

Krust's whole reason to exist is modern, compact, data-focused UX (the opposite
of DBeaver/MySQL Workbench) with Beekeeper Studio as the look-and-feel reference.
The stack runs inside Electron (see ADR 0001). Several choices here are
expensive to reverse once the UI is built on them — the data grid especially.

## Decision

- **Package manager:** pnpm (not npm).
- **Build/dev:** electron-vite; **packaging:** electron-builder (chosen for strong
  NSIS support → custom install path requirement).
- **UI framework:** React + TypeScript.
- **Styling:** Tailwind CSS v4 + customized shadcn/ui components.
- **Icons:** lucide.
- **Data grid:** TanStack Table (headless) + TanStack Virtual, styled with
  shadcn/Tailwind. Chosen over AG Grid (heavy, styling fights shadcn, key
  features paywalled) and Glide (canvas, off-aesthetic). Trade-off: inline
  editing/selection must be built by hand.
- **Theme:** dark by default; built on theme tokens (shadcn CSS variables) so a
  light theme is addable later with no color retrofit. Light theme is deferred.
- **Density:** UI is as compact as possible — data is the focus, chrome is
  minimal.

## Dependency policy

Always use the **latest available versions verified from the registry**, not
versions recalled from a model's training cutoff. Pin older only when latest is
genuinely unsupported, and note why. (Tailwind v4 and current shadcn are explicit
examples.)

## Consequences

- TanStack grid means more bespoke grid code (editing, selection, column resize),
  but full control over compactness and no paywall.
- pnpm + electron-vite + Tailwind v4 + shadcn must be wired to play together
  (Tailwind v4's new config model, shadcn's component generation).
- Theme-token discipline required from the first component to keep light-theme
  cost near zero.
- Scaffolding must fetch current latest versions at setup time rather than
  hardcoding.
