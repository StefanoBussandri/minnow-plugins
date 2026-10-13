// API Scratchpad — trusted UI module (runs in Minnow's document).
// All network access goes through this package's native tools via ctx.callTool.
// Connection secrets are never read or rendered here.

const STYLE_ID = 'apis-style';
const HISTORY_KEY = 'api-scratch:history';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const CSS = `
.apis-root { display:flex; flex-direction:column; height:100%; min-height:0; box-sizing:border-box; background:var(--mn-bg); color:var(--mn-fg); font:13px/1.45 var(--mn-font, system-ui, sans-serif); }
.apis-head { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--mn-border); flex-wrap:wrap; flex:0 0 auto; }
.apis-title { font-weight:700; font-size:14px; }
.apis-spacer { flex:1 1 auto; }
.apis-bar { display:flex; gap:8px; align-items:center; padding:10px 12px; border-bottom:1px solid var(--mn-border); flex:0 0 auto; }
.apis-body { display:flex; flex:1 1 auto; min-height:0; }
.apis-side { width:290px; flex:0 0 auto; border-right:1px solid var(--mn-border); display:flex; flex-direction:column; min-height:0; }
.apis-tabs { display:flex; border-bottom:1px solid var(--mn-border); flex:0 0 auto; }
.apis-tabs button { flex:1; background:transparent; border:0; padding:8px 4px; color:var(--mn-fg-muted); cursor:pointer; font:inherit; }
.apis-tabs button[aria-selected="true"] { color:var(--mn-fg); box-shadow:inset 0 -2px 0 var(--mn-accent); }
.apis-sidebody { overflow:auto; padding:8px; flex:1 1 auto; min-height:0; }
.apis-main { flex:1 1 auto; display:flex; flex-direction:column; min-width:0; min-height:0; }
.apis-btns { display:flex; gap:6px; padding:8px 12px; border-bottom:1px solid var(--mn-border); flex-wrap:wrap; flex:0 0 auto; }
.apis-pad { padding:10px 12px; overflow:auto; flex:1 1 auto; min-height:0; }
.apis-input, .apis-select, .apis-area { box-sizing:border-box; padding:5px 8px; border-radius:6px; border:1px solid var(--mn-border); background:var(--mn-surface-1, var(--mn-bg)); color:var(--mn-fg); font:inherit; }
.apis-area { width:100%; font:12px/1.5 ui-monospace, Consolas, "Cascadia Code", monospace; resize:vertical; min-height:120px; }
.apis-btn { display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:6px; border:1px solid var(--mn-border); background:var(--mn-surface-2, var(--mn-bg-hover)); color:var(--mn-fg); font:inherit; cursor:pointer; }
.apis-btn:hover:not(:disabled) { background:var(--mn-surface-3, var(--mn-bg-hover)); }
.apis-btn:disabled { opacity:.5; cursor:default; }
.apis-btn.primary { background:var(--mn-accent); border-color:var(--mn-accent); color:var(--mn-fg-on-accent, #fff); }
.apis-btn.small { padding:2px 7px; font-size:12px; }
.apis-btn.ghost { background:transparent; }
.apis-input:focus-visible, .apis-select:focus-visible, .apis-area:focus-visible, .apis-btn:focus-visible, .apis-tabs button:focus-visible { outline:2px solid var(--mn-accent); outline-offset:1px; }
.apis-chip { display:inline-flex; align-items:center; gap:6px; padding:2px 9px; border-radius:999px; font-size:12px; border:1px solid var(--mn-border); }
.apis-chip.ok { color:var(--mn-success, var(--mn-accent)); border-color:var(--mn-success, var(--mn-accent)); }
.apis-chip.bad { color:var(--mn-danger, #e5534b); border-color:var(--mn-danger, #e5534b); }
.apis-chip.idle { color:var(--mn-fg-muted); }
.apis-muted { color:var(--mn-fg-muted); }
.apis-empty { padding:14px; color:var(--mn-fg-muted); }
.apis-hrow { display:flex; gap:6px; align-items:center; margin-bottom:6px; font:12px ui-monospace, Consolas, monospace; }
.apis-grid { display:grid; grid-template-columns:auto 1fr auto 1fr auto; gap:6px; align-items:center; }
.apis-list { display:flex; flex-direction:column; }
.apis-row { display:flex; gap:6px; align-items:center; padding:3px 2px; }
.apis-row .apis-name { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.apis-indent { padding-left:16px; }
.apis-pre { margin:0; padding:10px 12px; background:var(--mn-surface-1, var(--mn-bg)); border:1px solid var(--mn-border); border-radius:6px; font:12px/1.5 ui-monospace, Consolas, monospace; white-space:pre-wrap; word-break:break-word; max-height:46vh; overflow:auto; }
.apis-note { padding:8px 10px; border-radius:6px; background:var(--mn-warning-soft, rgba(210,153,34,.14)); margin-bottom:8px; }

/* Dock: a panel between the chat column and the right file sidebar.
   420px is the floor; drag the handle (or use the arrow keys) to widen it. */
.apis-dock { position:relative; container-type:inline-size; flex:0 0 auto; width:420px; min-width:420px; max-width:none; display:flex; flex-direction:column; min-height:0; border-left:1px solid var(--mn-border); background:var(--mn-surface-1, var(--mn-bg)); }
.apis-dock[hidden] { display:none; }
/* Mirrors core's .sidebar-resizer: 6px grab strip straddling the edge. */
.apis-dock-resizer { cursor:col-resize; touch-action:none; z-index:2; background:0 0; flex:none; width:6px; position:absolute; top:0; bottom:0; left:-3px; }
.apis-dock-resizer:hover, .apis-dock-resizer.is-dragging { background:var(--mn-accent-soft); }
.apis-dock-resizer:focus-visible { background:var(--mn-accent-soft); outline:2px solid var(--mn-accent); outline-offset:-1px; }
/* Active state for the toolbar tab, matching core's browser/git toggles
   (they use .is-active + color/background from --mn-accent). The id keeps it
   ahead of core's .file-sidebar-header-actions .icon-btn:hover rule. */
#plugin-api-scratch-sidebar-tab.is-active { color:var(--mn-accent); background:color-mix(in srgb, var(--mn-accent) 14%, transparent); }
#plugin-api-scratch-sidebar-tab.is-active:hover { color:var(--mn-accent); background:color-mix(in srgb, var(--mn-accent) 14%, transparent); }
.apis-dock-head { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid var(--mn-border); flex:0 0 auto; }
.apis-dock-title { font-weight:600; font-size:12px; }
.apis-dock-close { margin-left:auto; }
.apis-dock-body { flex:1 1 auto; min-height:0; display:flex; }
.apis-dock .apis-root { flex:1 1 auto; min-width:0; }
.apis-dock .apis-body { flex-direction:column; }
.apis-dock .apis-side { width:100%; max-height:42%; border-right:0; border-bottom:1px solid var(--mn-border); }
/* Widen the panel and it recovers the roomy two-column app layout. */
@container (min-width:640px) {
  .apis-dock .apis-body { flex-direction:row; }
  .apis-dock .apis-side { width:260px; max-height:none; border-right:1px solid var(--mn-border); border-bottom:0; }
}

/* --- Minnow-native polish ------------------------------------------------
   Keep every control on core's tokens and metrics so the panel reads as part
   of Minnow rather than a separate app: transparent bordered buttons, radius
   from --radius-sm, --font-ui / --font-mono, accent-soft focus rings. */
.apis-root { background:var(--mn-surface-1, var(--mn-bg)); font:13px/1.45 var(--font-ui, system-ui, sans-serif); }
.apis-dock-title, .apis-title { font-family:var(--font-ui, system-ui, sans-serif); font-size:13px; font-weight:600; }
.apis-head { padding:8px 10px; gap:8px; }
.apis-bar { padding:8px 10px; gap:8px; }
.apis-btn { border:1px solid var(--mn-border); border-radius:var(--radius-sm, 6px); background:0 0; color:var(--mn-fg); padding:6px 12px; font:13px var(--font-ui, system-ui, sans-serif); cursor:pointer; transition:border-color .2s var(--ease-out, ease), background-color .2s var(--ease-out, ease), color .2s var(--ease-out, ease); }
.apis-btn:hover:not(:disabled) { background:var(--mn-surface-elevated, var(--mn-surface-2)); }
.apis-btn.primary { background:var(--mn-accent); border-color:var(--mn-accent); color:var(--mn-fg-on-accent, #fff); }
.apis-btn.primary:hover:not(:disabled) { background:color-mix(in srgb, var(--mn-accent) 88%, var(--mn-fg)); }
.apis-btn.small { padding:4px 9px; font-size:12px; }
.apis-btns { padding:8px 10px; gap:6px; }
.apis-input, .apis-select { background:var(--mn-surface-2, var(--mn-bg)); border:1px solid var(--mn-border); border-radius:var(--radius-sm, 6px); padding:6px 8px; font:13px var(--font-ui, system-ui, sans-serif); }
.apis-area { background:var(--mn-surface-1, var(--mn-bg)); color:var(--mn-fg); font:12px/1.5 var(--font-mono, ui-monospace, monospace); }
.apis-input:focus-visible, .apis-select:focus-visible, .apis-area:focus-visible, .apis-btn:focus-visible, .apis-tabs button:focus-visible { outline:2px solid var(--mn-accent-soft, var(--mn-accent)); outline-offset:1px; }
.apis-tabs button { font-size:12px; color:var(--mn-fg-muted); font-family:var(--font-ui, system-ui, sans-serif); }
.apis-tabs button[aria-selected="true"] { color:var(--mn-fg); }
.apis-hrow { font-family:var(--font-mono, ui-monospace, monospace); }
.apis-pre { background:var(--mn-surface-2, var(--mn-bg)); border:1px solid var(--mn-border); border-radius:var(--radius-sm, 6px); font-family:var(--font-mono, ui-monospace, monospace); }
.apis-chip { font-size:12px; font-family:var(--font-ui, system-ui, sans-serif); }
.apis-chip.ok { color:var(--mn-accent); border-color:var(--mn-accent); }
.apis-chip.bad { color:var(--mn-danger, #e5534b); border-color:var(--mn-danger, #e5534b); }
.apis-note { background:var(--mn-surface-elevated, var(--mn-surface-2)); }
.apis-dock-head { padding:6px 8px; gap:6px; }
.apis-dock-head .icon-btn { width:28px; height:28px; }
`;

