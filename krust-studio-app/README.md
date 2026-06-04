# krust-studio-app

The Electron app for **Krust Studio** — a fast, modern SQL database explorer for
MySQL/MariaDB, PostgreSQL, and SQLite. See the [repo root README](../README.md)
for the product overview and the [docs](../docs) for architecture decisions.

- Stack: Electron + electron-vite + React 19 + TypeScript, Tailwind v4 +
  shadcn/ui, CodeMirror 6 (SQL editor). Zero native deps.
- Architecture & conventions: see [`../HANDOVER.md`](../HANDOVER.md).

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

> **Note:** renderer changes hot-reload, but **main/preload changes require a
> restart** (`taskkill /F /IM electron.exe` then `pnpm dev` on Windows).

### Type-check

```bash
$ pnpm typecheck   # node + web; run before declaring a change done
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

The Windows installer (NSIS) lets the user **choose the install location** and
auto-updates from GitHub Releases on launch (see
[ADR 0009](../docs/adr/0009-auto-update-github-releases.md)).

## Releasing (auto-update)

Auto-update pulls from GitHub Releases (`publish` block in
`electron-builder.yml`, repo `TiveCS/krust-studio`). To ship an update:

1. Bump `version` in `package.json`.
2. `pnpm build:win` (and/or mac/linux) — produces the installer **and** the
   `latest.yml` update manifest under `dist/`.
3. Create a GitHub Release tagged `v<version>` and upload the installer +
   `latest.yml` (+ blockmap) as assets.

Running apps check for the new release ~5s after launch, download in the
background, and toast a **Restart now** action when ready.
