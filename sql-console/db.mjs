// Shared database logic for the sql-console plugin (native handler side).
//
// Dialect strategy:
//   - sqlite   -> Node's built-in `node:sqlite` driver (zero dependency, always present).
//   - postgres -> the `psql` client already on PATH (never a bundled driver).
//   - mysql    -> the `mysql` client already on PATH.
// Missing clients produce an actionable error instead of a stack trace.
//
// Every function here is stateless: each tool call runs in a fresh worker.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Budget for the data portion of a result. The host caps a whole tool result at 1 MiB,
// so we stop well before that and raise an explicit `truncated` marker.
export const MAX_RESULT_CHARS = 600_000;
const MAX_CAPTURE = 16 * 1024 * 1024;
const DEFAULT_ROW_LIMIT = 200;
const MAX_ROW_LIMIT = 5000;

const READ_KEYWORDS = new Set([
  'SELECT', 'WITH', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'DESC', 'PRAGMA', 'VALUES', 'TABLE',
]);

// ---------------------------------------------------------------------------
// Connection configuration
// ---------------------------------------------------------------------------

function str(value) {
  return value == null ? '' : String(value).trim();
}

export function getConfig(ctx) {
  const raw = (ctx.connections && ctx.connections.database) || {};
  const dialect = str(raw.dialect).toLowerCase();
  if (!dialect) {
    throw new Error(
      'Database connection is not configured. Open Settings → Plugins → SQL Console → Configure connections, ' +
        'set dialect to postgres, mysql or sqlite, and fill in the matching fields.',
    );
  }
  if (!['postgres', 'mysql', 'sqlite'].includes(dialect)) {
    throw new Error(`Unsupported dialect "${dialect}". Use postgres, mysql or sqlite.`);
  }

  const cfg = {
    dialect,
    host: str(raw.host) || 'localhost',
    port: str(raw.port),
    database: str(raw.database),
    user: str(raw.user),
    // Secrets are available to handlers only; never return or log them.
    password: raw.password == null ? '' : String(raw.password),
    sslMode: str(raw.ssl_mode).toLowerCase(),
    file: str(raw.file),
  };

  if (dialect === 'sqlite') {
    if (!cfg.file) {
      throw new Error(
        'SQLite needs a database file path. Set the "SQLite file path" field for the database connection ' +
          'in Settings → Plugins → SQL Console.',
      );
    }
  } else if (!cfg.database) {
    throw new Error(`Set the "Database name" field for the ${dialect} connection.`);
  }
  return cfg;
}

function defaultPort(dialect) {
  return dialect === 'postgres' ? '5432' : '3306';
}

function clientName(dialect) {
  return dialect === 'postgres' ? 'psql' : 'mysql';
}

// ---------------------------------------------------------------------------
// Statement classification (read-only gate)
// ---------------------------------------------------------------------------

export function classify(sqlInput) {
  const text = String(sqlInput == null ? '' : sqlInput).trim();
  if (!text) throw new Error('No SQL provided.');

  // Strip leading line and block comments.
  let s = text;
  for (;;) {
    const m = s.match(/^(--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*/);
    if (!m) break;
    s = s.slice(m[0].length);
  }
  if (!s) throw new Error('No SQL statement found (only comments).');

  const withoutTrailing = s.replace(/;\s*$/, '');
  const multiple = /;/.test(withoutTrailing);
  const first = ((s.match(/^([A-Za-z]+)/) || [, ''])[1] || '').toUpperCase();

  let kind = READ_KEYWORDS.has(first) ? 'read' : 'write';
  if (kind === 'read' && first === 'WITH') {
    // A data-modifying CTE (WITH ... INSERT/UPDATE/DELETE) is a write.
    if (/\b(insert|update|delete|merge|replace)\b/i.test(withoutTrailing)) kind = 'write';
  }
  if (multiple) kind = 'multiple';

  return { kind, first, multiple };
}

function assertAllowed(cls, allowWrite) {
  if (cls.kind === 'read' || allowWrite) return;
  const what = cls.kind === 'multiple' ? 'multi-statement batch' : `write statement (${cls.first || 'unknown'})`;
  throw new Error(
    `Refusing to run a ${what}. This console is read-only by default. ` +
      `Re-run with allow_write: true if you intend to modify the database.`,
  );
}

// ---------------------------------------------------------------------------
// SQLite (node:sqlite)
// ---------------------------------------------------------------------------

async function openSqlite(cfg, readOnly) {
  const file = path.resolve(cfg.file);
  if (!fs.existsSync(file)) {
    throw new Error(
      `SQLite database file not found: ${file}. Set the correct "SQLite file path" in ` +
        'Settings → Plugins → SQL Console → Configure connections.',
    );
  }
  const { DatabaseSync } = await import('node:sqlite');
  try {
    return new DatabaseSync(file, readOnly ? { readOnly: true } : {});
  } catch (error) {
    throw new Error(`Could not open SQLite database ${file}: ${error.message}`);
  }
}

function normalizeCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return `<BLOB ${value.byteLength} bytes>`;
  return value;
}

