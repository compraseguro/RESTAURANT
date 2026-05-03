/**
 * Print-agent: API local para ESC/POS sin diálogos (LAN RAW TCP + USB vía spooler).
 * POST http://localhost:3001/print  (o el host/PUBLICO que configure)
 *
 * Variables: PORT (default 3001), BIND_HOST (127.0.0.1 | 0.0.0.0 para tablets en LAN)
 */
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, execFileSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const { buildEscPosBuffer } = require('./escposBuffer');

const PORT = Number(process.env.PORT || 3001);
const BIND_HOST = String(process.env.BIND_HOST || '127.0.0.1').trim() || '127.0.0.1';
/** Mismo valor que en Configuración → Impresoras → token del agente (cabecera X-Print-Agent-Token). */
const PRINT_AGENT_TOKEN = String(process.env.PRINT_AGENT_TOKEN || '').trim();

const app = express();
/** Permite preflight desde páginas HTTPS públicas hacia red local (Chrome Private Network Access). */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(cors({ origin: true }));
app.use(express.json({ limit: '512kb' }));

const printQueue = [];
let queueBusy = false;

const agentState = {
  startedAt: new Date().toISOString(),
  lastJobId: null,
  lastJobAt: null,
  lastOkAt: null,
  lastError: null,
  lastErrorAt: null,
  jobsOk: 0,
  jobsFail: 0,
};

function requireAgentToken(req, res, next) {
  if (!PRINT_AGENT_TOKEN) return next();
  const h = String(req.headers['x-print-agent-token'] || req.query.token || '');
  if (h !== PRINT_AGENT_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Token de agente inválido o ausente' });
  }
  return next();
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  if (level === 'error') console.error(`[print-agent ${ts}]`, ...args);
  else console.log(`[print-agent ${ts}]`, ...args);
}

function isAllowedPrinterHost(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function sendRawOnce(host, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (_) {}
      if (err) reject(err);
      else resolve();
    };
    try {
      socket.setKeepAlive(true, 4000);
    } catch (_) {}
    socket.setTimeout(15000);
    socket.once('error', (e) => finish(e));
    socket.once('timeout', () => finish(new Error('Tiempo de espera al contactar la impresora')));
    socket.once('connect', () => {
      socket.write(payload, (err) => {
        if (err) return finish(err);
        socket.end();
      });
    });
    socket.once('close', () => finish());
  });
}

