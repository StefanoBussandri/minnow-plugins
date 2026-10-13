# SQL Console — Minnow plugin

A database client for Minnow: connect, browse schemas, run read-only-by-default
queries, and keep named SQL snippets. It ships as a native rail app plus a
full set of agent tools.

- **Package id:** `sql-console` (tools appear as `plugin__sql_console__*`)
- **App id:** `plugin-sql-console--console` (rail app "SQL Console")
- **API version:** 1

## What it does

- **Connect** to PostgreSQL, MySQL or SQLite.
- **Browse** schemas → tables/views → columns (lazy-loaded), with row counts
  where cheap.
- **Run** queries in a monospace editor (Ctrl/Cmd+Enter). Writes are refused
  unless you confirm or the caller passes `allow_write`.
- **Keep** named snippets and a recent-query history.
- **Export** result pages to CSV.

## Where it appears in the UI

- **Panel docked beside the chat.** A **SQL Console** tab sits in the Code app's
  right-pane toolbar (the segmented row holding **files**, **browser**, **agent
  browser**, **source control** and **issues**). Clicking it opens a panel
  between the chat column and the right file sidebar — the same region the
  browser preview uses. The panel has its own close button; `/sql` and the
  **Open SQL Console** palette entry also open it.
- **Resizable.** Drag the handle on the panel's left edge, or focus it and use
  **←** / **→** (16px steps, **Home** = minimum, **End** = maximum). 420px — the
  width it opens at — is the floor; the ceiling is 60% of the window. The width
  you choose is remembered between sessions. Past 640px the panel switches back
  to the roomier two-column layout.
- The toolbar tab shows an **active state** while the panel is open, matching the
  browser and source-control tabs (`.is-active` → `--mn-accent`, kept in sync
  with `aria-pressed`).
- There is deliberately **no rail app**: the panel is the only surface, so the
  app rail stays uncluttered.

> **Caveat.** Minnow's plugin API has no extension point for that pane, so the
> dock is our own element inserted next to `.file-sidebar` and re-asserted by a
> `MutationObserver` when core redraws the layout. Each activation stamps the
> nodes it creates and purges a superseded instance's leftovers, so a stale
> panel can never call into a disposed context. If a future Minnow release
> changes those classes the dock will not appear; the palette entry and `/sql`
> keep working.

## Driver strategy (and why)

No database driver is bundled, and nothing is downloaded at install time.

| Dialect | How it connects |
|---------|-----------------|
| `sqlite` | Node's built-in `node:sqlite` driver — zero dependency, always present on Node 22+. |
| `postgres` | Shells out to the **`psql`** client already on your `PATH`. |
| `mysql` | Shells out to the **`mysql`** client already on your `PATH`. |

If `psql`/`mysql` is not installed, the tool returns a clear, actionable error
naming the missing command instead of failing obscurely. For SQLite there is
nothing to install.

## Install

1. Open **Settings → Plugins**.
2. Paste this folder URL (or the local folder path), then **Review plugin** and
   **Trust and install**:

   ```
   https://github.com/StefanoBussandri/minnow-plugins/tree/main/sql-console
   ```

   Use the folder URL, not the bare repository URL — the repository holds two
   plugins, so Minnow will ask which one you want.
3. Enable it if it is not enabled.

Installation runs no scripts and downloads no dependencies.

## Connection setup

Open **Settings → Plugins → SQL Console → Configure connections** and fill in
the **Database** connection:

| Field | Notes |
|-------|-------|
| `dialect` | `postgres`, `mysql` or `sqlite` (required). |
| `file` | SQLite database file path (sqlite only). |
| `host` / `port` | PostgreSQL/MySQL host and port (defaults: localhost, 5432/3306). |
| `database` | Database name (postgres/mysql). |
| `user` | User name (postgres/mysql). |
| `password` | **Secret.** Encrypted at rest; never returned to the UI or tools. |
| `ssl_mode` | PostgreSQL: `disable`/`allow`/`prefer`/`require`/`verify-ca`/`verify-full`. MySQL: mapped to `--ssl-mode`. |

Secret values are only ever read inside native handlers. A blank field on save
preserves the stored value.

## Tools

| Tool | Arguments | Returns |
|------|-----------|---------|
| `sql_test_connection` | – | `{ok, dialect, client, version, target}` |
| `sql_list_schemas` | – | `{dialect, schemas[]}` |
| `sql_list_tables` | `schema?`, `include_row_counts?` | `{dialect, schema, tables[]}` with `rowCount` where cheap |
| `sql_describe_table` | `table` (required), `schema?` | `{columns[], indexes[], foreignKeys[]}` |
| `sql_query` | `sql` (required), `allow_write?`, `row_limit?` (≤5000), `timeout_ms?` (≤120000) | `{columns[], rows[][], rowCount, truncated, command}` |
| `sql_save_snippet` | `name`, `sql`, `id?` | `{ok, snippet}` |
| `sql_list_snippets` | – | `{snippets[]}` |
| `sql_delete_snippet` | `id` | `{ok, deleted}` |

### Read-only by default

`sql_query` classifies the statement before running it. Anything that is not a
read (`SELECT`/`WITH`/`SHOW`/`EXPLAIN`/`DESCRIBE`/`PRAGMA`/`VALUES`/`TABLE`),
and any multi-statement batch, is **refused** with a clear message unless
`allow_write: true` is passed. For PostgreSQL the session is additionally opened
read-only; for MySQL a read-only transaction is set.

### Large results

Results are capped and returned with an explicit `truncated: true` marker rather
than failing or silently cutting off. Reduce with a `LIMIT` or a lower
`row_limit`.

## Storage

Snippets live under the plugin data directory and survive reloads and restarts:

```
~/.minnow/plugins/data/sql-console/snippets.json
```

Query history is kept locally by the app UI (per machine), capped at 50 entries.

## Permissions

Tools use Minnow's normal per-tool permission model (**Ask / Full / Off**).
Unattended server agents and boards only see plugin tools granted **Full**.

All eight tools ship **enabled and granted Full**, so chat and unattended agents
can use them without a prompt. Change any of them in **Settings → Plugins →
SQL Console → Tools, panels and connections**.