function sqliteQuery(db, sql, rowLimit) {
  const stmt = db.prepare(sql);
  let meta = [];
  try {
    meta = stmt.columns();
  } catch {
    meta = [];
  }
  const columns = meta.map((m) => ({ name: m.name, type: m.type || '' }));
  const rows = [];
  let truncated = false;
  let bytes = 0;
  for (const row of stmt.iterate()) {
    if (rows.length >= rowLimit) {
      truncated = true;
      break;
    }
    const values = Object.values(row).map(normalizeCell);
    const size = JSON.stringify(values).length + 2;
    if (bytes + size > MAX_RESULT_CHARS) {
      truncated = true;
      break;
    }
    bytes += size;
    rows.push(values);
  }
  // Zero-row results still report their column names.
  const finalColumns = columns.length
    ? columns
    : (rows[0] ? rows[0].map((_, i) => ({ name: `column_${i + 1}`, type: '' })) : []);
  return { columns: finalColumns, rows, rowCount: rows.length, truncated };
}

async function runSqlite(cfg, sql, { allowWrite, rowLimit, cls }) {
  const db = await openSqlite(cfg, !allowWrite);
  try {
    if (cls.kind === 'multiple') {
      db.exec(sql);
      return { columns: [], rows: [], rowCount: 0, truncated: false, command: 'exec', changes: null };
    }
    if (cls.kind === 'read') {
      return { ...sqliteQuery(db, sql, rowLimit), command: cls.first.toLowerCase(), changes: null };
    }
    const info = db.prepare(sql).run();
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      command: cls.first.toLowerCase(),
      changes: Number(info.changes),
      lastInsertRowid: info.lastInsertRowid == null ? null : String(info.lastInsertRowid),
    };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// PostgreSQL / MySQL clients
// ---------------------------------------------------------------------------

function requireClient(dialect) {
  const name = clientName(dialect);
  const probe = spawnSync(name, ['--version'], { encoding: 'utf8', windowsHide: true });
  const ok = !probe.error && probe.status === 0;
  if (!ok) {
    throw new Error(
      `The "${name}" command-line client was not found on PATH, so ${dialect} databases cannot be reached. ` +
        `Install the ${dialect === 'postgres' ? 'PostgreSQL client tools' : 'MySQL client'} and confirm that ` +
        `"${name}" runs in a terminal, or switch the connection to the sqlite dialect.`,
    );
  }
  return { name, version: String(probe.stdout || '').trim() };
}

function pgSslMode(mode) {
  return ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(mode)
    ? mode
    : 'prefer';
}

function mySslMode(mode) {
  const map = { disable: 'DISABLED', prefer: 'PREFERRED', require: 'REQUIRED', 'verify-ca': 'VERIFY_CA', 'verify-full': 'VERIFY_IDENTITY' };
  return map[mode] || 'PREFERRED';
}

function pgCommand(cfg, sql, allowWrite) {
  const env = {
    ...process.env,
    PGHOST: cfg.host,
    PGPORT: cfg.port || defaultPort('postgres'),
    PGDATABASE: cfg.database,
    PGCLIENTENCODING: 'UTF8',
    PGSSLMODE: pgSslMode(cfg.sslMode),
  };
  if (cfg.user) env.PGUSER = cfg.user;
  if (cfg.password) env.PGPASSWORD = cfg.password; // secret stays in the environment, never in argv
  if (!allowWrite) env.PGOPTIONS = '-c default_transaction_read_only=on';
  return { args: ['-X', '-q', '--csv', '-v', 'ON_ERROR_STOP=1', '-c', sql], env };
}

function myCommand(cfg, sql, allowWrite) {
  const args = [
    '--batch', '--raw', '--default-character-set=utf8mb4',
    '--host', cfg.host,
    '--port', cfg.port || defaultPort('mysql'),
    '--user', cfg.user || 'root',
    `--ssl-mode=${mySslMode(cfg.sslMode)}`,
  ];
  if (cfg.database) args.push(cfg.database);
  if (!allowWrite) args.push('--init-command=SET SESSION TRANSACTION READ ONLY');
  args.push('-e', sql);
  const env = { ...process.env };
  if (cfg.password) env.MYSQL_PWD = cfg.password; // secret stays in the environment
  return { args, env };
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return finishTabular(rows);
}

function unescapeMysql(value) {
  if (value === 'NULL') return null;
  return value.replace(/\\(.)/g, (_, c) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === '0' ? '\0' : c);
}

function parseTsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '') continue;
    rows.push(line.split('\t').map(unescapeMysql));
  }
  return finishTabular(rows);
}