async function sendRawToHost(host, port, payload) {
  const delays = [0, 350, 900, 2000, 4000];
  let lastErr;
  for (let i = 0; i < delays.length; i += 1) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      await sendRawOnce(host, port, payload);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function tryRequirePrinter() {
  try {
    return require('printer');
  } catch (_) {
    return null;
  }
}

function sendEscPosToUsb(printerName, buffer) {
  const name = String(printerName || '').trim();
  if (!name) return Promise.reject(new Error('Nombre de impresora USB vacío'));

  if (process.platform === 'win32') {
    const printerMod = tryRequirePrinter();
    if (!printerMod || typeof printerMod.printDirect !== 'function') {
      return Promise.reject(
        new Error(
          'USB en Windows: instale el módulo nativo en esta carpeta: npm install printer (requiere build tools)'
        )
      );
    }
    return new Promise((resolve, reject) => {
      printerMod.printDirect({
        data: buffer,
        printer: name,
        type: 'RAW',
        success: () => resolve(),
        error: reject,
      });
    });
  }

  const tmp = path.join(os.tmpdir(), `resto-escpos-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(tmp, buffer);
  return new Promise((resolve, reject) => {
    execFile('lp', ['-d', name, '-o', 'raw', tmp], { timeout: 60000 }, (err) => {
      try {
        fs.unlinkSync(tmp);
      } catch (_) {}
      if (err) reject(err);
      else resolve();
    });
  });
}

function parsePrinterNameLines(out) {
  const names = [];
  for (const line of String(out || '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || /^name\s*$/i.test(s) || /^-+$/.test(s)) continue;
    names.push(s);
  }
  return names;
}

function listPrintersWindows() {
  const cmds = [
    'Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name',
    /** Windows 8+ / cmdlet más cercano a «Impresoras y escáneres» */
    'Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name',
  ];
  const seen = new Set();
  for (const cmd of cmds) {
    try {
      const out = execFileSync('powershell', ['-NoProfile', '-Command', cmd], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 25000,
      });
      for (const n of parsePrinterNameLines(out)) {
        if (n) seen.add(n);
      }
      if (seen.size > 0) return [...seen];
    } catch (e) {
      log('warn', 'Listar impresoras (PowerShell):', cmd.slice(0, 50), e.message);
    }
  }
  try {
    const out = execFileSync('wmic', ['printer', 'get', 'name'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 20000,
    });
    const fromWmic = parsePrinterNameLines(out).filter((n) => !/^Name$/i.test(n));
    for (const n of fromWmic) seen.add(n);
  } catch (e) {
    log('warn', 'wmic printer:', e.message);
  }
  return [...seen];
}

function listPrintersOs() {
  if (process.platform === 'win32') {
    const list = listPrintersWindows();
    if (!list.length) {
      log(
        'warn',
        'Lista de impresoras vacía: ¿driver instalado en Windows? (Conexión USB sola no basta hasta que aparezca en «Impresoras»).'
      );
    }
    return list;
  }
  try {
    const out = execFileSync('lpstat', ['-p'], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 15000 });
    const names = [];
    for (const line of out.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const m = trimmed.match(/^(?:printer|impresora)\s+(\S+)/i);
      if (m) names.push(m[1]);
    }
    return [...new Set(names)];
  } catch (e) {
    log('warn', 'lpstat no disponible:', e.message);
    return [];
  }
}

function usbSupportedHint() {
  if (process.platform === 'win32') return Boolean(tryRequirePrinter());
  try {
    execFileSync('which', ['lp'], { timeout: 3000 });
    return true;
  } catch (_) {
    return false;
  }
}

async function runWithRetries(fn, jobLabel) {
  let lastErr;
  const max = 5;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      await fn();
      return;
    } catch (e) {
      lastErr = e;
      log('warn', `${jobLabel} intento ${attempt}/${max}:`, e?.message || e);
      if (attempt < max) {
        const ms = Math.min(10000, 800 * 2 ** (attempt - 1));
        await new Promise((r) => setTimeout(r, ms));
      }
    }
  }
  throw lastErr;
}

async function drainQueue() {
  if (queueBusy) return;
  queueBusy = true;
  try {
    while (printQueue.length > 0) {
      const job = printQueue.shift();
      try {
        await runWithRetries(job.run, job.id || 'job');
        job.resolve({ success: true, jobId: job.id });
      } catch (e) {
        job.reject(e);
      }
    }
  } finally {
    queueBusy = false;
    if (printQueue.length > 0) void drainQueue();
  }
}

function enqueuePrint(runFn, id) {
  return new Promise((resolve, reject) => {
    printQueue.push({ id, run: runFn, resolve, reject });
    void drainQueue();
  });
}

async function executePrintBody(body) {
  const ticket = String(body.ticket ?? body.text ?? '').trim();
  if (!ticket || ticket.length > 12000) {
    throw new Error('ticket/text inválido o demasiado largo');
  }
  const copies = Math.min(5, Math.max(1, Number(body.copies || 1) || 1));
  const port = Math.min(65535, Math.max(1, Number(body.port || 9100) || 9100));
  const ip = String(body.ip_address || '').trim();
  const printer = String(body.printer ?? body.local_printer_name ?? '').trim();
  const mode = String(body.mode || '').toLowerCase();
  const area = String(body.area || '').trim();
  const pwm = Number(body.paper_width_mm);
  const paperW = pwm === 58 || pwm === 80 ? pwm : 80;
  const qrText = String(body.qr_text || body.qr_sunat || '').trim();
  const openDrawer = Boolean(body.open_cash_drawer);
  const headerLines = Math.min(12, Math.max(0, Number(body.escpos_header_lines ?? 0) || 0));

  const buffer = buildEscPosBuffer(ticket, copies, paperW, {
    qr_text: qrText,
    open_cash_drawer: openDrawer,
    center_header_lines: headerLines,
  });
  const jobId = `j-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const run = async () => {
    let via = '';
    if (mode === 'usb') {
      if (!printer) throw new Error('mode usb requiere printer (nombre exacto en el sistema)');
      await sendEscPosToUsb(printer, buffer);
      via = 'usb';
    } else if (mode === 'lan') {
      if (!ip) throw new Error('mode lan requiere ip_address');
      if (!isAllowedPrinterHost(ip)) throw new Error('Solo se permiten IPs de red local');
      await sendRawToHost(ip, port, buffer);
      via = 'lan';
    } else if (ip && isAllowedPrinterHost(ip)) {
      await sendRawToHost(ip, port, buffer);
      via = 'lan';
    } else if (printer) {
      if (ip && !isAllowedPrinterHost(ip)) {
        log('warn', 'IP no válida para LAN; usando cola USB/local', { ip, printer });
      }
      await sendEscPosToUsb(printer, buffer);
      via = 'usb';
    } else {
      throw new Error('Indique ip_address (térmica en red, puerto RAW típico 9100) o printer (USB / cola local)');
    }
    log('info', 'Impreso', { jobId, area: area || '-', via });
    agentState.lastJobId = jobId;
    agentState.lastJobAt = new Date().toISOString();
    agentState.lastOkAt = agentState.lastJobAt;
    agentState.jobsOk += 1;
    agentState.lastError = null;
    agentState.lastErrorAt = null;
  };

  try {
    await enqueuePrint(run, jobId);
  } catch (e) {
    agentState.lastError = String(e?.message || e);
    agentState.lastErrorAt = new Date().toISOString();
    agentState.jobsFail += 1;
    throw e;
  }
  return { success: true, jobId, queued: true };
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'resto-print-agent',
    port: PORT,
    bind: BIND_HOST,
    queueLength: printQueue.length,
    queueBusy,
    usb: usbSupportedHint(),
    authConfigured: Boolean(PRINT_AGENT_TOKEN),
  });
});

