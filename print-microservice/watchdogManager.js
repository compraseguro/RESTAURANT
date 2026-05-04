'use strict';

const fs = require('fs');
const path = require('path');
const { probeLanPrinter } = require('./probeUtil');

const DATA_DIR = path.join(__dirname, 'data');
const TARGETS_FILE = path.join(DATA_DIR, 'watchdog-targets.json');

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* */
  }
}

function loadTargets() {
  try {
    const t = fs.readFileSync(TARGETS_FILE, 'utf8');
    const j = JSON.parse(t);
    return Array.isArray(j?.targets) ? j.targets : [];
  } catch {
    return [];
  }
}

function saveTargets(targets) {
  ensureDir();
  fs.writeFileSync(TARGETS_FILE, JSON.stringify({ updated_at: new Date().toISOString(), targets }, null, 0), 'utf8');
}

function createWatchdog(options = {}) {
  const intervalMs = Math.max(15000, Number(options.intervalMs) || 45000);
  const broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};
  let timer = null;

  async function probeOne(t) {
    const kind = String(t?.kind || '').toLowerCase();
    if (kind === 'lan') {
      const r = await probeLanPrinter({ ip: t.ip, port: t.port || 9100, ping: true });
      return {
        id: t.id || `lan:${t.ip}:${t.port || 9100}`,
        kind: 'lan',
        status: r.ok ? 'connected' : r.status === 'reachable_ping_only' ? 'warning' : 'offline',
        detail: r,
      };
    }
    if (kind === 'usb_serial') {
      const com = String(t.com_port || '').trim();
      if (!com) return { id: t.id, kind, status: 'unknown', detail: {} };
      return {
        id: t.id || `serial:${com}`,
        kind,
        status: 'idle',
        detail: { com, note: 'COM se valida al enviar cada trabajo' },
      };
    }
    if (kind === 'usb_windows') {
      return { id: t.id || `win:${t.name}`, kind, status: 'unknown', detail: { note: 'Windows pool — probe al imprimir' } };
    }
    return { id: t.id || 'unknown', kind, status: 'unknown', detail: {} };
  }

  async function runProbeAll() {
    const targets = loadTargets();
    if (!targets.length) return;
    const results = [];
    for (const t of targets) {
      try {
        results.push(await probeOne(t));
      } catch (e) {
        results.push({ id: t?.id, kind: t?.kind, status: 'error', error: e?.message });
      }
    }
    broadcast({ type: 'watchdog:status', at: Date.now(), results });
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      void runProbeAll();
    }, intervalMs);
    void runProbeAll();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    setTargets(targets) {
      const incoming = Array.isArray(targets) ? targets : [];
      const prev = loadTargets();
      const map = new Map();
      for (const p of prev) {
        if (p?.id) map.set(String(p.id), p);
      }
      for (const t of incoming) {
        if (t?.id) map.set(String(t.id), t);
      }
      saveTargets([...map.values()]);
      void runProbeAll();
    },
    start,
    stop,
    runProbeAll,
  };
}

module.exports = { createWatchdog, loadTargets, saveTargets, TARGETS_FILE };
