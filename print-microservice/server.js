'use strict';

/**
 * Servicio local ESC/POS: cola + reintentos, WebSocket estado, descubrimiento unificado, watchdog.
 */
const http = require('http');
const express = require('express');
const cors = require('cors');
const persist = require('./persistPrintJobs');
const { createPrintQueueManager } = require('./printQueueManager');
const { attachPrintWebSocket } = require('./websocketHub');
const { createWatchdog } = require('./watchdogManager');
const { discoverAll } = require('./discoverAll');
const { probeLanPrinter } = require('./probeUtil');
const { listWindowsPrinters, listSerialPorts } = require('./winEnumerate');

const PORT = Number(process.env.PORT || process.env.PRINT_SERVICE_PORT || 3049);
const BIND_HOST = String(process.env.BIND_HOST || '127.0.0.1').trim() || '127.0.0.1';

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Request-Private-Network'],
  })
);
app.use(express.json({ limit: '512kb' }));

const server = http.createServer(app);

let broadcastWs = () => {};
const { broadcast } = attachPrintWebSocket(server, { path: '/ws-print' });
broadcastWs = broadcast;

const printQueue = createPrintQueueManager({ broadcast, persist });
const watchdog = createWatchdog({ broadcast, intervalMs: Number(process.env.WATCHDOG_INTERVAL_MS) || 45000 });
watchdog.start();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'resto-fadey-print',
    port: PORT,
    platform: process.platform,
    features: ['queue', 'persistent_queue', 'websocket', 'discover-all', 'watchdog'],
  });
});

app.get('/discover-all', async (_req, res) => {
  try {
    const data = await discoverAll({ timeout: Number(_req.query.timeout) || undefined });
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'discover-all falló' });
  }
});

app.post('/probe', async (req, res) => {
  try {
    const kind = String(req.body?.kind || '').toLowerCase().trim();
    if (kind === 'lan') {
      const r = await probeLanPrinter({
        ip: req.body?.ip,
        port: Number(req.body?.port || 9100) || 9100,
        ping: req.body?.ping !== false,
      });
      return res.json({ ok: true, ...r });
    }
    if (kind === 'usb_serial') {
      const com = String(req.body?.com_port || '').trim();
      return res.json({
        ok: true,
        status: com ? 'idle' : 'unknown',
        com_port: com,
        note: 'Puerto COM: la prueba real es un ticket de impresión.',
      });
    }
    if (kind === 'usb_windows') {
      return res.json({
        ok: true,
        status: 'idle',
        note: 'Cola Windows: use «Probar impresión» para validar RAW.',
      });
    }
    return res.status(400).json({ ok: false, error: 'kind inválido (lan | usb_serial | usb_windows)' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'probe error' });
  }
});

app.post('/watchdog/targets', (req, res) => {
  try {
    const targets = Array.isArray(req.body?.targets) ? req.body.targets : [];
    watchdog.setTargets(targets);
    res.json({ ok: true, count: targets.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'watchdog' });
  }
});

app.post('/watchdog/probe-now', (_req, res) => {
  void watchdog.runProbeAll();
  res.json({ ok: true });
});

app.get('/discover-lan', async (req, res) => {
  let scanLan;
  let defaultPorts = [9100, 9101, 9102, 4000, 5000];
  try {
    const m = require('./discoverLan');
    scanLan = m.scanLan;
    if (Array.isArray(m.DEFAULT_PORTS) && m.DEFAULT_PORTS.length) {
      defaultPorts = m.DEFAULT_PORTS;
    }
  } catch {
    return res.status(503).json({
      ok: false,
      error:
        'Falta el módulo de búsqueda en red. Reinstale el complemento o copie discoverLan.js junto a server.js.',
    });
  }
  try {
    const timeout = req.query.timeout;
    const portsParam = req.query.ports;
    let ports;
    if (portsParam) {
      ports = String(portsParam)
        .split(/[,;]/)
        .map((s) => Number(String(s).trim()))
        .filter((n) => n > 0 && n <= 65535);
    }
    const result = await scanLan({
      timeout: timeout != null && timeout !== '' ? Number(timeout) : undefined,
      ports: ports && ports.length ? ports : undefined,
    });
    res.json({ ok: true, ...result, default_ports: defaultPorts });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Error en escaneo de red' });
  }
});

app.get('/printers', async (_req, res) => {
  const r = await listWindowsPrinters();
  if (!r.ok) return res.status(500).json({ ok: false, error: r.error || 'No se pudo listar impresoras' });
  return res.json({ ok: true, printers: r.printers });
});

app.get('/serial-ports', async (_req, res) => {
  const r = await listSerialPorts();
  if (!r.ok) return res.status(500).json({ ok: false, error: r.error });
  return res.json({
    ok: true,
    ports: r.ports,
    hint:
      r.ports?.length === 0
        ? 'No hay puertos COM. Si la térmica es solo USB con driver (sin COM), use «Impresora Windows» o «USB navegador».'
        : undefined,
  });
});

app.post('/print', async (req, res) => {
  try {
    const result = await printQueue.submit(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'Error de impresión' });
  }
});

app.get('/queue-config', (_req, res) => {
  res.json({
    ok: true,
    dedupe_ms: Number(process.env.PRINT_DEDUPE_MS || 2000),
    max_attempts: Number(process.env.PRINT_MAX_ATTEMPTS ?? 3),
    persist_retry_interval_ms: persist.RETRY_INTERVAL_MS,
    persist_max_retry: Number(process.env.PRINT_PERSIST_MAX_RETRY ?? 8),
  });
});

function replayPersistedJobs() {
  try {
    persist.purgeStale();
    for (const j of persist.listOrphanQueued()) {
      void printQueue
        .submit({ ...j.body, _skipDedupe: true }, { persistId: j.id, fromPersistReplay: true })
        .catch(() => {});
    }
    for (const j of persist.listRetryable()) {
      void printQueue
        .submit({ ...j.body, _skipDedupe: true }, { persistId: j.id, fromPersistReplay: true })
        .catch(() => {});
    }
  } catch {
    /* */
  }
}

server.listen(PORT, BIND_HOST, () => {
  console.log(
    `[print-microservice] http://${BIND_HOST}:${PORT}  ws /ws-print  queue+persist  discover-all  watchdog`
  );
  replayPersistedJobs();
  setInterval(replayPersistedJobs, 30000);
});