app.get('/status', requireAgentToken, (req, res) => {
  res.json({
    ok: true,
    ...agentState,
    queueLength: printQueue.length,
    queueBusy,
    bind: BIND_HOST,
    port: PORT,
  });
});

async function handleProbeRequest(req, res) {
  try {
    const src = req.method === 'GET' ? req.query || {} : req.body || {};
    const ip = String(src.ip_address || '').trim();
    const port = Math.min(65535, Math.max(1, Number(src.port || 9100) || 9100));
    if (!ip) {
      return res.status(400).json({ ok: false, error: 'ip_address requerida' });
    }
    if (!isAllowedPrinterHost(ip)) {
      return res.status(400).json({ ok: false, error: 'Solo IPs de red local' });
    }
    const ping = Buffer.from([0x1b, 0x40]);
    await sendRawToHost(ip, port, ping);
    return res.json({ ok: true, reachable: true, ip, port });
  } catch (err) {
    return res.status(500).json({ ok: false, reachable: false, error: err?.message || String(err) });
  }
}

/** GET y POST: algunos proxies / hosting devuelven 405 solo a POST en rutas bajo /print-agent. */
app.get('/probe', requireAgentToken, handleProbeRequest);
app.post('/probe', requireAgentToken, handleProbeRequest);

app.get('/printers', requireAgentToken, (req, res) => {
  try {
    const printers = listPrintersOs();
    const detailed = printers.map((name) => ({
      name,
      connection: 'system_queue',
      status: 'unknown',
    }));
    res.json({ ok: true, printers, detailed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'list error', printers: [], detailed: [] });
  }
});

app.post('/print', requireAgentToken, async (req, res) => {
  try {
    const out = await executePrintBody(req.body || {});
    res.json(out);
  } catch (err) {
    log('error', 'POST /print', err?.message || err);
    res.status(500).json({ error: err.message || 'Error de impresión' });
  }
});

app.listen(PORT, BIND_HOST, () => {
  log('info', `Escuchando http://${BIND_HOST}:${PORT} (token: ${PRINT_AGENT_TOKEN ? 'sí' : 'no'})`);
  if (BIND_HOST === '127.0.0.1') {
    log('info', 'Tablets/Android en la misma WiFi: defina BIND_HOST=0.0.0.0 y abra el puerto en el firewall');
  }
});
