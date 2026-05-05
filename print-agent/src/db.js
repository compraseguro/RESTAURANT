const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { dataDir, ensureDataDir } = require('./paths');

const queuePathLegacy = path.join(dataDir, 'queue.json');

let SQL = null;
let db = null;
let dbFilePath = null;

function persist() {
  if (!db || !dbFilePath) return;
  ensureDataDir();
  const data = db.export();
  fs.writeFileSync(dbFilePath, Buffer.from(data));
}

function migrateFromJsonIfNeeded() {
  if (!fs.existsSync(queuePathLegacy)) return;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(queuePathLegacy, 'utf8'));
  } catch (_) {
    return;
  }
  const pending = Array.isArray(parsed?.pending) ? parsed.pending : [];
  for (const job of pending) {
    const id = String(job?.jobId || job?.id || '').trim();
    if (!id) continue;
    const chk = db.prepare('SELECT 1 FROM queue_jobs WHERE id = ? LIMIT 1');
    chk.bind([id]);
    if (chk.step()) {
      chk.free();
      continue;
    }
    chk.free();
    const payload = JSON.stringify({ ...job, jobId: id });
    const attempts = Math.min(99, Math.max(0, Number(job.attempts || 0)));
    db.run(
      `INSERT INTO queue_jobs (id, payload, attempts, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
      [id, payload, attempts]
    );
  }
  try {
    fs.renameSync(queuePathLegacy, `${queuePathLegacy}.migrated-${Date.now()}`);
  } catch (_) {
    /* noop */
  }
  persist();
}

async function initDb() {
  if (db) return db;
  ensureDataDir();
  SQL = await initSqlJs();
  dbFilePath = path.join(dataDir, 'agent.sqlite');

  if (fs.existsSync(dbFilePath)) {
    const buf = fs.readFileSync(dbFilePath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS queue_jobs (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs(status, created_at);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS print_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT,
      area TEXT,
      ok INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_print_log_at ON print_log(at);`);

  migrateFromJsonIfNeeded();
  persist();
  return db;
}

function insertQueueJob(job) {
  const id = String(job.jobId || job.id || '').trim();
  if (!id) throw new Error('job sin jobId');
  const attempts = 0;
  const payload = JSON.stringify({ ...job, jobId: id, attempts: 0 });
  db.run(
    `INSERT INTO queue_jobs (id, payload, attempts, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
    [id, payload, attempts]
  );
  persist();
}

function selectNextPending() {
  const stmt = db.prepare(
    `SELECT id, payload, attempts FROM queue_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
  );
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  const id = String(row.id || '');
  let job;
  try {
    job = JSON.parse(String(row.payload || '{}'));
  } catch (_) {
    job = {};
  }
  job.jobId = id;
  job.attempts = Number(row.attempts || 0);
  return { id, job };
}

function deleteJob(id) {
  db.run(`DELETE FROM queue_jobs WHERE id = ?`, [String(id)]);
  persist();
}

function setJobAttempts(id, attempts) {
  db.run(`UPDATE queue_jobs SET attempts = ?, updated_at = datetime('now') WHERE id = ?`, [
    attempts,
    String(id),
  ]);
  persist();
}

function logPrintRow(jobId, area, ok, message) {
  db.run(`INSERT INTO print_log (job_id, area, ok, message) VALUES (?, ?, ?, ?)`, [
    String(jobId || ''),
    String(area || ''),
    ok ? 1 : 0,
    String(message || '').slice(0, 2000),
  ]);
  persist();
}

function getPendingCount() {
  const stmt = db.prepare(`SELECT COUNT(*) AS c FROM queue_jobs WHERE status = 'pending'`);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return Number(row.c || 0);
}

module.exports = {
  initDb,
  insertQueueJob,
  selectNextPending,
  deleteJob,
  setJobAttempts,
  logPrintRow,
  getPendingCount,
  persist,
};