function finishTabular(rows) {
  while (rows.length && rows[rows.length - 1].every((c) => c === '' || c === null)) rows.pop();
  if (!rows.length) return { columns: [], rows: [] };
  const columns = rows[0].map((name) => ({ name: String(name), type: '' }));
  return { columns, rows: rows.slice(1) };
}

function applyCaps(parsed, rowLimit) {
  const rows = [];
  let bytes = 0;
  let truncated = false;
  for (const row of parsed.rows) {
    if (rows.length >= rowLimit) { truncated = true; break; }
    const size = JSON.stringify(row).length + 2;
    if (bytes + size > MAX_RESULT_CHARS) { truncated = true; break; }
    bytes += size;
    rows.push(row);
  }
  return { columns: parsed.columns, rows, rowCount: rows.length, truncated };
}

export async function runClient(cfg, sql, { rowLimit, allowWrite, timeoutMs }) {
  const name = clientName(cfg.dialect);
  requireClient(cfg.dialect);
  const spec = cfg.dialect === 'postgres' ? pgCommand(cfg, sql, allowWrite) : myCommand(cfg, sql, allowWrite);
  const res = spawnSync(name, spec.args, {
    env: spec.env,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_CAPTURE,
    windowsHide: true,
  });
  if (res.error) {
    if (res.error.code === 'ENOENT') throw new Error(`The "${name}" client was not found on PATH.`);
    if (res.error.code === 'ETIMEDOUT') throw new Error(`Query timed out after ${timeoutMs} ms. Raise timeout_ms or narrow the query.`);
    if (res.error.code === 'ENOBUFS' || /maxBuffer/i.test(res.error.message)) {
      throw new Error('Query output exceeded the 16 MiB capture limit. Add a LIMIT or narrow the query.');
    }
    throw new Error(`Failed to run ${name}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const msg = String(res.stderr || res.stdout || '').trim() || `exit code ${res.status}`;
    throw new Error(`${cfg.dialect} error: ${msg}`);
  }
  const parsed = cfg.dialect === 'postgres' ? parseCsv(res.stdout || '') : parseTsv(res.stdout || '');
  return applyCaps(parsed, rowLimit);
}

// ---------------------------------------------------------------------------
// Tool entry points
// ---------------------------------------------------------------------------

export async function testConnection(ctx) {
  const cfg = getConfig(ctx);
  if (cfg.dialect === 'sqlite') {
    const db = await openSqlite(cfg, true);
    try {
      const row = db.prepare('select sqlite_version() as v').get();
      return { ok: true, dialect: 'sqlite', client: 'node:sqlite', version: String(row.v), target: path.resolve(cfg.file) };
    } finally {
      db.close();
    }
  }
  const client = requireClient(cfg.dialect);
  const result = await runClient(cfg, 'select version() as version', {
    rowLimit: 1, allowWrite: false, timeoutMs: 20000,
  });
  const version = result.rows[0] ? String(result.rows[0][0]) : 'unknown';
  return {
    ok: true,
    dialect: cfg.dialect,
    client: `${client.name} (${client.version})`,
    version,
    target: `${cfg.user || ''}@${cfg.host}:${cfg.port || defaultPort(cfg.dialect)}/${cfg.database}`,
  };
}

export async function listSchemas(ctx) {
  const cfg = getConfig(ctx);
  if (cfg.dialect === 'sqlite') {
    const db = await openSqlite(cfg, true);
    try {
      const attached = db.prepare('pragma database_list').all().map((r) => r.name);
      return { dialect: 'sqlite', schemas: attached.length ? attached : ['main'] };
    } finally {
      db.close();
    }
  }
  const sql = cfg.dialect === 'postgres'
    ? "select schema_name from information_schema.schemata where schema_name not like 'pg\\_%' and schema_name <> 'information_schema' order by 1"
    : "select schema_name from information_schema.schemata where schema_name not in ('information_schema','performance_schema','mysql','sys') order by 1";
  const result = await runClient(cfg, sql, { rowLimit: 1000, allowWrite: false, timeoutMs: 20000 });
  return { dialect: cfg.dialect, schemas: result.rows.map((row) => String(row[0])) };
}

function escStr(value) {
  return String(value).replace(/'/g, "''");
}

function escIdentIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function listTables(ctx, args = {}) {
  const cfg = getConfig(ctx);
  const schema = str(args.schema);
  const withCounts = args.include_row_counts !== false;

  if (cfg.dialect === 'sqlite') {
    const db = await openSqlite(cfg, true);
    try {
      const rows = db
        .prepare("select name, type from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name")
        .all();
      const tables = rows.map((r) => ({ schema: 'main', name: r.name, type: r.type === 'view' ? 'view' : 'table' }));
      if (withCounts && tables.length <= 100) {
        for (const t of tables) {
          if (t.type !== 'table') continue;
          try {
            const c = db.prepare(`select count(*) as c from ${escIdentIdent(t.name)}`).get();
            t.rowCount = Number(c.c);
            t.rowCountKind = 'exact';
          } catch { /* unreadable table: skip the count */ }
        }
      }
      return { dialect: 'sqlite', schema: 'main', tables };
    } finally {
      db.close();
    }
  }

  if (cfg.dialect === 'postgres') {
    const sch = schema || 'public';
    const sql = `select t.table_schema, t.table_name,
        case when t.table_type like '%VIEW%' then 'view' else 'table' end as kind,
        c.reltuples::bigint as est_rows
      from information_schema.tables t
      left join pg_class c on c.relname = t.table_name
      left join pg_namespace n on n.oid = c.relnamespace
      where t.table_schema = '${escStr(sch)}' and (c.relnamespace is null or n.nspname = t.table_schema)
      order by t.table_name`;
    const result = await runClient(cfg, sql, { rowLimit: 2000, allowWrite: false, timeoutMs: 20000 });
    return {
      dialect: 'postgres',
      schema: sch,
      tables: result.rows.map((r) => ({
        schema: r[0], name: r[1], type: r[2],
        ...(withCounts && r[3] != null && Number(r[3]) >= 0 ? { rowCount: Number(r[3]), rowCountKind: 'estimate' } : {}),
      })),
    };
  }

  const sch = schema || cfg.database;
  const sql = `select table_schema, table_name,
      case when table_type like '%VIEW%' then 'view' else 'table' end as kind,
      table_rows
    from information_schema.tables where table_schema = '${escStr(sch)}' order by table_name`;
  const result = await runClient(cfg, sql, { rowLimit: 2000, allowWrite: false, timeoutMs: 20000 });
  return {
    dialect: 'mysql',
    schema: sch,
    tables: result.rows.map((r) => ({
      schema: r[0], name: r[1], type: r[2],
      ...(withCounts && r[3] != null ? { rowCount: Number(r[3]), rowCountKind: 'estimate' } : {}),
    })),
  };
}

export async function describeTable(ctx, args = {}) {
  const cfg = getConfig(ctx);
  const table = str(args.table);
  if (!table) throw new Error('Provide a table name.');
  const schema = str(args.schema);

  if (cfg.dialect === 'sqlite') {
    const db = await openSqlite(cfg, true);
    try {
      const ident = escIdentIdent(table);
      const info = db.prepare(`pragma table_info(${ident})`).all();
      if (!info.length) {
        const exists = db
          .prepare("select name from sqlite_master where name = ? and type in ('table','view')")
          .get(table);
        if (!exists) throw new Error(`Table or view "${table}" was not found.`);
      }
      const indexes = db.prepare(`pragma index_list(${ident})`).all().map((ix) => ({
        name: ix.name,
        unique: Boolean(ix.unique),
        origin: ix.origin,
        columns: db.prepare(`pragma index_info(${escIdentIdent(ix.name)})`).all().map((c) => c.name),
      }));
      const foreignKeys = db.prepare(`pragma foreign_key_list(${ident})`).all().map((fk) => ({
        column: fk.from, referencesTable: fk.table, referencesColumn: fk.to, onDelete: fk.on_delete, onUpdate: fk.on_update,
      }));
      return {
        dialect: 'sqlite',
        schema: 'main',
        table,
        columns: info.map((c) => ({
          name: c.name, type: c.type || '', nullable: !c.notnull, default: c.dflt_value, primaryKey: c.pk > 0,
        })),
        indexes,
        foreignKeys,
      };
    } finally {
      db.close();
    }
  }

  if (cfg.dialect === 'postgres') {
    const sch = schema || 'public';
    const cols = await runClient(
      cfg,
      `select column_name, data_type, is_nullable, column_default
         from information_schema.columns where table_schema = '${escStr(sch)}' and table_name = '${escStr(table)}'
         order by ordinal_position`,
      { rowLimit: 2000, allowWrite: false, timeoutMs: 20000 },
    );
    if (!cols.rows.length) throw new Error(`Table "${sch}.${table}" was not found.`);
    const keys = await runClient(
      cfg,
      `select tc.constraint_type, kcu.column_name, ccu.table_name, ccu.column_name
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
         left join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
         where tc.table_schema = '${escStr(sch)}' and tc.table_name = '${escStr(table)}'
           and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY')`,
      { rowLimit: 2000, allowWrite: false, timeoutMs: 20000 },
    );
    const pk = new Set(keys.rows.filter((r) => r[0] === 'PRIMARY KEY').map((r) => String(r[1])));
    const idx = await runClient(
      cfg,
      `select indexname, indexdef from pg_indexes where schemaname = '${escStr(sch)}' and tablename = '${escStr(table)}' order by indexname`,
      { rowLimit: 2000, allowWrite: false, timeoutMs: 20000 },
    );
    return {
      dialect: 'postgres',
      schema: sch,
      table,
      columns: cols.rows.map((r) => ({
        name: r[0], type: r[1], nullable: r[2] === 'YES', default: r[3], primaryKey: pk.has(String(r[0])),
      })),
      indexes: idx.rows.map((r) => ({ name: r[0], definition: r[1] })),
      foreignKeys: keys.rows.filter((r) => r[0] === 'FOREIGN KEY')
        .map((r) => ({ column: r[1], referencesTable: r[2], referencesColumn: r[3] })),
    };
  }

  const sch = schema || cfg.database;
  const cols = await runClient(
    cfg,
    `select column_name, column_type, is_nullable, column_default, column_key
       from information_schema.columns where table_schema = '${escStr(sch)}' and table_name = '${escStr(table)}'
       order by ordinal_position`,
    { rowLimit: 2000, allowWrite: false, timeoutMs: 20000 },
  );
  if (!cols.rows.length) throw new Error(`Table "${sch}.${table}" was not found.`);
  const keys = await runClient(
    cfg,
    `select constraint_type, column_name from (
        select 'PRIMARY KEY' as constraint_type, column_name from information_schema.key_column_usage
          where table_schema = '${escStr(sch)}' and table_name = '${escStr(table)}' and constraint_name = 'PRIMARY'
        union all
        select 'FOREIGN KEY', column_name from information_schema.key_column_usage
          where table_schema = '${escStr(sch)}' and table_name = '${escStr(table)}' and referenced_table_name is not null
      ) k`,
    { rowLimit: 2000, allowWrite: false, timeoutMs: 20000 },
  );
  const pk = new Set(keys.rows.filter((r) => r[0] === 'PRIMARY KEY').map((r) => String(r[1])));
  const idx = await runClient(
    cfg,
    `select index_name, non_unique, column_name from information_schema.statistics
       where table_schema = '${escStr(sch)}' and table_name = '${escStr(table)}' order by index_name, seq_in_index`,
    { rowLimit: 2000, allowWrite: false, timeoutMs: 20000 },
  );
  const indexMap = new Map();
  for (const r of idx.rows) {
    const key = String(r[0]);
    if (!indexMap.has(key)) indexMap.set(key, { name: key, unique: r[1] === '0' || r[1] === 0, columns: [] });
    indexMap.get(key).columns.push(String(r[2]));
  }
  return {
    dialect: 'mysql',
    schema: sch,
    table,
    columns: cols.rows.map((r) => ({
      name: r[0], type: r[1], nullable: r[2] === 'YES', default: r[3], primaryKey: pk.has(String(r[0])) || r[4] === 'PRI',
    })),
    indexes: [...indexMap.values()],
    foreignKeys: keys.rows.filter((r) => r[0] === 'FOREIGN KEY').map((r) => ({ column: r[1] })),
  };
}

