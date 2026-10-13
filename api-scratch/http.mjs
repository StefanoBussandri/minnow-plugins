// Shared HTTP logic for the api-scratch plugin (native handler side).
//
// Everything here runs in a fresh worker per tool call, so all durable state is
// read from and written to files under ctx.dataDir. Secrets from the plugin
// connection are used only to build request headers and are never returned.

import fs from 'node:fs';
import path from 'node:path';

export const MAX_BODY_CHARS = 300_000;
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Connection defaults
// ---------------------------------------------------------------------------

function str(value) {
  return value == null ? '' : String(value);
}

export function getDefaults(ctx) {
  const d = (ctx.connections && ctx.connections.defaults) || {};
  return {
    baseUrl: str(d.base_url).trim(),
    defaultHeaders: str(d.default_headers),
    authType: (str(d.auth_type).trim() || 'none').toLowerCase(),
    bearerToken: str(d.bearer_token),
    username: str(d.username).trim(),
    password: str(d.password),
  };
}

// ---------------------------------------------------------------------------
// Header + variable helpers
// ---------------------------------------------------------------------------

// Accept either { "Name": "value" } or [{ key, value, enabled }].
export function normalizeHeaders(input) {
  const out = [];
  if (!input) return out;
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry) continue;
      const key = str(entry.key ?? entry.name).trim();
      if (!key) continue;
      if (entry.enabled === false) continue;
      out.push([key, str(entry.value)]);
    }
  } else if (typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      const name = str(key).trim();
      if (!name || value == null) continue;
      out.push([name, str(value)]);
    }
  }
  return out;
}

// Parse "Name: value" lines from the raw default-headers field.
export function parseHeaderLines(text) {
  const out = [];
  for (const raw of str(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out.push([key, value]);
  }
  return out;
}

// Replace {{name}} with values from vars. Unknown names are left visible.
export function substitute(text, vars) {
  return str(text).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? str(vars[name]) : match);
}

// ---------------------------------------------------------------------------
// Durable stores (collections + environments)
// ---------------------------------------------------------------------------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export function collectionsFile(ctx) {
  return path.join(ctx.dataDir, 'collections.json');
}

export function environmentsFile(ctx) {
  return path.join(ctx.dataDir, 'environments.json');
}

export function readCollections(ctx) {
  const raw = readJson(collectionsFile(ctx), { collections: [] });
  return Array.isArray(raw.collections) ? raw.collections : [];
}

export function writeCollections(ctx, collections) {
  writeJson(collectionsFile(ctx), { collections });
}

export function readEnvironments(ctx) {
  const raw = readJson(environmentsFile(ctx), { active: null, environments: {} });
  return {
    active: raw.active || null,
    environments: raw.environments && typeof raw.environments === 'object' ? raw.environments : {},
  };
}

export function writeEnvironments(ctx, store) {
  writeJson(environmentsFile(ctx), store);
}

export function resolveVars(ctx, environmentName) {
  const store = readEnvironments(ctx);
  const name = str(environmentName).trim() || store.active;
  const vars = name && store.environments[name] ? { ...store.environments[name] } : {};
  return { name: name || null, vars };
}

// ---------------------------------------------------------------------------
// Request execution
// ---------------------------------------------------------------------------

function base64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function headersToObject(headers) {
  const obj = {};
  for (const [key, value] of headers.entries()) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) obj[key] = `${obj[key]}, ${value}`;
    else obj[key] = value;
  }
  return obj;
}

