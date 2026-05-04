'use strict';

/**
 * Cola persistente en disco: sobrevive a cierres del servicio y reintenta en horas pico.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'pending-print-jobs.json');
const MAX_JOBS = 200;
const MAX_AUTO_RETRY = Math.min(30, Math.max(1, Number(process.env.PRINT_PERSIST_MAX_RETRY ?? 8)));
const MAX_AGE_MS = Number(process.env.PRINT_PERSIST_MAX_AGE_MS) || 24 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = Math.max(30000, Number(process.env.PRINT_PERSIST_RETRY_INTERVAL_MS) || 120000);
/** Evitar doble envío si un ticket tarda mucho en cola (hora punta). */
const ORPHAN_QUEUED_MS = Math.max(5000, Number(process.env.PRINT_PERSIST_ORPHAN_MS) || 60000);

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* */
  }
}

function loadRaw() {
  try {
    const t = fs.readFileSync(FILE, 'utf8');
    const j = JSON.parse(t);
    return Array.isArray(j?.jobs) ? j.jobs : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  ensureDir();
  const trimmed = jobs.slice(-MAX_JOBS);
  fs.writeFileSync(FILE, JSON.stringify({ updated_at: new Date().toISOString(), jobs: trimmed }, null, 0), 'utf8');
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `pj_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

function registerJob(id, body) {
  const jobs = loadRaw().filter((j) => j.id !== id);
  jobs.push({
    id,
    body,
    createdAt: Date.now(),
    phase: 'queued',
    autoRetryCount: 0,
  });
  saveJobs(jobs);
}

function completeJob(id) {
  saveJobs(loadRaw().filter((j) => j.id !== id));
}

function markJobFailed(id, errorMessage) {
  const jobs = loadRaw();
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  j.phase = 'failed';
  j.failedAt = Date.now();
  j.lastError = String(errorMessage || '').slice(0, 500);
  j.autoRetryCount = (j.autoRetryCount || 0) + 1;
  j.nextRetryAt = Date.now() + RETRY_INTERVAL_MS;
  saveJobs(jobs);
}

function purgeStale() {
  const now = Date.now();
  const jobs = loadRaw().filter((j) => now - (j.createdAt || 0) < MAX_AGE_MS);
  if (jobs.length !== loadRaw().length) saveJobs(jobs);
}

/** Fallidos listos para reintento automático */
function listRetryable() {
  const now = Date.now();
  return loadRaw().filter((j) => {
    if (j.phase !== 'failed') return false;
    if ((j.autoRetryCount || 0) >= MAX_AUTO_RETRY) return false;
    if ((j.nextRetryAt || 0) > now) return false;
    return true;
  });
}

/** Trabajos «queued» huérfanos (servicio reiniciado a mitad de cola) */
function listOrphanQueued() {
  const now = Date.now();
  return loadRaw().filter((j) => j.phase === 'queued' && now - (j.createdAt || 0) > ORPHAN_QUEUED_MS);
}

module.exports = {
  randomId,
  registerJob,
  completeJob,
  markJobFailed,
  purgeStale,
  listRetryable,
  listOrphanQueued,
  RETRY_INTERVAL_MS,
};
