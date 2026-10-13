// SQL Console — trusted UI module (runs in Minnow's document).
// All database access goes through this package's native tools via ctx.callTool.
// Connection values and secrets are never read here; only the tool status is shown.

const STYLE_ID = 'sqlc-style';
const HISTORY_KEY = 'sql-console:history';
const PAGE_SIZE = 50;
const READ_KEYWORDS = new Set(['SELECT', 'WITH', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'DESC', 'PRAGMA', 'VALUES', 'TABLE']);

const CSS = `
.sqlc-root { display:flex; flex-direction:column; height:100%; min-height:0; box-sizing:border-box; background:var(--mn-bg); color:var(--mn-fg); font:13px/1.45 var(--mn-font, system-ui, sans-serif); }
.sqlc-head { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--mn-border); flex:0 0 auto; flex-wrap:wrap; }
.sqlc-title { font-weight:700; font-size:14px; }
.sqlc-spacer { flex:1 1 auto; }
.sqlc-chip { display:inline-flex; align-items:center; gap:6px; padding:2px 9px; border-radius:999px; font-size:12px; border:1px solid var(--mn-border); white-space:nowrap; }
.sqlc-chip.ok { color:var(--mn-success, var(--mn-accent)); border-color:var(--mn-success, var(--mn-accent)); }
.sqlc-chip.bad { color:var(--mn-danger, #e5534b); border-color:var(--mn-danger, #e5534b); }
.sqlc-chip.idle { color:var(--mn-fg-muted); }
.sqlc-body { display:flex; flex:1 1 auto; min-height:0; }
.sqlc-side { width:300px; flex:0 0 auto; border-right:1px solid var(--mn-border); display:flex; flex-direction:column; min-height:0; }
.sqlc-tabs { display:flex; border-bottom:1px solid var(--mn-border); flex:0 0 auto; }
.sqlc-tabs button { flex:1; background:transparent; border:0; padding:8px 4px; color:var(--mn-fg-muted); cursor:pointer; font:inherit; }
.sqlc-tabs button[aria-selected="true"] { color:var(--mn-fg); box-shadow:inset 0 -2px 0 var(--mn-accent); }
.sqlc-sidebody { overflow:auto; padding:8px; flex:1 1 auto; min-height:0; }
.sqlc-main { flex:1 1 auto; display:flex; flex-direction:column; min-width:0; min-height:0; }
.sqlc-toolbar { display:flex; gap:8px; align-items:center; padding:8px 12px; border-bottom:1px solid var(--mn-border); flex-wrap:wrap; flex:0 0 auto; }
.sqlc-editor { width:100%; box-sizing:border-box; min-height:130px; resize:vertical; border:0; border-bottom:1px solid var(--mn-border); padding:10px 12px; background:var(--mn-surface-1, var(--mn-bg)); color:var(--mn-fg); font:12px/1.5 ui-monospace, Consolas, "Cascadia Code", monospace; flex:0 0 auto; }
.sqlc-input { box-sizing:border-box; padding:5px 8px; border-radius:6px; border:1px solid var(--mn-border); background:var(--mn-surface-1, var(--mn-bg)); color:var(--mn-fg); font:inherit; }
.sqlc-btn { display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:6px; border:1px solid var(--mn-border); background:var(--mn-surface-2, var(--mn-bg-hover)); color:var(--mn-fg); font:inherit; cursor:pointer; }
.sqlc-btn:hover:not(:disabled) { background:var(--mn-surface-3, var(--mn-bg-hover)); }
.sqlc-btn:disabled { opacity:.5; cursor:default; }
.sqlc-btn.primary { background:var(--mn-accent); border-color:var(--mn-accent); color:var(--mn-fg-on-accent, #fff); }
.sqlc-btn.ghost { background:transparent; }
.sqlc-btn.small { padding:2px 7px; font-size:12px; }
.sqlc-btn:focus-visible, .sqlc-editor:focus-visible, .sqlc-input:focus-visible, .sqlc-tabs button:focus-visible { outline:2px solid var(--mn-accent); outline-offset:1px; }
.sqlc-confirm { display:flex; gap:10px; align-items:center; padding:8px 12px; border-bottom:1px solid var(--mn-border); background:var(--mn-warning-soft, rgba(210,153,34,.14)); flex:0 0 auto; flex-wrap:wrap; }
.sqlc-results { flex:1 1 auto; overflow:auto; min-height:0; }
.sqlc-grid { border-collapse:collapse; width:100%; font:12px/1.4 ui-monospace, Consolas, monospace; }
.sqlc-grid th, .sqlc-grid td { border:1px solid var(--mn-border); padding:4px 8px; text-align:left; vertical-align:top; max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sqlc-grid thead th { position:sticky; top:0; background:var(--mn-surface-2, var(--mn-bg-hover)); z-index:1; }
.sqlc-grid td.num { text-align:right; }
.sqlc-null { color:var(--mn-fg-muted); font-style:italic; opacity:.85; }
.sqlc-tree button { display:flex; gap:6px; align-items:center; width:100%; text-align:left; background:transparent; border:0; color:var(--mn-fg); padding:3px 6px; border-radius:5px; cursor:pointer; font:inherit; overflow:hidden; }
.sqlc-tree button:hover { background:var(--mn-bg-hover); }
.sqlc-tree .sqlc-indent { padding-left:16px; }
.sqlc-tree .sqlc-indent2 { padding-left:32px; }
.sqlc-muted { color:var(--mn-fg-muted); }
.sqlc-note { padding:8px 10px; }
.sqlc-snip, .sqlc-histrow { display:flex; gap:6px; align-items:center; padding:4px 2px; }
.sqlc-snip .sqlc-name, .sqlc-histrow { min-width:0; flex:1 1 auto; }
.sqlc-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sqlc-meta { font-size:11px; color:var(--mn-fg-muted); }
.sqlc-empty { padding:14px; color:var(--mn-fg-muted); }
@media (max-width:720px) { .sqlc-side { width:210px; } }

/* Dock: a panel between the chat column and the right file sidebar.
   420px is the floor; drag the handle (or use the arrow keys) to widen it. */
.sqlc-dock { position:relative; container-type:inline-size; flex:0 0 auto; width:420px; min-width:420px; max-width:none; display:flex; flex-direction:column; min-height:0; border-left:1px solid var(--mn-border); background:var(--mn-surface-1, var(--mn-bg)); }
.sqlc-dock[hidden] { display:none; }
/* Mirrors core's .sidebar-resizer: 6px grab strip straddling the edge. */
.sqlc-dock-resizer { cursor:col-resize; touch-action:none; z-index:2; background:0 0; flex:none; width:6px; position:absolute; top:0; bottom:0; left:-3px; }
.sqlc-dock-resizer:hover, .sqlc-dock-resizer.is-dragging { background:var(--mn-accent-soft); }
.sqlc-dock-resizer:focus-visible { background:var(--mn-accent-soft); outline:2px solid var(--mn-accent); outline-offset:-1px; }
/* Active state for the toolbar tab, matching core's browser/git toggles
   (they use .is-active + color/background from --mn-accent). The id keeps it
   ahead of core's .file-sidebar-header-actions .icon-btn:hover rule. */
#plugin-sql-console-sidebar-tab.is-active { color:var(--mn-accent); background:color-mix(in srgb, var(--mn-accent) 14%, transparent); }
#plugin-sql-console-sidebar-tab.is-active:hover { color:var(--mn-accent); background:color-mix(in srgb, var(--mn-accent) 14%, transparent); }
.sqlc-dock-head { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid var(--mn-border); flex:0 0 auto; }
.sqlc-dock-title { font-weight:600; font-size:12px; }
.sqlc-dock-close { margin-left:auto; }
.sqlc-dock-body { flex:1 1 auto; min-height:0; display:flex; }
.sqlc-dock .sqlc-root { flex:1 1 auto; min-width:0; }
.sqlc-dock .sqlc-body { flex-direction:column; }
.sqlc-dock .sqlc-side { width:100%; max-height:42%; border-right:0; border-bottom:1px solid var(--mn-border); }
.sqlc-dock .sqlc-editor { min-height:88px; }
/* Widen the panel and it recovers the roomy two-column app layout. */
@container (min-width:640px) {
  .sqlc-dock .sqlc-body { flex-direction:row; }
  .sqlc-dock .sqlc-side { width:260px; max-height:none; border-right:1px solid var(--mn-border); border-bottom:0; }
  .sqlc-dock .sqlc-editor { min-height:120px; }
}

/* --- Minnow-native polish ------------------------------------------------
   Keep every control on core's tokens and metrics so the panel reads as part
   of Minnow rather than a separate app: transparent bordered buttons, radius
   from --radius-sm, --font-ui / --font-mono, accent-soft focus rings. */
.sqlc-root { background:var(--mn-surface-1, var(--mn-bg)); font:13px/1.45 var(--font-ui, system-ui, sans-serif); }
.sqlc-dock-title, .sqlc-title { font-family:var(--font-ui, system-ui, sans-serif); font-size:13px; font-weight:600; }
.sqlc-head { padding:8px 10px; gap:8px; }
.sqlc-btn { border:1px solid var(--mn-border); border-radius:var(--radius-sm, 6px); background:0 0; color:var(--mn-fg); padding:6px 12px; font:13px var(--font-ui, system-ui, sans-serif); cursor:pointer; transition:border-color .2s var(--ease-out, ease), background-color .2s var(--ease-out, ease), color .2s var(--ease-out, ease); }
.sqlc-btn:hover:not(:disabled) { background:var(--mn-surface-elevated, var(--mn-surface-2)); }
.sqlc-btn.primary { background:var(--mn-accent); border-color:var(--mn-accent); color:var(--mn-fg-on-accent, #fff); }
.sqlc-btn.primary:hover:not(:disabled) { background:color-mix(in srgb, var(--mn-accent) 88%, var(--mn-fg)); }
.sqlc-btn.small { padding:4px 9px; font-size:12px; }
.sqlc-toolbar { padding:8px 12px; gap:8px; }
.sqlc-input { background:var(--mn-surface-2, var(--mn-bg)); border:1px solid var(--mn-border); border-radius:var(--radius-sm, 6px); padding:6px 8px; font:13px var(--font-ui, system-ui, sans-serif); }
.sqlc-editor { background:var(--mn-surface-1, var(--mn-bg)); color:var(--mn-fg); font:12px/1.5 var(--font-mono, ui-monospace, monospace); padding:10px 12px; }
.sqlc-input:focus-visible, .sqlc-editor:focus-visible, .sqlc-btn:focus-visible, .sqlc-tabs button:focus-visible { outline:2px solid var(--mn-accent-soft, var(--mn-accent)); outline-offset:1px; }
.sqlc-tabs button { font-size:12px; color:var(--mn-fg-muted); font-family:var(--font-ui, system-ui, sans-serif); }
.sqlc-tabs button[aria-selected="true"] { color:var(--mn-fg); }
.sqlc-grid th, .sqlc-grid td { border-color:var(--mn-border); font-family:var(--font-mono, ui-monospace, monospace); }
.sqlc-grid thead th { background:var(--mn-surface-2, var(--mn-bg-hover)); }
.sqlc-chip { font-size:12px; font-family:var(--font-ui, system-ui, sans-serif); }
.sqlc-chip.ok { color:var(--mn-accent); border-color:var(--mn-accent); }
.sqlc-chip.bad { color:var(--mn-danger, #e5534b); border-color:var(--mn-danger, #e5534b); }
.sqlc-null { color:var(--mn-fg-subtle, var(--mn-fg-muted)); }
.sqlc-confirm { background:var(--mn-surface-elevated, var(--mn-surface-2)); }
.sqlc-dock-head { padding:6px 8px; gap:6px; }
.sqlc-dock-head .icon-btn { width:28px; height:28px; }
`;

