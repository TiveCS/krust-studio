# Krust Studio 1.7.0-beta.6

Continues the AI/MCP beta line. The agent can now **propose row changes** and
**read your query history** — both still default-deny, both still staged for you
to approve. Data-changeset auto-attach becomes **configurable per connection**.
**Opt in via Settings → Updates.**

## AI can propose row changes (ADR-0024)

- **New `propose_data_changes` tool.** An agent can stage `INSERT` / `UPDATE` /
  `DELETE` for a connection. Nothing runs: the changes land in the **AI
  Proposals** tab with their SQL and an affected-row estimate, and you Commit,
  Export, or Dismiss. The AI still never writes the database.
- **Targeted by predicate, not primary key.** A proposed change says
  `WHERE code = 'ACME'`, not `WHERE id = 7`. That is deliberate — the exported
  `.sql` is usually run against a *different* database than the one it was
  drafted on, where surrogate keys don't line up but a business identifier does.
  It also keeps the handoff readable: one set-based `UPDATE` instead of eight
  hundred key-scoped ones.
- **Per-table, per-verb permission.** Settings → AI / MCP now grants writes per
  table *and* per verb — `orders` can be update-only while `products` allows full
  CRUD and `users` stays read-only. Default-deny, as with reads. A table is never
  writable without being readable.
- **Whole-table writes are refused outright.** The predicate is required and
  non-empty and there is no `TRUNCATE` verb, so an agent cannot even *stage* a
  `DELETE FROM orders`. Those stay in the UI, behind the typed confirmation.
- **Committed changes land in history** as **Data Mutation**, tagged with a new
  `ai` source alongside `gui` and `manual`.

## AI can read history

- **New `read_history` and `list_changesets` tools**, behind their own
  per-connection grant (off by default). An agent can see what SQL Krust has run
  here, which changesets exist, what's in one, and what's sitting in Unassigned.
- **Redact list.** History stores statements with their values written in, so it
  can show data your read allowlist would hide. Name tables (globs work) whose
  **statement text is withheld** — the entry still appears with its table, time,
  row count and destructive flag, so the agent sees *that* something changed
  without seeing *what to*.

## Auto-attach is configurable per connection

- Each connection now chooses which row changes get collected into its active
  **Data changeset**: **INSERT**, **UPDATE**, **DELETE**, all on by default.
- A separate **"Also collect whole-table wipes"** toggle (off by default) covers
  `TRUNCATE` and `DELETE`/`UPDATE` written without a `WHERE`. Left out by default
  so an accidental one can't ride silently into a script DevOps runs on
  production.
- Anything not collected still appears in history — it goes to **Unassigned** and
  you can add it by hand. Nothing is ever lost.
- **Existing connections keep their current behaviour** and carry on collecting
  all three verbs; you don't have to go and re-tick anything after updating.

## Also in this build

- **"Schema Sync" tab is now "AI Proposals"**, holding both schema and data
  proposals. Schema Sync still names the workflow (reconciling a code model
  against the live DB) — the tab is just where its output lands now.
- **Proposals survive a restart.** They used to live in memory and vanish on
  quit, which is a poor fit for an agent working while you're away; they're now
  stored with your history and survive quit, crash, and an auto-update restart.
- **Read-only connections** behave as before: Commit is blocked, Export still
  works — draft against prod, hand the `.sql` over.
- **Bug fix:** statements captured through the grid's apply path were never
  checked for the destructive flag. Harmless while every grid edit was key-scoped,
  but wrong once predicate-based changes exist.

## Your existing history is untouched

Every storage change in this release is additive — no row is rewritten, no column
removed. An existing `history.db` upgrades with nothing lost, and an older build
can still open the file afterwards. This was checked against a real 250-row
pre-1.7.0 history file, including the older single-active-changeset layout.

## Verification still needed

The new tools build clean, and the migration, the auto-attach rules and the
generated SQL were each checked against a real SQLite database. **What has not
happened yet is a live run**: a real agent proposing row changes against a real
MySQL/Postgres connection, committing them, and the result landing in the right
changeset. Treat the write path as unproven until that's done, and please report
through the 1.7.0-beta tracking issue.

Known gaps: history's new `ai` source is stored and queryable but not yet
filterable in the History view UI, and proposals belonging to a deleted
connection aren't cleaned up automatically.