export async function buildAndSend(ctx, args = {}) {
  const defaults = getDefaults(ctx);
  const { name: envName, vars } = resolveVars(ctx, args.environment);

  const baseUrl = substitute(defaults.baseUrl, vars);
  let target = substitute(args.url, vars);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
    if (!baseUrl) {
      throw new Error('The URL is relative and no base URL is configured. Provide an absolute URL or set the base URL in Settings → Plugins → API Scratchpad.');
    }
    target = new URL(target.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`).toString();
  }
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error(`Invalid URL: ${target}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`);
  }

  const method = (str(args.method).trim() || 'GET').toUpperCase();
  const timeoutMs = clampInt(args.timeout_ms, DEFAULT_TIMEOUT_MS, 1000, 120000);

  const headers = new Headers();
  for (const [key, value] of parseHeaderLines(defaults.defaultHeaders)) headers.set(key, substitute(value, vars));
  for (const [key, value] of normalizeHeaders(args.headers)) headers.set(key, substitute(value, vars));

  if (!headers.has('Authorization')) {
    if (defaults.authType === 'bearer' && defaults.bearerToken) {
      headers.set('Authorization', `Bearer ${defaults.bearerToken}`);
    } else if (defaults.authType === 'basic') {
      headers.set('Authorization', `Basic ${base64(`${defaults.username}:${defaults.password}`)}`);
    }
  }

  const hasBody = args.body != null && args.body !== '' && method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? substitute(args.body, vars) : undefined;
  if (hasBody && !headers.has('Content-Type') && args.content_type) {
    headers.set('Content-Type', str(args.content_type));
  }

  const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)].filter(Boolean));
  const started = performance.now();
  let response;
  try {
    response = await fetch(parsed.toString(), { method, headers, body, redirect: 'follow', signal });
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`Request timed out after ${timeoutMs} ms.`);
    }
    const cause = error && error.cause ? (error.cause.code || error.cause.message) : '';
    throw new Error(`Request failed: ${error.message}${cause ? ` (${cause})` : ''}`);
  }
  const durationMs = Math.round(performance.now() - started);

  const buffer = Buffer.from(await response.arrayBuffer());
  let text = buffer.toString('utf8');
  let truncated = false;
  if (text.length > MAX_BODY_CHARS) {
    text = `${text.slice(0, MAX_BODY_CHARS)}\n… [truncated: response body was ${buffer.length} bytes, showing first ${MAX_BODY_CHARS} characters]`;
    truncated = true;
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    method,
    url: target,
    environment: envName,
    durationMs,
    sizeBytes: buffer.length,
    truncated,
    contentType: response.headers.get('content-type') || '',
    headers: headersToObject(response.headers),
    body: text,
  };
}

// ---------------------------------------------------------------------------
// Tool entry points
// ---------------------------------------------------------------------------

export async function listCollections(ctx) {
  const collections = readCollections(ctx).map((c) => ({
    id: c.id,
    name: c.name,
    itemCount: Array.isArray(c.items) ? c.items.length : 0,
  }));
  return { collections, path: collectionsFile(ctx) };
}

export function getCollection(ctx, args = {}) {
  const id = str(args.id).trim();
  const c = readCollections(ctx).find((x) => x.id === id);
  if (!c) throw new Error(`No collection with id "${id}". Use http_list_collections to see available ids.`);
  return { collection: c, path: collectionsFile(ctx) };
}

export function saveCollection(ctx, args = {}) {
  const name = str(args.name).trim();
  if (!name) throw new Error('A collection name is required.');
  const now = new Date().toISOString();
  const list = readCollections(ctx);
  const id = str(args.id).trim();
  let existing = id ? list.find((c) => c.id === id) : list.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.name = name;
    if (Array.isArray(args.items)) existing.items = normalizeItems(args.items);
    existing.updatedAt = now;
  } else {
    existing = {
      id: `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      items: Array.isArray(args.items) ? normalizeItems(args.items) : [],
      createdAt: now,
      updatedAt: now,
    };
    list.push(existing);
  }
  writeCollections(ctx, list);
  return { ok: true, collection: existing, path: collectionsFile(ctx) };
}

function normalizeItems(items) {
  return items.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const request = item.request && typeof item.request === 'object' ? item.request : {};
    return {
      id: str(item.id) || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: str(item.name) || 'Request',
      request: {
        method: str(request.method) || 'GET',
        url: str(request.url),
        headers: Array.isArray(request.headers) ? request.headers : [],
        body: str(request.body),
        contentType: str(request.contentType),
        environment: str(request.environment),
      },
    };
  }).filter(Boolean);
}

export function deleteCollection(ctx, args = {}) {
  const id = str(args.id).trim();
  if (!id) throw new Error('A collection id is required.');
  const list = readCollections(ctx);
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) throw new Error(`No collection with id "${id}".`);
  writeCollections(ctx, next);
  return { ok: true, deleted: id, remaining: next.length };
}

export async function runCollectionItem(ctx, args = {}) {
  const collection = getCollection(ctx, { id: args.collection_id }).collection;
  const itemId = str(args.item_id).trim();
  const item = (collection.items || []).find((i) => i.id === itemId);
  if (!item) throw new Error(`No request with id "${itemId}" in collection "${collection.name}".`);
  const r = item.request || {};
  const result = await buildAndSend(ctx, {
    method: r.method,
    url: r.url,
    headers: r.headers,
    body: r.body,
    content_type: r.contentType,
    environment: args.environment || r.environment,
    timeout_ms: args.timeout_ms,
  });
  return { request: { name: item.name, method: r.method, url: r.url }, ...result };
}

export function listEnvironments(ctx) {
  const store = readEnvironments(ctx);
  return {
    active: store.active,
    environments: Object.keys(store.environments).map((name) => ({
      name,
      vars: store.environments[name],
    })),
    path: environmentsFile(ctx),
  };
}

export function saveEnvironment(ctx, args = {}) {
  const name = str(args.name).trim();
  if (!name) throw new Error('An environment name is required.');
  const store = readEnvironments(ctx);
  const vars = args.vars && typeof args.vars === 'object' ? args.vars : {};
  store.environments[name] = { ...(store.environments[name] || {}), ...vars };
  if (args.active) store.active = name;
  else if (!store.active) store.active = name;
  writeEnvironments(ctx, store);
  return { ok: true, name, vars: store.environments[name], active: store.active, path: environmentsFile(ctx) };
}
