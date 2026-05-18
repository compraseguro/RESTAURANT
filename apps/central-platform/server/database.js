const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let dbPath = '';

function getDbPath() {
  const fromEnv = String(process.env.DATABASE_URL || '').trim();
  if (fromEnv && !fromEnv.startsWith('postgres')) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  return path.resolve(__dirname, '..', 'central.db');
}

async function initDatabase() {
  if (db) return db;
  const SQL = await initSqlJs();
  dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      client_id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      web_service_id TEXT NOT NULL UNIQUE,
      license_key TEXT NOT NULL,
      restaurant_name TEXT DEFAULT '',
      plan TEXT DEFAULT 'profesional',
      license_status TEXT DEFAULT 'active',
      source_web_service_url TEXT DEFAULT '',
      last_sync_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL,
      web_service_id TEXT NOT NULL,
      restaurante TEXT DEFAULT '',
      plan TEXT DEFAULT '',
      monto REAL,
      fecha TEXT,
      voucher TEXT DEFAULT '',
      referencia TEXT DEFAULT '',
      estado TEXT DEFAULT 'pending',
      periodo_facturacion TEXT DEFAULT 'mensual',
      fecha_proxima_facturacion TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      web_service_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS central_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT DEFAULT '',
      full_name TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'client_admin',
      client_id TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS licenses (
      client_id TEXT PRIMARY KEY,
      license_key TEXT NOT NULL,
      plan TEXT DEFAULT 'profesional',
      status TEXT DEFAULT 'active',
      expires_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
    CREATE INDEX IF NOT EXISTS idx_payments_estado ON payments(estado);
    CREATE INDEX IF NOT EXISTS idx_sync_events_client ON sync_events(client_id);
  `);
  persist();
  return db;
}

function persist() {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  persist();
}

module.exports = {
  initDatabase,
  queryAll,
  queryOne,
  runSql,
  getDbPath,
};
