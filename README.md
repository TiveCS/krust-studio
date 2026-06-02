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
   - Tick **Read-only** for production: it blocks *every* write (data and schema)
     at the core, not just in the UI.
2. **Open it** — the sidebar fills with your tables, views, and enums.
3. **Double-click a table** to browse its data.

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
- A **Structure** tab per table: columns, indexes, relations, and the real
  **CREATE statement**.
- Follow a foreign key to open the related table, filtered to that record.

### Change schema — and see the SQL
- Add / rename / drop columns; edit defaults and auto-increment; add / drop
  **indexes** (with index method on Postgres/MySQL).
- Create, rename, **truncate**, or **drop** tables (destructive actions require
  you to type the name to confirm).
- **Every schema change surfaces the DDL it generated** — no hidden mutations.

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
| **PostgreSQL** | Full schema editing, enums, index methods, CREATE reconstructed from the catalog. |
| **MySQL / MariaDB** | Full schema editing (rename needs MySQL 8.0+). |
| **SQLite** | Browse + edit data; add/rename/drop columns. (SQLite's `ALTER` can't change a column's type — by design, no risky table rebuilds.) |

SSL/TLS connections are supported for reaching managed/prod databases.

---

## License

Open source, use-at-your-own-risk. See the repository for details.