export default function activate(ctx) {
  // Every contribution is registered independently: an error anywhere here
  // removes *all* of this module's contributions, so one rejected call must
  // not take down the rest.
  const safe = (fn, what) => {
    try { return fn(); } catch (error) { console.warn(`[sql-console] ${what} unavailable`, error); }
  };

  safe(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
    ctx.onCleanup(() => style.remove());
  }, 'styles');

  // No rail app: the docked panel is the only surface, reached from the Code
  // toolbar tab, the palette entry and the slash command.
  safe(() => ctx.registerCommand({
    id: 'open_console',
    title: 'Toggle SQL Console panel',
    group: 'Plugins',
    run: () => toggleDock(true),
  }), 'command palette entry');

  safe(() => ctx.registerSlashCommand({
    id: 'sql',
    alias: 'sql',
    label: 'SQL Console',
    description: 'Toggle the SQL Console panel',
    run: () => toggleDock(true),
  }), 'slash command');

  // ---- Docked panel ---------------------------------------------------------
  // Renders between the chat column and the right file sidebar, in the same
  // region the browser preview uses. Minnow's plugin API has no extension point
  // for that pane, so this is our own element inserted next to `.file-sidebar`
  // and re-asserted by a MutationObserver when core redraws the layout.
  const DOCK_ID = 'plugin-sql-console-dock';
  const TAB_ID = 'plugin-sql-console-sidebar-tab';
  const RESIZER_CLASS = 'sqlc-dock-resizer';
  // 420px is the width the panel opens at, so it is also the floor.
  const MIN_WIDTH = 420;
  const WIDTH_KEY = 'sql-console:dock-width';
  // Stamped on the nodes we create. A superseded module instance must never
  // adopt our elements: its controls are wired to a disposed ctx and throw
  // "Plugin UI is no longer active".
  const OWNER = `sqlc-${Math.random().toString(36).slice(2, 9)}`;
  const TAB_HOSTS = [
    '.file-sidebar-header-actions',
    '[role="toolbar"][aria-label="Code left pane"]',
    '.file-sidebar-header',
  ];
  let dockOpen = false;
  let queued = false;

  const dockMaxWidth = () => Math.max(MIN_WIDTH, Math.round((window.innerWidth || 1440) * 0.6));
  const clampDockWidth = (value) => Math.max(MIN_WIDTH, Math.min(dockMaxWidth(), Math.round(value)));

  function readStoredWidth() {
    try {
      const stored = Number(localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(stored) && stored > 0 ? clampDockWidth(stored) : MIN_WIDTH;
    } catch { return MIN_WIDTH; }
  }

  function setDockWidth(dock, width, persist = true) {
    const next = clampDockWidth(width);
    dock.style.width = `${next}px`;
    const handle = dock.querySelector(`.${RESIZER_CLASS}`);
    if (handle) {
      handle.setAttribute('aria-valuenow', String(next));
      handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
      handle.setAttribute('aria-valuemax', String(dockMaxWidth()));
    }
    if (persist) {
      try { localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* ignore quota */ }
    }
    return next;
  }

  function wireResizer(dock, handle) {
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startWidth = dock.getBoundingClientRect().width || readStoredWidth();
      handle.classList.add('is-dragging');
      if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      // The handle sits on the left edge, so dragging left widens the panel.
      setDockWidth(dock, startWidth - (event.clientX - startX));
    });
    const stop = (event) => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('is-dragging');
      if (handle.releasePointerCapture) handle.releasePointerCapture(event.pointerId);
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);

    handle.addEventListener('keydown', (event) => {
      const width = dock.getBoundingClientRect().width || readStoredWidth();
      if (event.key === 'ArrowLeft') setDockWidth(dock, width + 16);
      else if (event.key === 'ArrowRight') setDockWidth(dock, width - 16);
      else if (event.key === 'Home') setDockWidth(dock, MIN_WIDTH);
      else if (event.key === 'End') setDockWidth(dock, dockMaxWidth());
      else return;
      event.preventDefault();
    });
  }

  function buildDock() {
    const dock = el('aside', { id: DOCK_ID, class: 'sqlc-dock', 'aria-label': 'SQL Console panel' });
    dock.dataset.owner = OWNER;
    const head = el('div', { class: 'sqlc-dock-head' });
    head.append(el('span', { class: 'sqlc-dock-title', text: 'SQL Console' }));
    const close = el('button', {
      class: 'sqlc-dock-close icon-btn',
      type: 'button',
      title: 'Close panel',
      'aria-label': 'Close SQL Console panel',
    });
    close.append(el('i', { class: 'fi fi-rr-cross-small icon-svg', 'aria-hidden': 'true' }));
    close.addEventListener('click', () => toggleDock(false));
    head.append(close);
    const body = el('div', { class: 'sqlc-dock-body' });
    const resizer = el('div', {
      class: RESIZER_CLASS,
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize SQL Console panel',
      title: 'Drag to resize (or use the arrow keys)',
      tabindex: '0',
    });
    dock.append(head, body, resizer);
    setDockWidth(dock, readStoredWidth(), false);
    wireResizer(dock, resizer);
    mount(body);
    return dock;
  }

  function ensureDock() {
    const anchor = document.querySelector('.file-sidebar');
    if (!anchor || !anchor.parentElement) return null;
    const existing = document.getElementById(DOCK_ID);
    if (existing && existing.parentElement && existing.dataset.owner === OWNER) return existing;
    if (existing) existing.remove();
    const dock = buildDock();
    anchor.parentElement.insertBefore(dock, anchor);
    return dock;
  }

  function applyDock() {
    const existing = document.getElementById(DOCK_ID);
    if (!dockOpen) {
      if (existing) existing.hidden = true;
      return null;
    }
    const dock = ensureDock();
    if (dock) dock.hidden = false;
    return dock;
  }

  function toggleDock(open) {
    dockOpen = typeof open === 'boolean' ? open : !dockOpen;
    const dock = applyDock();
    // Mirror core's toggle pattern: .is-active drives the styling, aria-pressed
    // carries the state for assistive tech.
    const active = Boolean(dock) && dock.hidden === false;
    for (const button of document.querySelectorAll(`#${TAB_ID}`)) {
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function ensureTab(host) {
    const existing = host.querySelector(`#${TAB_ID}`);
    if (existing && existing.dataset.owner === OWNER) return;
    if (existing) existing.remove();
    const button = el('button', {
      class: 'icon-btn',
      id: TAB_ID,
      type: 'button',
      title: 'SQL Console panel',
      'aria-label': 'Toggle SQL Console panel',
      'aria-pressed': 'false',
    });
    button.dataset.owner = OWNER;
    button.append(el('i', { class: 'fi fi-rr-database icon-svg', 'aria-hidden': 'true' }));
    button.addEventListener('click', () => toggleDock());
    // A rebuilt toolbar must re-create the tab in its current state.
    const dockEl = document.getElementById(DOCK_ID);
    const active = dockOpen && dockEl && dockEl.hidden === false;
    button.classList.toggle('is-active', Boolean(active));
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    host.append(button);
  }

  function ensureAll() {
    queued = false;
    for (const selector of TAB_HOSTS) {
      const found = document.querySelectorAll(selector);
      if (found.length) { for (const host of found) ensureTab(host); break; }
    }
    if (dockOpen) applyDock();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(ensureAll);
  }

  safe(() => {
    // Drop anything a previous instance left behind before re-asserting ours.
    for (const id of [DOCK_ID, TAB_ID]) {
      for (const node of [...document.querySelectorAll(`#${id}`)]) node.remove();
    }
    ensureAll();
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ctx.onCleanup(() => {
      observer.disconnect();
      const dock = document.getElementById(DOCK_ID);
      if (dock) dock.remove();
    });
  }, 'panel');

  function mount(root) {
    const cleanups = [];

    const state = {
      status: 'idle', // idle | ok | bad
      statusText: 'Checking connection…',
      schemas: [],
      openSchemas: new Set(),
      tables: {}, // schema -> [{name,type,rowCount?}]
      columns: {}, // "schema.table" -> columns
      openTables: new Set(),
      result: null,
      running: false,
      runToken: 0,
      page: 0,
      sidebar: 'schema',
      snippets: [],
      history: loadHistory(),
      confirmWrite: null,
    };

    // ---- async helpers ----
    async function call(id, args) {
      const raw = await ctx.callTool(id, args || {});
      const text = typeof raw === 'string' ? raw : String(raw == null ? '' : raw);
      if (text.startsWith('Error:')) throw new Error(text.slice(6).trim());
      try { return JSON.parse(text); } catch { return text; }
    }

    function loadHistory() {
      try {
        const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        return Array.isArray(raw) ? raw.slice(0, 50) : [];
      } catch { return []; }
    }
    function pushHistory(entry) {
      state.history = [entry, ...state.history.filter((h) => h.sql !== entry.sql)].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch { /* ignore quota */ }
    }

    function isWrite(sqlText) {
      let s = String(sqlText || '')
        .trim()
        .replace(/^(--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/g, '');
      const first = ((s.match(/^([A-Za-z]+)/) || [, ''])[1] || '').toUpperCase();
      if (!READ_KEYWORDS.has(first)) return true;
      const body = s.replace(/;\s*$/, '');
      if (/;/.test(body)) return true;
      if (first === 'WITH' && /\b(insert|update|delete|merge|replace)\b/i.test(body)) return true;
      return false;
    }

    // ---- build DOM ----
    const rootEl = el('div', { class: 'sqlc-root' });
    root.append(rootEl);

    const headEl = el('div', { class: 'sqlc-head' });
    headEl.append(el('span', { class: 'sqlc-title', text: 'SQL Console' }));
    const chip = el('span', { class: 'sqlc-chip idle', text: 'Checking…' });
    headEl.append(chip);
    headEl.append(el('span', { class: 'sqlc-spacer' }));
    const testBtn = el('button', { class: 'sqlc-btn', type: 'button', text: 'Test connection' }, []);
    testBtn.addEventListener('click', () => refreshStatus());
    headEl.append(testBtn);
    rootEl.append(headEl);

    const bodyEl = el('div', { class: 'sqlc-body' });
    rootEl.append(bodyEl);

    // sidebar
    const sideEl = el('div', { class: 'sqlc-side' });
    const tabsEl = el('div', { class: 'sqlc-tabs', role: 'tablist' });
    const sideBody = el('div', { class: 'sqlc-sidebody' });
    const tabButtons = {};
    for (const [key, label] of [['schema', 'Schema'], ['snippets', 'Snippets'], ['history', 'History']]) {
      const b = el('button', { type: 'button', role: 'tab', text: label });
      b.setAttribute('aria-selected', String(key === state.sidebar));
      b.addEventListener('click', () => { state.sidebar = key; syncTabs(); renderSidebar(); });
      tabButtons[key] = b;
      tabsEl.append(b);
    }
    sideEl.append(tabsEl, sideBody);
    bodyEl.append(sideEl);

    // main
    const mainEl = el('div', { class: 'sqlc-main' });
    bodyEl.append(mainEl);

    const toolbar = el('div', { class: 'sqlc-toolbar' });
    const runBtn = el('button', { class: 'sqlc-btn primary', type: 'button', text: 'Run' });
    const cancelBtn = el('button', { class: 'sqlc-btn', type: 'button', text: 'Cancel', disabled: true });
    const rowsLabel = el('label', { class: 'sqlc-meta', text: 'rows' });
    const rowsInput = el('input', { class: 'sqlc-input', type: 'number', min: '1', max: '5000', value: '200', style: 'width:74px' });
    rowsInput.setAttribute('aria-label', 'Row limit');
    const snippetName = el('input', { class: 'sqlc-input', type: 'text', placeholder: 'snippet name', style: 'width:150px' });
    snippetName.setAttribute('aria-label', 'Snippet name');
    const saveSnipBtn = el('button', { class: 'sqlc-btn', type: 'button', text: 'Save snippet' });
    toolbar.append(runBtn, cancelBtn, rowsLabel, rowsInput, el('span', { class: 'sqlc-spacer' }), snippetName, saveSnipBtn);
    mainEl.append(toolbar);

    const confirmEl = el('div', { class: 'sqlc-confirm' });
    confirmEl.hidden = true;
    mainEl.append(confirmEl);

    const editor = el('textarea', { class: 'sqlc-editor', spellcheck: 'false', placeholder: 'SELECT * FROM …\n(Ctrl/Cmd + Enter to run)' });
    editor.setAttribute('aria-label', 'SQL editor');
    mainEl.append(editor);

    const resultsEl = el('div', { class: 'sqlc-results' });
    mainEl.append(resultsEl);

    runBtn.addEventListener('click', () => requestRun());
    cancelBtn.addEventListener('click', () => { state.runToken += 1; setRunning(false); renderResults(); });
    saveSnipBtn.addEventListener('click', saveSnippet);
    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); requestRun(); }
    });

    function setRunning(running) {
      state.running = running;
      runBtn.disabled = running;
      runBtn.textContent = running ? 'Running…' : 'Run';
      cancelBtn.disabled = !running;
    }

    function syncTabs() {
      for (const [key, b] of Object.entries(tabButtons)) b.setAttribute('aria-selected', String(key === state.sidebar));
    }

    function setStatus(kind, text) {
      state.status = kind;
      state.statusText = text;
      chip.className = `sqlc-chip ${kind}`;
      chip.textContent = text;
    }

    // ---- connection ----
    async function refreshStatus() {
      setStatus('idle', 'Checking…');
      try {
        const info = await call('sql_test_connection');
        const detail = info.dialect === 'sqlite'
          ? `SQLite ${info.version}`
          : `${info.dialect} ${String(info.version || '').split(' ')[0]}`;
        setStatus('ok', `Connected · ${detail}`);
      } catch (error) {
        const msg = String(error.message || error);
        setStatus('bad', /not configured|needs|Set the|Set "|Unsupported/i.test(msg) ? 'Not configured' : `Error: ${truncate(msg, 60)}`);
      }
    }

    async function loadSchemas() {
      try {
        const info = await call('sql_list_schemas');
        state.schemas = info.schemas || [];
      } catch { state.schemas = []; }
      renderSidebar();
    }

    async function loadTables(schema) {
      try {
        const info = await call('sql_list_tables', { schema });
        state.tables[schema] = info.tables || [];
      } catch (error) {
        state.tables[schema] = [];
        setStatus('bad', `Error: ${truncate(String(error.message || error), 60)}`);
      }
      renderSidebar();
    }

    async function loadColumns(schema, table) {
      const key = `${schema}.${table}`;
      try {
        const info = await call('sql_describe_table', { schema, table });
        state.columns[key] = info.columns || [];
      } catch { state.columns[key] = []; }
      renderSidebar();
    }

    // ---- run ----
    function requestRun(forceWrite) {
      const sqlText = editor.value.trim();
      if (!sqlText) return;
      if (!forceWrite && isWrite(sqlText)) {
        showConfirm(sqlText);
        return;
      }
      hideConfirm();
      execute(sqlText, Boolean(forceWrite));
    }

    function showConfirm(sqlText) {
      confirmEl.replaceChildren();
      confirmEl.hidden = false;
      confirmEl.append(el('span', { text: 'This looks like a statement that modifies data or schema. Run it?' }));
      const go = el('button', { class: 'sqlc-btn primary', type: 'button', text: 'Run anyway' });
      const no = el('button', { class: 'sqlc-btn', type: 'button', text: 'Cancel' });
      go.addEventListener('click', () => requestRun(true));
      no.addEventListener('click', () => hideConfirm());
      confirmEl.append(go, no);
      go.focus();
    }
    function hideConfirm() {
      confirmEl.hidden = true;
      confirmEl.replaceChildren();
    }

    async function execute(sqlText, allowWrite) {
      const token = ++state.runToken;
      setRunning(true);
      const limit = Math.max(1, Math.min(5000, Number(rowsInput.value) || 200));
      const started = performance.now();
      try {
        const result = await call('sql_query', { sql: sqlText, allow_write: allowWrite, row_limit: limit });
        if (token !== state.runToken) return; // cancelled: abandon the late result
        state.result = result;
        state.page = 0;
        pushHistory({ sql: sqlText, at: Date.now(), ok: true, ms: Math.round(performance.now() - started) });
        setStatusKeepAlive();
      } catch (error) {
        if (token !== state.runToken) return;
        state.result = { error: String(error.message || error) };
        pushHistory({ sql: sqlText, at: Date.now(), ok: false, ms: Math.round(performance.now() - started) });
      } finally {
        if (token === state.runToken) { setRunning(false); renderResults(); renderSidebar(); }
      }
    }

    function setStatusKeepAlive() { /* keep the current connection chip */ }

    // ---- snippets ----
    async function refreshSnippets() {
      try { state.snippets = (await call('sql_list_snippets')).snippets || []; }
      catch { state.snippets = []; }
      renderSidebar();
    }
    async function saveSnippet() {
      const name = snippetName.value.trim();
      const sqlText = editor.value.trim();
      if (!name) { snippetName.focus(); return; }
      if (!sqlText) return;
      try {
        await call('sql_save_snippet', { name, sql: sqlText });
        snippetName.value = '';
        await refreshSnippets();
      } catch (error) {
        setStatus('bad', `Error: ${truncate(String(error.message || error), 60)}`);
      }
    }
    async function deleteSnippet(id) {
      try { await call('sql_delete_snippet', { id }); await refreshSnippets(); } catch { /* ignore */ }
    }

    // ---- rendering ----
    function renderSidebar() {
      sideBody.replaceChildren();
      if (state.sidebar === 'schema') renderSchema();
      else if (state.sidebar === 'snippets') renderSnippets();
      else renderHistory();
    }

    function renderSchema() {
      if (state.status === 'bad' && !state.schemas.length) {
        sideBody.append(el('div', { class: 'sqlc-empty', text: 'No connection. Configure the database connection in Settings → Plugins → SQL Console, then Test connection.' }));
        return;
      }
      const tree = el('div', { class: 'sqlc-tree' });
      if (!state.schemas.length) tree.append(el('div', { class: 'sqlc-empty', text: 'No schemas found.' }));
      for (const schema of state.schemas) {
        const open = state.openSchemas.has(schema);
        const btn = el('button', { type: 'button', text: `${open ? '▾' : '▸'} ${schema}` });
        btn.addEventListener('click', () => {
          if (open) state.openSchemas.delete(schema);
          else { state.openSchemas.add(schema); if (!state.tables[schema]) loadTables(schema); }
          renderSidebar();
        });
        tree.append(btn);
        if (open) {
          const tables = state.tables[schema];
          if (!tables) tree.append(el('div', { class: 'sqlc-empty', text: 'Loading…' }));
          else if (!tables.length) tree.append(el('div', { class: 'sqlc-empty', text: 'No tables.' }));
          else for (const t of tables) {
            const key = `${schema}.${t.name}`;
            const tOpen = state.openTables.has(key);
            const tBtn = el('button', { class: 'sqlc-indent', type: 'button' });
            tBtn.append(el('span', { text: `${tOpen ? '▾' : '▸'} ${t.name}` }));
            tBtn.append(el('span', { class: 'sqlc-meta', text: t.type === 'view' ? ' · view' : (t.rowCount != null ? ` · ${t.rowCount}${t.rowCountKind === 'estimate' ? '~' : ''}` : '') }));
            tBtn.addEventListener('click', () => {
              if (tOpen) state.openTables.delete(key);
              else { state.openTables.add(key); if (!state.columns[key]) loadColumns(schema, t.name); }
              renderSidebar();
            });
            tree.append(tBtn);
            if (tOpen) {
              const cols = state.columns[key];
              if (!cols) tree.append(el('div', { class: 'sqlc-empty', text: 'Loading…' }));
              else for (const c of cols) {
                tree.append(el('div', { class: 'sqlc-indent2 sqlc-muted', text: `${c.name} : ${c.type || 'unknown'}${c.primaryKey ? ' PK' : ''}${c.nullable ? '' : ' NOT NULL'}` }));
              }
              const q = el('button', { class: 'sqlc-indent2', type: 'button', text: '→ SELECT * …' });
              q.addEventListener('click', () => {
                editor.value = `SELECT * FROM ${quoteIdent(schema, t.name)} LIMIT 100;`;
                editor.focus();
              });
              tree.append(q);
            }
          }
        }
      }
      sideBody.append(tree);
    }

    function renderSnippets() {
      const wrap = el('div');
      if (!state.snippets.length) wrap.append(el('div', { class: 'sqlc-empty', text: 'No snippets yet. Write SQL and use “Save snippet”.' }));
      for (const s of state.snippets) {
        const row = el('div', { class: 'sqlc-snip' });
        const insert = el('button', { class: 'sqlc-btn ghost small sqlc-name', type: 'button', text: s.name });
        insert.title = s.sql;
        insert.addEventListener('click', () => { editor.value = s.sql; editor.focus(); });
        const del = el('button', { class: 'sqlc-btn ghost small', type: 'button', text: '✕' });
        del.setAttribute('aria-label', `Delete snippet ${s.name}`);
        del.addEventListener('click', () => deleteSnippet(s.id));
        row.append(insert, del);
        wrap.append(row);
      }
      sideBody.append(wrap);
    }

    function renderHistory() {
      const wrap = el('div');
      if (!state.history.length) wrap.append(el('div', { class: 'sqlc-empty', text: 'No queries run yet.' }));
      for (const h of state.history) {
        const row = el('div', { class: 'sqlc-histrow' });
        const btn = el('button', { class: 'sqlc-btn ghost small sqlc-name', type: 'button', text: h.sql.replace(/\s+/g, ' ') });
        btn.title = h.sql;
        btn.addEventListener('click', () => { editor.value = h.sql; editor.focus(); });
        row.append(btn, el('span', { class: 'sqlc-meta', text: `${h.ok ? '' : '✗ '}${h.ms}ms` }));
        wrap.append(row);
      }
      sideBody.append(wrap);
    }

    function renderResults() {
      resultsEl.replaceChildren();
      const result = state.result;
      if (!result) {
        resultsEl.append(el('div', { class: 'sqlc-empty', text: 'Run a query to see results.' }));
        return;
      }
      if (result.error) {
        resultsEl.append(el('div', { class: 'sqlc-empty', text: result.error }));
        return;
      }
      if (!result.columns || !result.columns.length) {
        const n = result.changes;
        resultsEl.append(el('div', { class: 'sqlc-note sqlc-muted', text: `${result.command || 'statement'} completed${n != null ? ` · ${n} row(s) affected` : ''}.` }));
        return;
      }
      if (result.truncated) {
        resultsEl.append(el('div', { class: 'sqlc-confirm', text: `Results truncated at ${result.rowCount} rows — add a LIMIT or raise the row limit.` }));
      }
      const total = result.rows.length;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      state.page = Math.min(state.page, pages - 1);
      const start = state.page * PAGE_SIZE;
      const slice = result.rows.slice(start, start + PAGE_SIZE);

      const table = el('table', { class: 'sqlc-grid' });
      const thead = el('thead');
      const hr = el('tr');
      for (const c of result.columns) hr.append(el('th', { text: c.name + (c.type ? ` : ${c.type}` : '') }));
      thead.append(hr);
      table.append(thead);
      const tbody = el('tbody');
      for (const row of slice) {
        const tr = el('tr');
        for (const cell of row) tr.append(renderCell(cell));
        tbody.append(tr);
      }
      table.append(tbody);
      resultsEl.append(table);

      const foot = el('div', { class: 'sqlc-toolbar' });
      const prev = el('button', { class: 'sqlc-btn small', type: 'button', text: '‹ Prev', disabled: state.page <= 0 });
      const next = el('button', { class: 'sqlc-btn small', type: 'button', text: 'Next ›', disabled: state.page >= pages - 1 });
      prev.addEventListener('click', () => { state.page -= 1; renderResults(); });
      next.addEventListener('click', () => { state.page += 1; renderResults(); });
      foot.append(prev, next, el('span', { class: 'sqlc-meta', text: `${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total}` }));
      foot.append(el('span', { class: 'sqlc-spacer' }));
      const csvBtn = el('button', { class: 'sqlc-btn small', type: 'button', text: 'Export CSV' });
      csvBtn.addEventListener('click', () => downloadCsv(result));
      foot.append(csvBtn);
      resultsEl.append(foot);
    }

    async function init() {
      renderResults();
      renderSidebar();
      await refreshStatus();
      await loadSchemas();
      await refreshSnippets();
    }
    init();

    const cleanup = () => { for (const fn of cleanups) { try { fn(); } catch { /* ignore */ } } };
    return cleanup;
  }

  return () => { /* apps registered via ctx are disposed on unload */ };
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function el(tag, props = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key === 'disabled' || value === true) node.setAttribute(key, value === true ? '' : value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (let i = 2; i < arguments.length; i += 1) {
    const child = arguments[i];
    if (!child) continue;
    const list = Array.isArray(child) ? child : [child];
    for (const c of list) if (c) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function renderCell(value) {
  const td = document.createElement('td');
  if (value === null || value === undefined) {
    td.append(el('span', { class: 'sqlc-null', text: 'NULL' }));
  } else if (typeof value === 'number') {
    td.className = 'num';
    td.textContent = String(value);
  } else if (typeof value === 'boolean') {
    td.textContent = value ? 'true' : 'false';
  } else if (typeof value === 'object') {
    td.textContent = JSON.stringify(value);
  } else {
    const text = String(value);
    td.textContent = text;
    td.title = text;
  }
  return td;
}

function quoteIdent(schema, name) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return schema && schema !== 'main' ? `${esc(schema)}.${esc(name)}` : esc(name);
}

function truncate(text, n) {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function downloadCsv(result) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [result.columns.map((c) => esc(c.name)).join(',')];
  for (const row of result.rows) lines.push(row.map(esc).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sql-console-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
