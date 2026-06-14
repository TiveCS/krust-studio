# 15. Configurable, scope-aware keybindings via a command registry

Date: 2026-06-10

## Status

Accepted

## Context

Until now keyboard shortcuts were ad-hoc: `Ctrl/⌘+P` opens the Command Palette
(a `window` keydown listener in `CommandPalette.tsx`), and the data grid wires
`Ctrl+C/V`, `Delete`, `Space`, `Escape` directly in its local `onKeyDown`. There
is no shared registry, no user configuration, and no settings surface at all.

The user wants a list of shortcuts that is **configurable**, plus several new
ones — commit (`Ctrl+S`), add row (`Ctrl+N`), refresh (`F5`), toggle data⇄
structure (`Ctrl+B`), add filter (`Ctrl+Shift+F`). Crucially these are
**context-scoped**: `Ctrl+S` means "commit" only in a table tab, `Ctrl+N` "add
row" only in the data grid, etc. The same key should be free to mean different
things in different views.

Three forks mattered:

1. **Configurability.** Hardcode each key in its component (fast, but "user-
   configurable" is dropped and revisiting means rewriting every handler into a
   registry), or build a named-**command** registry with default bindings + a
   persisted user-override map.
2. **Scope.** Globally-unique bindings (one key = one command everywhere; simple
   conflict model but burns the keyspace), or **scope-aware** `when`-clause
   bindings (VSCode-style; one key can serve different commands across non-
   overlapping contexts).
3. **Where settings live.** Settings is app-global and must open with no
   connection active, which collides with the everything-is-a-tab model
   (ADR 0012) — a Tab lives inside a per-connection workspace.

## Decision

- **Command registry + user overrides.** Every shortcut-able action is a named
  **Command** (`table.commit`, `table.addRow`, `table.refresh`,
  `table.toggleView`, `filter.add`, …) with a default **Keybinding**. User
  overrides persist in a global `settings.json` in the data dir (main-process
  store + IPC, mirroring `connections.json`). App-global, **not** per-connection.
- **Scope-aware dispatch (`when`-clauses).** Each command declares a context from
  a small fixed set — `global`, `table-tab`, `data-view`, `structure-view`,
  `query-view`. A single central keydown dispatcher resolves the active command
  from the focused tab/view. Two commands conflict only when they share a key
  *and* an overlapping scope; conflict detection in Settings is scoped likewise.
- **Settings is a modal, not a tab.** A large VSCode-style modal reachable from
  the title bar regardless of connection state. This sidesteps the per-connection
  workspace problem without violating "there is no full-area screen that hides
  the tabs" (CONTEXT.md) — a modal isn't a screen and isn't a tab.
- **`Ctrl+S` is unified, not structure-only.** It opens the commit review for
  whatever is staged in the active tab: the DDL preview sheet in structure-view,
  the affected-row dialog in data-view. No-op when nothing is staged.

## Consequences

- The existing `Ctrl+P` listener and the data-grid local keys migrate into the
  registry/dispatcher over time; the dispatcher becomes the single source of
  truth for "what does this key do right now."
- A new global `settings.json` + main-process settings store + IPC is the first
  app-level (non-connection) persisted config. Future preferences land here.
- Scope-aware bindings cost a small amount of context-tracking machinery (the
  dispatcher must know the focused tab kind + view), but keep the keyspace open:
  `Ctrl+N` can later mean something else in `query-view` without a global clash.
- Browser/Electron default keys that collide (`Ctrl+N` new window, `F5` reload)
  must be intercepted in the main process / `webContents` so the app's bindings
  win inside the app window.
- Because bindings are data (registry + overrides), the Settings UI can render
  the list, detect conflicts, and record new chords generically — no per-command
  UI code.

## Amendments

- **2026-06-14** — `table.toggleView` moved from `Ctrl/⌘+B` to `Ctrl/⌘+G`. `Ctrl+B` collided with the shadcn sidebar primitive's built-in collapse shortcut (a hard-coded `window` listener). Rather than leave the sidebar toggle outside the registry, it became a first-class command `sidebar.toggle` (default `Ctrl/⌘+B`, `global` scope); `ui/sidebar.tsx` now reads its key from the keybindings store via `matchesBinding` instead of the literal `"b"`, so it is rebindable and conflict-checked like every other command.
- **2026-06-14** — `filter.add` (`Ctrl/⌘+Shift+F`, `data-view`) was specified in this ADR but never actually added to the command registry; now wired. It signals `FilterBar` through a `store/ui.ts` nonce (`requestAddFilter`) to expand the builder, append an empty condition, and focus the column picker.
