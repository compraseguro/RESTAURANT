'use strict';

const crypto = require('crypto');
const { executePrintJob, routeKeyFromBody, sanitizePrintBody } = require('./printExecution');

const DEDUPE_MS = Number(process.env.PRINT_DEDUPE_MS || 2000);
const MAX_ATTEMPTS = Math.min(8, Math.max(1, Number(process.env.PRINT_MAX_ATTEMPTS ?? 3)));
const RETRY_DELAYS_MS = [450, 1300, 2800];

const recentDedupe = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dedupeKeyFromBody(body) {
  const b = sanitizePrintBody(body);
  const t = String(b?.text || '').slice(0, 400);
  const s = [
    b?.connection,
    b?.ip,
    b?.port,
    b?.com_port,
    b?.windows_printer,
    t,
    b?.copies,
  ].join('|');
  return crypto.createHash('sha1').update(s).digest('hex');
}

function shouldSkipDuplicate(key) {
  const now = Date.now();
  for (const [k, ts] of recentDedupe) {
    if (now - ts > DEDUPE_MS * 10) recentDedupe.delete(k);
  }
  const last = recentDedupe.get(key);
  if (last != null && now - last < DEDUPE_MS) return true;
  recentDedupe.set(key, now);
  return false;
}

function makeKeyedQueue() {
  let tail = Promise.resolve();
  return function enqueue(fn) {
    const run = tail.then(() => fn());
    tail = run.catch(() => {});
    return run;
  };
}

const noopPersist = {
  randomId: () => `tmp_${Date.now()}`,
  registerJob: () => {},
  completeJob: () => {},
  markJobFailed: () => {},
};

function createPrintQueueManager(options = {}) {
  const broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};
  const persist = options.persist || noopPersist;
  const queues = new Map();

  function getQueue(routeKey) {
    if (!queues.has(routeKey)) queues.set(routeKey, makeKeyedQueue());
    return queues.get(routeKey);
  }

  /**
   * @param {object} bodyIn
   * @param {{ persistId?: string, fromPersistReplay?: boolean }} opts
   */
  async function submit(bodyIn, opts = {}) {
    const skipDedupe = Boolean(bodyIn?._skipDedupe);
    const clean = sanitizePrintBody(bodyIn);
    const routeKey = routeKeyFromBody(clean);
    const dupKey = dedupeKeyFromBody(clean);
    const persistId = opts.persistId || persist.randomId();

    if (!opts.fromPersistReplay) {
      if (!skipDedupe && shouldSkipDuplicate(dupKey)) {
        broadcast({ type: 'job:deduped', routeKey, at: Date.now() });
        return { ok: true, via: 'dedupe-skipped', duplicate: true };
      }
      persist.registerJob(persistId, clean);
    }

    const q = getQueue(routeKey);
    return q(async () => {
      broadcast({ type: 'job:queued', routeKey, persistId, at: Date.now() });
      let lastErr;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt === 0) broadcast({ type: 'job:printing', routeKey, persistId, at: Date.now() });
        else broadcast({ type: 'job:retry', routeKey, attempt, persistId, at: Date.now() });
        try {
          const r = await executePrintJob(clean);
          persist.completeJob(persistId);
          broadcast({ type: 'job:done', routeKey, persistId, result: r, at: Date.now() });
          return { ok: true, ...r };
        } catch (err) {
          lastErr = err;
          broadcast({
            type: 'job:attempt_failed',
            routeKey,
            persistId,
            attempt,
            error: err?.message || String(err),
            at: Date.now(),
          });
          if (attempt < MAX_ATTEMPTS - 1) await sleep(RETRY_DELAYS_MS[attempt] ?? 1500);
        }
      }
      persist.markJobFailed(persistId, lastErr?.message || 'Error de impresión');
      broadcast({
        type: 'job:failed',
        routeKey,
        persistId,
        error: lastErr?.message || 'Error de impresión',
        persisted: true,
        at: Date.now(),
      });
      throw lastErr;
    });
  }

  return { submit };
}

module.exports = { createPrintQueueManager };
