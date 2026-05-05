const { v4: uuidv4 } = require('uuid');
const { buildEscPosBuffer } = require('./escpos');
const { sendToBinding } = require('./sendRaw');
const {
  insertQueueJob,
  selectNextPending,
  deleteJob,
  setJobAttempts,
  logPrintRow,
} = require('./db');
const { appendLog, loadConfig } = require('./store');

const MAX_ATTEMPTS = 5;
const RETRY_MS = 4000;

let processing = false;

function resolveBinding(cfg, area) {
  const a = String(area || 'cocina').toLowerCase();
  return (
    cfg.bindings?.[a] ||
    cfg.bindings?.cocina ||
    cfg.bindings?.caja ||
    cfg.bindings?.bar ||
    null
  );
}

async function processOne(job, cfg) {
  const area = String(job.area || 'cocina').toLowerCase();
  const binding = resolveBinding(cfg, area);
  const copies = Math.min(5, Math.max(1, Number(job.copies || 1)));
  const buf = buildEscPosBuffer(job.text || '', {
    cut: job.cut !== false,
    openCashDrawer: !!job.openCashDrawer,
  });

  for (let c = 0; c < copies; c += 1) {
    await sendToBinding(binding, buf);
  }
}

async function drainQueue(getSocket) {
  if (processing) return;
  processing = true;
  try {
    const cfg = loadConfig();
    while (true) {
      const row = selectNextPending();
      if (!row) break;
      const { id, job } = row;
      try {
        await processOne(job, cfg);
        appendLog(`ok job=${job.jobId} area=${job.area}`);
        logPrintRow(job.jobId, job.area, true, '');
        deleteJob(id);
        const sk = typeof getSocket === 'function' ? getSocket() : null;
        if (sk?.connected) sk.emit('print-ack', { jobId: job.jobId, ok: true });
      } catch (e) {
        const nextAttempts = Number(job.attempts || 0) + 1;
        appendLog(`err job=${job.jobId} attempt=${nextAttempts} ${e.message}`);
        logPrintRow(job.jobId, job.area, false, e.message);
        if (nextAttempts >= MAX_ATTEMPTS) {
          deleteJob(id);
        } else {
          setJobAttempts(id, nextAttempts);
          await new Promise((r) => setTimeout(r, RETRY_MS));
        }
      }
    }
  } finally {
    processing = false;
  }
}

function enqueue(job, getSocket) {
  const full = {
    ...job,
    jobId: job.jobId || uuidv4(),
    enqueuedAt: new Date().toISOString(),
  };
  insertQueueJob(full);
  drainQueue(getSocket).catch((e) => appendLog(`drain fatal ${e.message}`));
}

module.exports = { enqueue, drainQueue };