export async function runQuery(ctx, args = {}) {
  const cfg = getConfig(ctx);
  const sql = String(args.sql == null ? '' : args.sql);
  const cls = classify(sql);
  const allowWrite = args.allow_write === true;
  assertAllowed(cls, allowWrite);

  const rowLimit = clampInt(args.row_limit, DEFAULT_ROW_LIMIT, 1, MAX_ROW_LIMIT);
  const timeoutMs = clampInt(args.timeout_ms, 30000, 1000, 120000);

  if (cfg.dialect === 'sqlite') {
    return runSqlite(cfg, sql, { allowWrite, rowLimit, cls });
  }
  const result = await runClient(cfg, sql, { rowLimit, allowWrite, timeoutMs });
  return { ...result, command: cls.first.toLowerCase(), changes: null };
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// ---------------------------------------------------------------------------
// Snippets (durable store under ctx.dataDir)
// ---------------------------------------------------------------------------

function snippetsFile(ctx) {
  return path.join(ctx.dataDir, 'snippets.json');
}

export function readSnippets(ctx) {
  try {
    const raw = JSON.parse(fs.readFileSync(snippetsFile(ctx), 'utf8'));
    return Array.isArray(raw.snippets) ? raw.snippets : [];
  } catch {
    return [];
  }
}

function writeSnippets(ctx, list) {
  fs.mkdirSync(ctx.dataDir, { recursive: true });
  fs.writeFileSync(snippetsFile(ctx), JSON.stringify({ snippets: list }, null, 2));
}

export function saveSnippet(ctx, args = {}) {
  const name = str(args.name);
  const sql = String(args.sql == null ? '' : args.sql);
  if (!name) throw new Error('A snippet name is required.');
  if (!sql.trim()) throw new Error('Snippet SQL is empty.');
  const now = new Date().toISOString();
  const list = readSnippets(ctx);
  const id = str(args.id);
  let existing = id ? list.find((s) => s.id === id) : list.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.name = name;
    existing.sql = sql;
    existing.updatedAt = now;
  } else {
    existing = {
      id: `snip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name, sql, createdAt: now, updatedAt: now,
    };
    list.push(existing);
  }
  writeSnippets(ctx, list);
  return { ok: true, snippet: existing, path: snippetsFile(ctx) };
}

export function listSnippets(ctx) {
  const list = readSnippets(ctx).slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { snippets: list, path: snippetsFile(ctx) };
}

export function deleteSnippet(ctx, args = {}) {
  const id = str(args.id);
  if (!id) throw new Error('A snippet id is required.');
  const list = readSnippets(ctx);
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) throw new Error(`No snippet with id "${id}" was found.`);
  writeSnippets(ctx, next);
  return { ok: true, deleted: id, remaining: next.length };
}
