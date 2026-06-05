# Krust Studio

A fast, modern desktop SQL database explorer — the Beekeeper-Studio kind of
experience, without the paywall, and nothing like the heavy old Java tools.

Browse, query, and edit **MySQL / MariaDB, PostgreSQL, and SQLite** from one
clean, keyboard-friendly app. Its standout trick: **every change you make through
the UI shows you the exact SQL it ran** — and your schema changes can be grouped
into a clean `.sql` script to hand to whoever runs production.

> ⚠️ Personal project, vibe-coded and open-sourced. **Use at your own risk** — no
> warranty, no support guarantee. Always have backups before editing real data.

---

## Download & install

Grab the latest installer for your OS from the
[**Releases**](https://github.com/TiveCS/krust-studio/releases) page.

| OS | File |
|----|------|
| **Windows** | `krust-studio-app-<version>-setup.exe` |
| **macOS** (Apple Silicon) | `krust-studio-app-<version>.dmg` |
| **Linux** | `krust-studio-app-<version>.AppImage` or `.deb` |

On **Windows** the installer lets you **choose the install folder** (no forced
`Program Files` lock-in), and the app **auto-updates** from GitHub Releases:
new versions download in the background and prompt you to **Restart now** when
ready.

The app is **not code-signed**, so your OS may warn the first time:

- **Windows** — SmartScreen: click **More info → Run anyway**.
- **macOS** — right-click the app → **Open** (or run
  `xattr -dr com.apple.quarantine /Applications/krust-studio-app.app`).
  Builds are Apple-Silicon only for now.
- **Linux** — AppImage: `chmod +x krust-studio-app-*.AppImage` then run it; or
  install the `.deb` with `sudo dpkg -i krust-studio-app_*.deb`.

---

## Getting started

1. **Add a connection** — bottom-left connection switcher → *New connection*.
   Pick a driver, fill host/port/user/password (or a file path for SQLite).
   - Passwords are **encrypted at rest** with your OS keychain — never stored in
     plain text.
   - The **database name is optional** — leave it empty to connect at the server
     level and **browse all databases**, switching between them from the sidebar
     header (MySQL & PostgreSQL).
   - Tick **Read-only** for production: it blocks *every* write (data and schema)
     at the core, not just in the UI.
2. **Open it** — the sidebar fills with your tables, views, and enums.
3. **Double-click a table** to browse its data — or hit **Ctrl/⌘+P** to search
   and jump to any table on the connection.

Your connections, query history, and changesets live in a local folder
(`%AppData%/KrustStudio` on Windows; the equivalent app-data dir elsewhere).

---

## What you can do

### Browse data
- Multi-column **sort** (click a header; Shift-click to add more).
- A real **filter builder**: bracketed groups with AND/OR, plus `=, ≠, <, >,
  LIKE, IN, BETWEEN, IS NULL`. Right-click a cell → **Filter by this value**.
- Pagination with page-size and an on-demand total row count.
- Color-coded cells (booleans, numbers, JSON, timestamps) — hover a timestamp to
  see it in **your local time and UTC**.
- **Export** the page, your selection, or every matching row to **CSV / JSON**
  (copy or save to a file).

### Edit safely (nothing writes until you say so)
- Edits, inserts, and deletes are **staged and highlighted**, not applied live.
- Hit **Commit** to get a **review dialog** showing exactly what will change, then
  it runs in **one transaction** (rolls back on error). Discard throws it away.
- **Fill a whole selection** with one value, set cells to **NULL** explicitly,
  copy/paste ranges.
- For foreign-key columns, a **picker** lets you search the parent table and pick
  the right row instead of memorizing IDs. Enum columns edit via a dropdown of
  their allowed values.

### Inspect
- A **JSON view** of the selected row (Space bar) — nested JSON expands, and
  foreign keys expand the linked record **inline**, as deep as you want.
- A **Structure** tab per table: columns, indexes, relations, **"Referenced by"**
  (which tables point *at* this one), and the real **CREATE statement**.
- **Walk the foreign-key graph** — click a table in *Relations* (outbound) or
  *Referenced by* (inbound) to jump to its structure and keep walking either way.
- Follow a foreign key to open the related table, filtered to that record.

### Write SQL
- A real **SQL editor** (CodeMirror) with syntax highlighting and **schema-aware
  autocomplete** — table names, plus columns for tables referenced in your query
  (resolving `AS` aliases).
- Autocomplete and quoting are **engine-aware**: backtick identifiers on
  MySQL/MariaDB, double-quote on Postgres/SQLite.
- Run the whole script or just the selection (**Ctrl/⌘+Enter**); each statement
  gets its own result panel. Optional **auto-LIMIT 500** — and when it's applied
  the result header shows the *actual* SQL that ran (`… LIMIT 500`).
- Long-running queries can be **cancelled**. The editor / results split is
  **drag-resizable**.

### Search & navigate
- **Ctrl/⌘+P** opens a command palette to fuzzy-search every table/view on the
  current connection and open it in a tab.
- Switch the **active database** from the sidebar header without re-adding the
  connection.

### Change schema — and see the SQL
- Add / rename / drop columns; edit defaults and auto-increment; **reorder
  columns** by drag (MySQL); add / drop **indexes** (engine-aware method picker).
- **Everything stages first.** Column edits and index add/drop are pending,
  **colour-coded** (green = new, amber = changed, red = dropped, blue = moved),
  and committed **together in one batch** — never on click.
- **Review before it runs.** Commit opens a panel showing the **exact DDL** that
  will execute (generated without running it); you confirm, then it runs in a
  transaction. No hidden mutations.
- On MySQL, edits use a faithful `MODIFY` that **preserves** what you didn't
  touch (auto-increment, collation, comment), and new columns keep their position
  (`AFTER`).
- Create, rename, **truncate**, or **drop** tables (destructive actions require
  you to type the name to confirm).
- On wide tables, **filter the column list** by name in the structure editor
  (display-only; your staged edits stay complete).

### Back up & restore
- **Export a self-contained `.sql` dump** — no `mysqldump` / `pg_dump` install
  needed. Choose **per table** whether to include schema only, schema + data, or
  skip it; optionally add `DROP … IF EXISTS`. Large tables stream, and the dump
  disables FK checks so it restores regardless of table order.
- **Restore** a dump with a **dry-run preview** that flags destructive
  statements (`DROP` / `DELETE` / `TRUNCATE`) before a two-step confirm, with a
  stop-on-error toggle. (Read-only connections block restore.)

### Stay where you left off
- **Your tabs are remembered** — per connection *and* per database. Restart the
  app, disconnect, or switch connections, and you land back on the same open
  tabs (with their filters, sort, SQL text, and column widths). The app reopens
  your last connection on launch.
- **Everything is a tab** — data browsers, the SQL editor, Query History, and the
  connection editor; no full-screen mode that hides your work.
- **Resilient connections** — idle drops (serverless DBs, server timeouts)
  auto-recover: Krust reconnects and retries once so clicking a table after a
  break just works. Manual **Disconnect / Reconnect** and a status indicator live
  in the footer connection menu.

### Captured changes → a script for production *(the headline feature)*
Many teams apply schema changes to production by hand and are wary of migration
tools. Krust Studio is built for that:

- Every schema change you make is **captured** to a local history.
- Group changes into a named **Changeset** (tie it to a ticket).
- **Export the changeset as one commented `.sql` file** — in the exact order you
  ran them, never squashed — to hand to whoever applies it on production.

You also get a **Query History** of data changes and schema changes (kept
separate), so you always have a record of what the app actually ran. Copy any
statement, or copy them all.

---

## Supported databases

| Engine | Notes |
|--------|-------|
| **PostgreSQL** | Full schema editing, enums, index methods, CREATE reconstructed from the catalog. Transactional DDL (a failed commit rolls back). |
| **MySQL / MariaDB** | Full schema editing incl. **column reorder** (rename needs 8.0+). Note: MySQL auto-commits each DDL statement, so a multi-statement commit isn't atomic — review the DDL first. |
| **SQLite** | Browse + edit data; add/rename/drop columns. (SQLite's `ALTER` can't change a column's type or reorder columns — by design, no risky table rebuilds.) |

SSL/TLS connections are supported for reaching managed/prod databases.

---

## License

Open source, use-at-your-own-risk. See the repository for details.