export default function activate(ctx) {
  // Every contribution is registered independently: an error anywhere here
  // removes *all* of this module's contributions, so one rejected call must
  // not take down the rest.
  const safe = (fn, what) => {
    try { return fn(); } catch (error) { console.warn(`[api-scratch] ${what} unavailable`, error); }
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
    id: 'open_scratchpad',
    title: 'Toggle API Scratchpad panel',
    group: 'Plugins',
    run: () => toggleDock(true),
  }), 'command palette entry');

  safe(() => ctx.registerSlashCommand({
    id: 'api',
    alias: 'api',
    label: 'API Scratchpad',
    description: 'Toggle the API Scratchpad panel',
    run: () => toggleDock(true),
  }), 'slash command');

  // ---- Docked panel ---------------------------------------------------------
  // Renders between the chat column and the right file sidebar, in the same
  // region the browser preview uses. Minnow's plugin API has no extension point
  // for that pane, so this is our own element inserted next to `.file-sidebar`
  // and re-asserted by a MutationObserver when core redraws the layout.
  const DOCK_ID = 'plugin-api-scratch-dock';
  const TAB_ID = 'plugin-api-scratch-sidebar-tab';
  const RESIZER_CLASS = 'apis-dock-resizer';
  // 420px is the width the panel opens at, so it is also the floor.
  const MIN_WIDTH = 420;
  const WIDTH_KEY = 'api-scratch:dock-width';
  // Stamped on the nodes we create. A superseded module instance must never
  // adopt our elements: its controls are wired to a disposed ctx and throw
  // "Plugin UI is no longer active".
  const OWNER = `apis-${Math.random().toString(36).slice(2, 9)}`;
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
    const dock = el('aside', { id: DOCK_ID, class: 'apis-dock', 'aria-label': 'API Scratchpad panel' });
    dock.dataset.owner = OWNER;
    const head = el('div', { class: 'apis-dock-head' });
    head.append(el('span', { class: 'apis-dock-title', text: 'API Scratchpad' }));
    const close = el('button', {
      class: 'apis-dock-close icon-btn',
      type: 'button',
      title: 'Close panel',
      'aria-label': 'Close API Scratchpad panel',
    });
    close.append(el('i', { class: 'fi fi-rr-cross-small icon-svg', 'aria-hidden': 'true' }));
    close.addEventListener('click', () => toggleDock(false));
    head.append(close);
    const body = el('div', { class: 'apis-dock-body' });
    const resizer = el('div', {
      class: RESIZER_CLASS,
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize API Scratchpad panel',
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
      title: 'API Scratchpad panel',
      'aria-label': 'Toggle API Scratchpad panel',
      'aria-pressed': 'false',
    });
    button.dataset.owner = OWNER;
    button.append(el('i', { class: 'fi fi-rr-paper-plane icon-svg', 'aria-hidden': 'true' }));
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
    const state = {
      method: 'GET',
      url: '',
      headers: [{ key: '', value: '', enabled: true }],
      body: '',
      bodyKind: 'json', // none | json | form | raw
      sending: false,
      runToken: 0,
      response: null,
      pretty: true,
      sidebar: 'collections',
      collections: [],
      openCollections: new Set(),
      collectionItems: {},
      selectedCollection: null,
      history: loadHistory(),
      envs: { active: null, environments: [] },
      envDraft: '',
      newEnvName: '',
      saveName: '',
    };

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
      state.history = [entry, ...state.history.filter((h) => !(h.method === entry.method && h.url === entry.url))].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch { /* ignore */ }
    }

    // ---- DOM ----
    const rootEl = el('div', { class: 'apis-root' });
    root.append(rootEl);

    const headEl = el('div', { class: 'apis-head' });
    headEl.append(el('span', { class: 'apis-title', text: 'API Scratchpad' }));
    const statusChip = el('span', { class: 'apis-chip idle', text: 'Ready' });
    headEl.append(statusChip);
    headEl.append(el('span', { class: 'apis-spacer' }));
    const envLabel = el('span', { class: 'apis-muted', text: 'Environment' });
    const envSelect = el('select', { class: 'apis-select' });
    envSelect.setAttribute('aria-label', 'Active environment');
    envSelect.addEventListener('change', () => { state.activeEnvOverride = envSelect.value || null; });
    headEl.append(envLabel, envSelect);
    rootEl.append(headEl);

    const barEl = el('div', { class: 'apis-bar' });
    const methodSelect = el('select', { class: 'apis-select' });
    for (const m of METHODS) methodSelect.append(el('option', { text: m, value: m }));
    methodSelect.value = state.method;
    methodSelect.addEventListener('change', () => { state.method = methodSelect.value; });
    const urlInput = el('input', { class: 'apis-input', type: 'text', placeholder: 'https://api.example.com/v1/things  or  {{baseUrl}}/things', style: 'flex:1 1 auto; min-width:0' });
    urlInput.setAttribute('aria-label', 'Request URL');
    urlInput.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } });
    const sendBtn = el('button', { class: 'apis-btn primary', type: 'button', text: 'Send' });
    sendBtn.addEventListener('click', () => send());
    const cancelBtn = el('button', { class: 'apis-btn', type: 'button', text: 'Cancel', disabled: true });
    cancelBtn.addEventListener('click', () => { state.runToken += 1; setSending(false); });
    barEl.append(methodSelect, urlInput, sendBtn, cancelBtn);
    rootEl.append(barEl);

    const bodyEl = el('div', { class: 'apis-body' });
    rootEl.append(bodyEl);

    const sideEl = el('div', { class: 'apis-side' });
    const tabsEl = el('div', { class: 'apis-tabs', role: 'tablist' });
    const tabButtons = {};
    for (const [key, label] of [['collections', 'Collections'], ['history', 'History']]) {
      const b = el('button', { type: 'button', role: 'tab', text: label });
      b.setAttribute('aria-selected', String(key === state.sidebar));
      b.addEventListener('click', () => { state.sidebar = key; syncTabs(); renderSidebar(); });
      tabButtons[key] = b;
      tabsEl.append(b);
    }
    const sideBody = el('div', { class: 'apis-sidebody' });
    sideEl.append(tabsEl, sideBody);
    bodyEl.append(sideEl);

    const mainEl = el('div', { class: 'apis-main' });
    bodyEl.append(mainEl);

    const btnRow = el('div', { class: 'apis-btns' });
    const reqTabs = {};
    for (const [key, label] of [['headers', 'Headers'], ['body', 'Body'], ['env', 'Environment']]) {
      const b = el('button', { class: 'apis-btn small', type: 'button', text: label });
      b.addEventListener('click', () => { state.reqTab = key; renderMain(); });
      reqTabs[key] = b;
      btnRow.append(b);
    }
    btnRow.append(el('span', { class: 'apis-spacer' }));
    mainEl.append(btnRow);

    const reqPane = el('div', { class: 'apis-pad' });
    mainEl.append(reqPane);

    const respEl = el('div', { class: 'apis-pad', style: 'border-top:1px solid var(--mn-border)' });
    mainEl.append(respEl);

    function syncTabs() {
      for (const [key, b] of Object.entries(tabButtons)) b.setAttribute('aria-selected', String(key === state.sidebar));
    }
    function setSending(sending) {
      state.sending = sending;
      sendBtn.disabled = sending;
      sendBtn.textContent = sending ? 'Sending…' : 'Send';
      cancelBtn.disabled = !sending;
    }
    function setStatus(kind, text) {
      statusChip.className = `apis-chip ${kind}`;
      statusChip.textContent = text;
    }

    function buildArgs() {
      const headers = state.headers
        .filter((h) => h.key.trim() && h.enabled)
        .map((h) => ({ key: h.key.trim(), value: h.value, enabled: true }));
      const args = {
        url: urlInput.value.trim(),
        method: state.method,
        headers,
        environment: state.activeEnvOverride || undefined,
      };
      if (state.bodyKind !== 'none' && state.method !== 'GET' && state.method !== 'HEAD' && state.body) {
        args.body = state.body;
        args.content_type = state.bodyKind === 'json' ? 'application/json'
          : state.bodyKind === 'form' ? 'application/x-www-form-urlencoded'
            : 'text/plain';
      }
      return args;
    }

    async function send() {
      const args = buildArgs();
      if (!args.url) { urlInput.focus(); return; }
      const token = ++state.runToken;
      setSending(true);
      setStatus('idle', 'Sending…');
      try {
        const result = await call('http_request', args);
        if (token !== state.runToken) return;
        state.response = result;
        pushHistory({ method: args.method, url: args.url, at: Date.now(), status: result.status });
        setStatus(result.ok ? 'ok' : 'bad', `${result.status} ${result.statusText}`);
      } catch (error) {
        if (token !== state.runToken) return;
        state.response = { error: String(error.message || error) };
        pushHistory({ method: args.method, url: args.url, at: Date.now(), status: 0 });
        setStatus('bad', `Error: ${truncate(String(error.message || error), 70)}`);
      } finally {
        if (token === state.runToken) { setSending(false); renderResponse(); renderSidebar(); }
      }
    }

    // ---- rendering ----
    function renderMain() {
      reqPane.replaceChildren();
      for (const [key, b] of Object.entries(reqTabs)) {
        const active = key === (state.reqTab || 'headers');
        b.style.borderColor = active ? 'var(--mn-accent)' : '';
        b.style.color = active ? 'var(--mn-fg)' : 'var(--mn-fg-muted)';
      }
      const tab = state.reqTab || 'headers';
      if (tab === 'headers') renderHeaders();
      else if (tab === 'body') renderBody();
      else renderEnv();
    }

    function renderHeaders() {
      const wrap = el('div');
      wrap.append(el('div', { class: 'apis-muted', text: 'Extra headers. Default headers and auth come from the plugin connection.' }));
      const grid = el('div', { style: 'margin-top:8px' });
      state.headers.forEach((h, i) => {
        const row = el('div', { class: 'apis-hrow' });
        const on = el('input', { type: 'checkbox' });
        on.checked = h.enabled;
        on.setAttribute('aria-label', `Header ${i + 1} enabled`);
        on.addEventListener('change', () => { h.enabled = on.checked; });
        const key = el('input', { class: 'apis-input', type: 'text', placeholder: 'Header', value: h.key, style: 'flex:1 1 40%' });
        key.setAttribute('aria-label', `Header ${i + 1} name`);
        key.addEventListener('input', () => { h.key = key.value; });
        const val = el('input', { class: 'apis-input', type: 'text', placeholder: 'value', value: h.value, style: 'flex:1 1 60%' });
        val.setAttribute('aria-label', `Header ${i + 1} value`);
        val.addEventListener('input', () => { h.value = val.value; });
        const del = el('button', { class: 'apis-btn small', type: 'button', text: '✕' });
        del.setAttribute('aria-label', `Remove header ${i + 1}`);
        del.addEventListener('click', () => { state.headers.splice(i, 1); if (!state.headers.length) state.headers.push({ key: '', value: '', enabled: true }); renderMain(); });
        row.append(on, key, val, del);
        grid.append(row);
      });
      wrap.append(grid);
      const add = el('button', { class: 'apis-btn small', type: 'button', text: '+ Add header' });
      add.addEventListener('click', () => { state.headers.push({ key: '', value: '', enabled: true }); renderMain(); });
      wrap.append(add);
      reqPane.append(wrap);
    }

    function renderBody() {
      const wrap = el('div');
      const kindRow = el('div', { class: 'apis-hrow' });
      kindRow.append(el('span', { class: 'apis-muted', text: 'Content type' }));
      const sel = el('select', { class: 'apis-select' });
      for (const [value, label] of [['none', 'none'], ['json', 'application/json'], ['form', 'x-www-form-urlencoded'], ['raw', 'text/plain']]) {
        sel.append(el('option', { text: label, value }));
      }
      sel.value = state.bodyKind;
      sel.addEventListener('change', () => { state.bodyKind = sel.value; });
      kindRow.append(sel);
      wrap.append(kindRow);
      const area = el('textarea', { class: 'apis-area', spellcheck: 'false', placeholder: 'Request body' });
      area.value = state.body;
      area.setAttribute('aria-label', 'Request body');
      area.addEventListener('input', () => { state.body = area.value; });
      area.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } });
      wrap.append(area);
      reqPane.append(wrap);
    }

    function renderEnv() {
      const wrap = el('div');
      wrap.append(el('div', { class: 'apis-note', text: 'Environment values fill {{placeholders}} in the URL, headers and body. Secrets belong in the plugin connection, not here.' }));

      const row = el('div', { class: 'apis-hrow' });
      const sel = el('select', { class: 'apis-select' });
      for (const env of state.envs.environments) sel.append(el('option', { text: env.name, value: env.name }));
      sel.value = state.envs.active || '';
      sel.setAttribute('aria-label', 'Environment to edit');
      sel.addEventListener('change', () => { state.envEditing = sel.value; state.envDraft = toLines(state.envs.environments.find((e) => e.name === sel.value)?.vars || {}); renderMain(); });
      row.append(el('span', { class: 'apis-muted', text: 'Editing' }), sel);
      const newName = el('input', { class: 'apis-input', type: 'text', placeholder: 'new environment name', style: 'width:170px' });
      newName.setAttribute('aria-label', 'New environment name');
      const create = el('button', { class: 'apis-btn small', type: 'button', text: 'New' });
      create.addEventListener('click', async () => {
        const name = newName.value.trim();
        if (!name) return;
        try { await call('http_save_environment', { name, vars: {} }); newName.value = ''; await loadEnvs(); state.envEditing = name; state.envDraft = ''; renderMain(); renderEnvSelect(); }
        catch (error) { setStatus('bad', `Error: ${truncate(String(error.message || error), 60)}`); }
      });
      row.append(newName, create);
      wrap.append(row);

      const editing = state.envEditing || state.envs.active || (state.envs.environments[0] && state.envs.environments[0].name) || '';
      const area = el('textarea', { class: 'apis-area', spellcheck: 'false', placeholder: 'KEY=value\nbaseUrl=https://api.example.com' });
      area.value = state.envDraft || '';
      area.setAttribute('aria-label', 'Environment variables');
      area.addEventListener('input', () => { state.envDraft = area.value; });
      wrap.append(area);

      const actions = el('div', { class: 'apis-hrow' });
      const save = el('button', { class: 'apis-btn small', type: 'button', text: 'Save environment' });
      save.addEventListener('click', async () => {
        if (!editing) return;
        try {
          await call('http_save_environment', { name: editing, vars: fromLines(area.value), active: true });
          await loadEnvs();
          state.activeEnvOverride = editing;
          renderEnvSelect();
          setStatus('ok', `Saved ${editing}`);
        } catch (error) { setStatus('bad', `Error: ${truncate(String(error.message || error), 60)}`); }
      });
      actions.append(save);
      if (editing) actions.append(el('span', { class: 'apis-muted', text: `Editing "${editing}"` }));
      wrap.append(actions);
      reqPane.append(wrap);
    }

    async function loadEnvs() {
      try { state.envs = await call('http_list_environments'); }
      catch { state.envs = { active: null, environments: [] }; }
    }
    function renderEnvSelect() {
      const prev = state.activeEnvOverride ?? (state.envs.active || '');
      envSelect.replaceChildren();
      envSelect.append(el('option', { text: '(none)', value: '' }));
      for (const env of state.envs.environments) envSelect.append(el('option', { text: env.name, value: env.name }));
      envSelect.value = prev;
      state.activeEnvOverride = envSelect.value || null;
    }

    function renderResponse() {
      respEl.replaceChildren();
      const r = state.response;
      if (!r) { respEl.append(el('div', { class: 'apis-empty', text: 'Send a request to see the response.' })); return; }
      if (r.error) { respEl.append(el('div', { class: 'apis-empty', text: r.error })); return; }

      const meta = el('div', { class: 'apis-hrow', style: 'flex-wrap:wrap; gap:12px; font:inherit' });
      meta.append(el('span', { class: `apis-chip ${r.ok ? 'ok' : 'bad'}`, text: `${r.status} ${r.statusText}` }));
      meta.append(el('span', { class: 'apis-muted', text: `${r.durationMs} ms` }));
      meta.append(el('span', { class: 'apis-muted', text: formatBytes(r.sizeBytes) }));
      if (r.environment) meta.append(el('span', { class: 'apis-muted', text: `env: ${r.environment}` }));
      if (r.truncated) meta.append(el('span', { class: 'apis-chip bad', text: 'truncated' }));
      respEl.append(meta);

      const actions = el('div', { class: 'apis-hrow', style: 'margin:8px 0' });
      const prettyBtn = el('button', { class: 'apis-btn small', type: 'button', text: state.pretty ? 'Showing pretty' : 'Show pretty' });
      prettyBtn.addEventListener('click', () => { state.pretty = true; renderResponse(); });
      const rawBtn = el('button', { class: 'apis-btn small', type: 'button', text: state.pretty ? 'Show raw' : 'Showing raw' });
      rawBtn.addEventListener('click', () => { state.pretty = false; renderResponse(); });
      const copyBtn = el('button', { class: 'apis-btn small', type: 'button', text: 'Copy body' });
      copyBtn.addEventListener('click', () => copyText(displayBody(r), copyBtn));
      const hdrsBtn = el('button', { class: 'apis-btn small', type: 'button', text: 'Response headers' });
      const headersBox = el('div');
      headersBox.hidden = true;
      hdrsBtn.addEventListener('click', () => { headersBox.hidden = !headersBox.hidden; });
      const hTable = el('div', { class: 'apis-muted', style: 'font:12px ui-monospace, monospace; margin-top:6px' });
      for (const [k, v] of Object.entries(r.headers || {})) hTable.append(el('div', { text: `${k}: ${v}` }));
      headersBox.append(hTable);
      actions.append(prettyBtn, rawBtn, copyBtn, hdrsBtn);
      respEl.append(actions, headersBox);

      const pre = el('pre', { class: 'apis-pre' });
      pre.textContent = displayBody(r);
      respEl.append(pre);
    }

    function displayBody(r) {
      const raw = String(r.body ?? '');
      if (!state.pretty) return raw;
      if ((r.contentType || '').includes('json') || /^[\s]*[[{]/.test(raw)) {
        try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
      }
      return raw;
    }

    function renderSidebar() {
      sideBody.replaceChildren();
      if (state.sidebar === 'collections') renderCollections();
      else renderHistory();
    }

    async function loadCollections() {
      try { state.collections = (await call('http_list_collections')).collections || []; }
      catch { state.collections = []; }
      renderSidebar();
    }

    function renderCollections() {
      const saveRow = el('div', { class: 'apis-row' });
      const nameInput = el('input', { class: 'apis-input', type: 'text', placeholder: 'collection name', value: state.saveName, style: 'flex:1 1 auto' });
      nameInput.setAttribute('aria-label', 'Collection name');
      nameInput.addEventListener('input', () => { state.saveName = nameInput.value; });
      const saveBtn = el('button', { class: 'apis-btn small', type: 'button', text: 'Save request' });
      saveBtn.addEventListener('click', saveCurrentRequest);
      saveRow.append(nameInput, saveBtn);
      sideBody.append(saveRow);

      const list = el('div', { class: 'apis-list' });
      if (!state.collections.length) list.append(el('div', { class: 'apis-empty', text: 'No collections yet.' }));
      for (const col of state.collections) {
        const open = state.openCollections.has(col.id);
        const row = el('div', { class: 'apis-row' });
        const toggle = el('button', { class: 'apis-btn ghost small apis-name', type: 'button', text: `${open ? '▾' : '▸'} ${col.name} (${col.itemCount})` });
        toggle.addEventListener('click', () => {
          if (open) state.openCollections.delete(col.id);
          else { state.openCollections.add(col.id); if (!state.collectionItems[col.id]) loadCollectionItems(col.id); }
          renderSidebar();
        });
        const del = el('button', { class: 'apis-btn ghost small', type: 'button', text: '✕' });
        del.setAttribute('aria-label', `Delete collection ${col.name}`);
        del.addEventListener('click', async () => {
          try { await call('http_delete_collection', { id: col.id }); if (state.selectedCollection === col.id) state.selectedCollection = null; await loadCollections(); }
          catch (error) { setStatus('bad', `Error: ${truncate(String(error.message || error), 60)}`); }
        });
        row.append(toggle, del);
        list.append(row);
        if (open) {
          const items = state.collectionItems[col.id];
          if (!items) list.append(el('div', { class: 'apis-empty', text: 'Loading…' }));
          else if (!items.length) list.append(el('div', { class: 'apis-empty apis-indent', text: 'No requests.' }));
          else for (const item of items) {
            const irow = el('div', { class: 'apis-row apis-indent' });
            const load = el('button', { class: 'apis-btn ghost small apis-name', type: 'button', text: `${item.request?.method || 'GET'} ${item.name}` });
            load.title = item.request?.url || '';
            load.addEventListener('click', () => loadRequest(item.request || {}));
            const run = el('button', { class: 'apis-btn ghost small', type: 'button', text: 'Run' });
            run.addEventListener('click', () => runItem(col.id, item.id));
            const idel = el('button', { class: 'apis-btn ghost small', type: 'button', text: '✕' });
            idel.setAttribute('aria-label', `Delete request ${item.name}`);
            idel.addEventListener('click', () => deleteItem(col.id, item.id));
            irow.append(load, run, idel);
            list.append(irow);
          }
        }
      }
      sideBody.append(list);
    }

    function renderHistory() {
      const wrap = el('div', { class: 'apis-list' });
      if (!state.history.length) wrap.append(el('div', { class: 'apis-empty', text: 'No requests sent yet.' }));
      for (const h of state.history) {
        const row = el('div', { class: 'apis-row' });
        const btn = el('button', { class: 'apis-btn ghost small apis-name', type: 'button', text: `${h.method} ${h.url}` });
        btn.title = h.url;
        btn.addEventListener('click', () => { state.method = h.method; methodSelect.value = h.method; urlInput.value = h.url; });
        row.append(btn, el('span', { class: 'apis-muted', text: h.status ? String(h.status) : 'err' }));
        wrap.append(row);
      }
      sideBody.append(wrap);
    }

    async function loadCollectionItems(id) {
      try {
        const full = (await call('http_get_collection', { id })).collection;
        state.collectionItems[id] = full.items || [];
      } catch { state.collectionItems[id] = []; }
      renderSidebar();
    }

    function loadRequest(request) {
      state.method = request.method || 'GET';
      methodSelect.value = state.method;
      urlInput.value = request.url || '';
      state.headers = (request.headers && request.headers.length) ? request.headers.map((h) => ({ key: h.key || '', value: h.value || '', enabled: h.enabled !== false })) : [{ key: '', value: '', enabled: true }];
      state.body = request.body || '';
      state.bodyKind = request.contentType === 'application/json' ? 'json'
        : request.contentType === 'application/x-www-form-urlencoded' ? 'form'
          : request.body ? 'raw' : 'json';
      if (request.environment) { state.activeEnvOverride = request.environment; envSelect.value = request.environment; }
      state.reqTab = 'headers';
      renderMain();
    }

    function currentItem() {
      return {
        name: `${state.method} ${safeName(urlInput.value) }`,
        request: {
          method: state.method,
          url: urlInput.value.trim(),
          headers: state.headers.filter((h) => h.key.trim()),
          body: state.body,
          contentType: state.bodyKind === 'json' ? 'application/json' : state.bodyKind === 'form' ? 'application/x-www-form-urlencoded' : state.bodyKind === 'raw' ? 'text/plain' : '',
          environment: state.activeEnvOverride || '',
        },
      };
    }

    async function saveCurrentRequest() {
      const name = state.saveName.trim();
      if (!name) { setStatus('bad', 'Name the collection first'); return; }
      if (!urlInput.value.trim()) { urlInput.focus(); return; }
      try {
        let collection = state.collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
        let items = [];
        if (collection) {
          const full = (await call('http_get_collection', { id: collection.id })).collection;
          items = (full.items || []).concat([currentItem()]);
        } else {
          items = [currentItem()];
        }
        const saved = await call('http_save_collection', { id: collection ? collection.id : undefined, name, items });
        state.collectionItems[saved.collection.id] = saved.collection.items;
        state.openCollections.add(saved.collection.id);
        await loadCollections();
        setStatus('ok', `Saved to ${name}`);
      } catch (error) { setStatus('bad', `Error: ${truncate(String(error.message || error), 60)}`); }
    }

    async function deleteItem(collectionId, itemId) {
      try {
        const full = (await call('http_get_collection', { id: collectionId })).collection;
        const items = (full.items || []).filter((i) => i.id !== itemId);
        const saved = await call('http_save_collection', { id: collectionId, name: full.name, items });
        state.collectionItems[collectionId] = saved.collection.items;
        await loadCollections();
      } catch (error) { setStatus('bad', `Error: ${truncate(String(error.message || error), 60)}`); }
    }

    async function runItem(collectionId, itemId) {
      const token = ++state.runToken;
      setSending(true);
      setStatus('idle', 'Sending…');
      try {
        const result = await call('http_run_collection_item', { collection_id: collectionId, item_id: itemId });
        if (token !== state.runToken) return;
        state.response = result;
        pushHistory({ method: result.method, url: result.url, at: Date.now(), status: result.status });
        setStatus(result.ok ? 'ok' : 'bad', `${result.status} ${result.statusText}`);
      } catch (error) {
        if (token !== state.runToken) return;
        state.response = { error: String(error.message || error) };
        setStatus('bad', `Error: ${truncate(String(error.message || error), 70)}`);
      } finally {
        if (token === state.runToken) { setSending(false); renderResponse(); }
      }
    }

    async function init() {
      renderMain();
      renderResponse();
      renderSidebar();
      await loadCollections();
      await loadEnvs();
      renderEnvSelect();
      if (state.envs.active) {
        const env = state.envs.environments.find((e) => e.name === state.envs.active);
        state.envEditing = state.envs.active;
        state.envDraft = env ? toLines(env.vars) : '';
      }
    }
    init();

    return () => { /* apps registered via ctx are disposed on unload */ };
  }

  return () => { /* disposed on unload */ };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function el(tag, props = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key === 'disabled' || value === true) node.setAttribute(key, value === true ? '' : value);
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

function toLines(vars) {
  return Object.entries(vars || {}).map(([k, v]) => `${k}=${v}`).join('\n');
}

function fromLines(text) {
  const out = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function formatBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncate(text, n) {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function safeName(url) {
  try { return new URL(url).pathname || '/'; } catch { return url.slice(0, 40); }
}

async function copyText(text, button) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    if (button) { const label = button.textContent; button.textContent = 'Copied'; setTimeout(() => { button.textContent = label; }, 1200); }
  } catch { /* clipboard unavailable */ }
}
