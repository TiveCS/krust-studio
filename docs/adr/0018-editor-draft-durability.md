# 18. Editor draft durability — explicit-tabId flush

Date: 2026-06-17

## Status

Accepted — design resolved via `/grill-with-docs`. Refines
[ADR-0012](0012-tab-centric-persistent-workspace.md).

## Context

SQL pasted into the query editor disappeared if the user switched to another tab
and came back. ADR-0012 promises "SQL text" survives a tab switch (and a
restart); this was a regression against that promise.

Root cause is a layering interaction:

- For keystroke performance the editor keeps the live SQL in a **ref**
  (`sqlRef`), not in the store — typing must not re-render the results pane on
  every character. The store's `query.sql` is therefore only written on **Run**
  and on a **flush-on-unmount** effect.
- `setQuerySql` resolved its target tab from the **current `activeTabId`**, like
  every other store setter. But the unmount flush fires *because* `activeTabId`
  has **already moved** to the new tab. So the flush wrote the pasted SQL into
  the wrong tab — or no-op'd when the new tab had no query state. On switching
  back, the tab remounted from a stale, empty `query.sql`.

Two distinct loss windows exist:

1. **Tab switch** — the mis-targeted flush above (the reported bug).
2. **App quit** — pre-existing and broader. `scheduleWorkspaceSave` debounces
   800ms and there is no flush on quit (`window-all-closed` → `app.quit()`
   immediately; no `beforeunload`). A change made <800ms before quit never
   reaches disk. And on an abrupt quit React may never unmount the editor, so the
   `sqlRef → store` flush never runs either — the SQL is not even in the store
   before any disk write.

The general hazard: **a store write that can fire after its originating tab is no
longer active must not resolve its target from `activeTabId`.** QueryView is the
only view that *defers* its write (the perf ref) — every other tab view
(`StructureView` draft, `DataGrid` staged edits, raw-WHERE) writes through to the
tab *by id while the tab is active*, so none of them can mis-target. This is why
QueryView alone broke.

## Decision

**Invariant — deferred writes name their tab.** `setQuerySql` takes an explicit
`(tabId, sql)`; it never consults `activeTabId`. Every flush path passes the
query tab's id captured at mount. `setQueryAutoLimit` stays `activeTabId`-based —
it only fires from a click while the tab is active, never deferred.

**Layer 2 — editor buffer → store (`query.sql`), defense in depth, all explicit
tabId:**

- **Blur flush** — flush `sqlRef → store` when the editor loses focus. Clicking
  another tab, Alt-Tab, and window-close all blur the editor first, so this
  catches the cases unmount and the debounce miss, cheaply, without re-rendering
  on keystrokes. (Needs an `onBlur` prop on `SqlEditor`, wired to CodeMirror
  `domEventHandlers({ blur })`.)
- **Live debounced write** (~250ms idle) — covers "paste, then sit on the tab"
  where no blur/unmount occurs.
- **Unmount flush** — the normal tab-switch path, now correctly targeted.

**Layer 1 — store → disk:**

- A **`beforeunload`** handler clears the pending `_saveTimer` and builds + saves
  the workspace immediately (best-effort async, via the existing
  `workspace.save` IPC).

## Considered alternatives

- **Keep `activeTabId`, cancel + flush on unmount only.** Rejected: leaves the
  debounce path able to mis-target if it ever fires after a fast switch, and
  keeps two timing-coupled code paths. The explicit-tabId invariant removes the
  race by construction.
- **Drop the keystroke ref, write to the store on every change.** Rejected:
  re-introduces the per-keystroke re-render the ref exists to avoid.
- **Synchronous IPC on quit** (`ipcRenderer.sendSync`) for a hard disk
  guarantee. Rejected for now: sync IPC is generally discouraged, and the
  blur/debounce/unmount flushes already land the SQL in the store before quit, so
  the residual disk window is small.
- **Main-process `before-quit` → `preventDefault()` → pull workspace from
  renderer → write → re-quit.** The most robust quit guarantee, but more moving
  parts (re-entrancy guard, cross-process pull). Held as the fallback if the
  async `beforeunload` save proves unreliable on quit.

## Consequences

- `setQuerySql`'s signature changes; three call sites update (run, explain,
  unmount flush). `SqlEditor` gains an `onBlur` prop.
- A new user-facing guarantee, now reflected in CONTEXT (Query Execution /
  Workspace & Tabs): unsaved editor SQL survives tab switches and app quit, not
  only after Run.
- The explicit-tabId rule is a reusable guard: any future deferred/async tab
  write should follow it rather than reading `activeTabId`.
