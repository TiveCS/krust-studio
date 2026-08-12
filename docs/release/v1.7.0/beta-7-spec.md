# 1.7.0-beta.7 — MCP settings hotfix + `list_tables`

Scope for the `1.7.0-beta.7` prerelease on `feat/v1.7.0`. Two dead-checkbox
fixes found in beta.6, two usability changes to the MCP settings surface, and
one new read-only MCP tool. No tag is pushed as part of this work; `1.7.0`
final is cut manually once the beta is verified.

## 1. Per-connection auto-attach checkboxes do nothing

**Symptom.** In Settings → AI / MCP → a connection card → *Auto-attach to Data
changeset*, clicking a verb checkbox (or *Also collect whole-table wipes*)
leaves the box in its previous state. Nothing visibly happens.

**Cause.** `DataAttachEditor` (`src/renderer/src/components/McpSettings.tsx`)
holds no state of its own. Both `verbs` and `unscoped` are derived on every
render from the `conn` prop, and `persist()` writes through
`window.api.connections.save` without ever refreshing the `connections` array
that `McpSettings` loaded once in `refresh()`. The write reaches disk; the UI
never repaints, so the control reads as inert. A rejected `save` is also
swallowed — `persist` discards the returned promise.

**Fix.**

- Hold `dataAttachVerbs` / `dataAttachUnscoped` in local state seeded from the
  prop, so a click flips the box immediately.
- Await `connections.save` and lift its returned `ConnectionSummary` into the
  parent's `connections` array, so reopening Settings shows the saved value and
  other panels see the same connection record.
- On a failed save, roll the local state back to its previous value and raise an
  error toast.

## 2. Global destructive-DDL toggle does nothing

**Symptom.** Settings → History → *Auto-attach destructive DDL to the active
changeset* renders as checked and never toggles. Observed on the packaged
`v1.7.0-beta.6` build. Other checkboxes in the same modal work.

**Cause.** `SettingsModal.tsx` initialises `autoAttachDestructive` to `null` and
renders `checked={autoAttachDestructive ?? true}` with
`disabled={autoAttachDestructive === null}`. If
`window.api.history.getAutoAttachDestructive()` rejects — there is no `.catch` —
the state stays `null` forever, which renders the checkbox as *checked and
disabled*. That is exactly the reported symptom, and the disabled styling
(`opacity-50` on a small filled box) is easy to miss.

The underlying IPC failure is unconfirmed; no console capture was available. The
fix therefore targets the whole class rather than one suspected cause, and makes
any remaining failure visible instead of silent.

**Fix.**

- `.catch` the read and fall back to the documented default (on), so a rejection
  can never leave the control disabled.
- Remove the `null`-means-disabled construction; the checkbox is always driven by
  a boolean.
- Await the write, roll back and toast on failure.

**Why it matters.** The toggle governs whether `DROP TABLE` / `DROP VIEW` attach
to the active changeset. Stuck on, destructive DDL keeps being collected with no
way to opt out, and an exported `.sql` handed to DevOps can carry drops that were
never meant to ship.

## 3. Collapsible per-connection cards

Per-connection grant cards become an accordion. The rest of the MCP tab (port and
token, client setup, notify-on-proposal, recent AI access) is unchanged.

- Built on `Accordion` from the already-installed `radix-ui` package, wrapped as
  `src/renderer/src/components/ui/accordion.tsx` in the same style as the other
  shadcn-derived primitives.
- Multiple cards may be open at once.
- Expanded state is not persisted: opening Settings always starts with every card
  closed. Persisting it would quietly reintroduce the wall of checkboxes this
  change exists to remove.
- Collapsed header shows connection name, driver badge, the read-only badge where
  it applies, and a summary of what is granted — for example `schema · rows`,
  `history`, or `no access`. The default-deny posture has to stay legible while
  the card is shut.

## 4. Changeset name becomes a creatable combobox

Both changeset fields in `AiProposalsView.tsx` — the data proposal header and the
schema proposal header — move from a free-text `Input` to the existing
`ui/combobox.tsx` with `creatable` enabled.

- Options come from `window.api.history.listChangesets(connectionId)`, filtered to
  the proposal's own kind (`data` or `schema`). Kinds never mix, per ADR-0023.
- The active changeset for that connection and kind is marked.
- Exported changesets are listed and marked as exported, and remain selectable —
  appending to a shipped changeset stays possible as a deliberate act.
- The agent's suggested `changesetName` still prefills the field.
- An empty field still means "the active changeset", unchanged.
- Typing a name that does not exist still creates it. No main-process change is
  needed: `resolveChangesetFor` (`src/main/store/history.ts`) already resolves an
  exact name to an existing changeset or creates one.

## 5. New MCP tool: `list_tables`

**Motivation.** Comparing which tables exist between two connections — for
example a staging database against a dev audit database — currently requires
`introspect_schema`, which returns full structure for every table and demands the
introspection grant on both connections.

**Contract.**

```
list_tables(connectionId) -> { tables: [{ name, schema, type }] }
```

- `type` distinguishes `table` from `view`. `schema` is present where the engine
  has one (PostgreSQL); omitted otherwise.
- One connection per call. An agent comparing two connections calls it twice and
  diffs the results itself.
- No row data, no counts, no columns.

**Authorisation.** The connection must have at least one MCP grant of any kind —
the same visibility rule `list_connections` already applies. The introspection
grant is *not* required. A connection with no grants at all remains invisible, so
default-deny still holds at the connection boundary; this only loosens which
capability lets an agent read names. See the ADR-0022 amendment below.

**Filtering.** The connection's `introspectExcludes` globs still hide tables from
this tool. Those globs are an explicit instruction from the user, and a tool that
ignored them would be a surprise.

**Implementation.** Built on the existing `listEntities` catalog call
(`src/main/db/session.ts`), reusing `isExcluded` from `src/main/mcp/introspect.ts`.
Logged to the AI Access Audit under its own tool name, so a name listing is
distinguishable from a full structure dump at a glance.

## Documentation

- `CHANGELOG.md` — a `1.7.0-beta.7` entry.
- `docs/release/v1.7.0/mcp-status.md` — add `list_tables` to the tool surface.
- `docs/adr/0022-mcp-schema-sync-proposed-ops.md` — amend to record that
  `list_tables` reads under any grant rather than the introspection grant, since
  that is a deliberate loosening of the documented default-deny rule.

## Release

Bump `package.json` to `1.7.0-beta.7` and commit to `feat/v1.7.0`. The tag is not
pushed from this work; `release.yml` runs when the tag is pushed manually.
