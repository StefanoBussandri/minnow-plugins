# Minnow plugins

Two independent, installable Minnow plugins (API v1). Each is a self-contained
package folder with its own manifest, tools, UI and README.

| Package | Purpose | Tools |
|---------|---------|-------|
| [`sql-console/`](./sql-console) | Database client: browse schemas, run read-only-by-default queries, keep SQL snippets. PostgreSQL / MySQL / SQLite. | `plugin__sql_console__*` |
| [`api-scratch/`](./api-scratch) | Postman-lite HTTP client: send requests with saved defaults and auth, keep collections and environments. | `plugin__api_scratch__*` |

## Install either plugin

1. Open **Settings → Plugins**.
2. Paste the package folder path (or choose the folder), then **Review plugin**
   and **Trust and install**.
3. Configure the connection under **Configure connections**, and enable the
   plugin if needed.

Both plugins install with no scripts and no dependency downloads. Each is
versioned independently.

## Install from GitHub

Paste the **folder URL** for the plugin you want into **Settings → Plugins**:

- **SQL Console** — `https://github.com/StefanoBussandri/minnow-plugins/tree/main/sql-console`
- **API Scratchpad** — `https://github.com/StefanoBussandri/minnow-plugins/tree/main/api-scratch`

Select **Review plugin**, then **Trust and install**.

> **Always use the folder URL.** This repository holds two plugins, so the bare
> repository URL is rejected with *"This repository contains multiple plugins.
> Paste the GitHub folder URL for the plugin you want."* Installation selects
> only files under the folder you name, so the root `README.md` is never part of
> either package.

Notes on how Minnow installs from GitHub:

- Downloads come from `codeload.github.com` as a source archive — no GitHub API
  token, so the repository must be public.
- An install is pinned to the commit you reviewed. **Reload from source**
  re-reads the branch in the URL, so updates published to `main` are picked up.
- To pin a specific release instead of tracking `main`, point the URL at a tag:
  `.../tree/v1.3.1/api-scratch`.
- Limits: 16 MiB download, 64 MiB unpacked repository, then 256 files / 8 MiB
  per package. Git submodule contents are not included in the archive.

## Design notes

- **No bundled drivers.** `sql-console` uses Node's built-in `node:sqlite` for
  SQLite and shells out to `psql`/`mysql` for the other dialects, reporting a
  clear error if the client is missing. `api-scratch` uses the runtime `fetch`.
- **Read-only by default.** `sql_query` refuses writes and multi-statement
  batches unless `allow_write` is set.
- **Secrets stay server-side.** Connection secrets are read only inside native
  handlers and never returned to tools, apps or logs.
- **Bounded results.** Oversized results are truncated with an explicit marker
  rather than failing or silently cutting off.
- **Durable state.** Snippets, collections and environments are stored under
  `~/.minnow/plugins/data/<package>/` and survive reloads and restarts.
- **Full permission by default.** Every tool in both packages ships enabled with
  **Full** permission, so chat and unattended agents can call them without
  prompting. Adjust per tool in **Settings → Plugins**.

## Where they appear in the UI

Each plugin adds:

- a **tab in the Code app's right-pane toolbar**, next to the files, browser,
  agent browser, source control and issues tabs, which toggles a **panel docked
  between the chat column and the right file sidebar** — the region the browser
  preview uses. Each panel has its own close button.
- a slash command (`/sql`, `/api`) and a command palette entry that toggle the
  same panel.

Neither plugin adds a rail app, so the app rail is left alone.

Both panels are **resizable**: drag the handle on the panel's left edge, or focus
it and use ← / → (Home = minimum, End = maximum). They open at 420px, which is
also the floor; the ceiling is 60% of the window, and the chosen width is
remembered. Widening past 640px restores each app's roomy two-column layout.

Both toolbar tabs light up with Minnow's **active state** (`.is-active`, the same
`--mn-accent` treatment the browser and source-control tabs use) while their
panel is open.

The dock and the toolbar tab are built from our own DOM, inserted next to core's
`.file-sidebar` and `.file-sidebar-header-actions` elements and re-asserted by a
`MutationObserver`. Each activation stamps the nodes it creates and removes any
left by a superseded instance — without that, a stale panel keeps calling into a
disposed context and fails with "Plugin UI is no longer active". Minnow's plugin
API has no extension point for that pane, so if a future release renames those
classes the dock simply will not appear — the palette entry and slash command
are unaffected.

See each package's `README.md` for its full tool list and connection setup.
