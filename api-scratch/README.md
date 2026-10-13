# API Scratchpad — Minnow plugin

A Postman-lite HTTP client for Minnow that also works entirely from chat. Send
requests with saved defaults and auth, inspect responses, and keep reusable
request collections and named environments.

- **Package id:** `api-scratch` (tools appear as `plugin__api_scratch__*`)
- **App id:** `plugin-api-scratch--scratchpad` (rail app "API Scratchpad")
- **API version:** 1

## What it does

- **Send** requests (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) from a method +
  URL bar, or from chat. Ctrl/Cmd+Enter sends.
- **Apply defaults**: a base URL, default headers and bearer/basic auth from the
  connection, injected server-side.
- **Substitute** `{{variables}}` in the URL, header values and body from a named
  environment.
- **Inspect** responses: status chip, duration, size, pretty-printed JSON toggle
  vs raw text, response headers, and a copy button.
- **Keep** request collections (save, load, rename, delete, run one item) and a
  request history.
- **Paginate/limit** oversized bodies: responses over ~300 KB come back with an
  explicit `truncated` marker, never a raw oversized payload.

## Where it appears in the UI

- **Panel docked beside the chat.** An **API Scratchpad** tab sits in the Code
  app's right-pane toolbar (the segmented row holding **files**, **browser**,
  **agent browser**, **source control** and **issues**). Clicking it opens a
  panel between the chat column and the right file sidebar — the same region the
  browser preview uses. The panel has its own close button; `/api` and the
  **Open API Scratchpad** palette entry also open it.
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
> changes those classes the dock will not appear; the palette entry and `/api`
> keep working.

## Install

1. Open **Settings → Plugins**.
2. Paste this folder URL (or the local folder path), then **Review plugin** and
   **Trust and install**:

   ```
   https://github.com/StefanoBussandri/minnow-plugins/tree/main/api-scratch
   ```

   Use the folder URL, not the bare repository URL — the repository holds two
   plugins, so Minnow will ask which one you want.
3. Enable it if it is not enabled.

Installation runs no scripts and downloads no dependencies.

## Connection setup

All fields are optional. Open **Settings → Plugins → API Scratchpad →
Configure connections** and fill in **Request defaults**:

| Field | Notes |
|-------|-------|
| `base_url` | Used to resolve relative request paths, e.g. `https://api.example.com`. |
| `default_headers` | One `Name: value` per line. Blank lines and `#` comments are ignored. |
| `auth_type` | `none`, `bearer` or `basic`. Applied unless a request already sets `Authorization`. |
| `bearer_token` | **Secret.** Encrypted at rest; never returned to the UI or tools. |
| `username` | Basic auth user. |
| `password` | **Secret.** Encrypted at rest; never returned. |

Secret values are only read inside native handlers. A blank field on save
preserves the stored value. The UI shows only whether a secret is configured.

## Tools

| Tool | Arguments | Returns |
|------|-----------|---------|
| `http_request` | `url` (required), `method?`, `headers?`, `body?`, `content_type?`, `environment?`, `timeout_ms?` | `{ok, status, statusText, method, url, durationMs, sizeBytes, truncated, contentType, headers, body}` |
| `http_list_collections` | – | `{collections[]}` with item counts |
| `http_get_collection` | `id` | `{collection}` |
| `http_save_collection` | `name`, `id?`, `items?` | `{ok, collection}` |
| `http_delete_collection` | `id` | `{ok, deleted}` |
| `http_run_collection_item` | `collection_id`, `item_id`, `environment?`, `timeout_ms?` | `{request, ...response}` |
| `http_list_environments` | – | `{active, environments[]}` |
| `http_save_environment` | `name`, `vars?`, `active?` | `{ok, name, vars, active}` |

`headers` accepts either an object map (`{"X-A": "1"}`) or an array of
`{key,value,enabled}`. Only `http` and `https` URLs are allowed.

### Example

```
http_request  url: "{{baseUrl}}/v1/things"  environment: "local"  method: "GET"
```

## Storage

Collections and environments live under the plugin data directory and survive
reloads and restarts:

```
~/.minnow/plugins/data/api-scratch/collections.json
~/.minnow/plugins/data/api-scratch/environments.json
```

Request history is kept locally by the app UI (per machine), capped at 50
entries.

## Permissions

Tools use Minnow's normal per-tool permission model (**Ask / Full / Off**).
`http_request` and `http_run_collection_item` make outbound network calls from
the native handler; review that before granting **Full** to unattended agents.

**A fresh install defaults every tool to Ask each time**, including the two write
tools (`http_save_collection`, `http_delete_collection`). Minnow's API v1 has no
manifest field for permissions, so a plugin cannot ship a default — the value is
per-machine and lives in `~/.minnow/tools.json` under
`permissions.default["plugin__api_scratch__<tool>"]`. Minnow's Settings UI falls
back to `ask` whenever that key is absent.

To run without prompts, set each tool to **Full** in
**Settings → Plugins → API Scratchpad → Tools, panels and connections**. The
choice persists across updates and reloads. Note that Minnow rewrites
`tools.json` from its own in-memory config, so editing that file by hand can be
overwritten — use the Settings UI (or set it while Minnow is closed).
