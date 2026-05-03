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

const PORT = Number(process.env.PORT || 3001);
const BIND_HOST = String(process.env.BIND_HOST || '127.0.0.1').trim() || '127.0.0.1';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '512kb' }));

const printQueue = [];
let queueBusy = false;

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

function buildEscPosBuffer(text, copies, paperWidthMm) {
  const init = Buffer.from([0x1b, 0x40]);
  const doubleHeightOn = Buffer.from([0x1b, 0x21, 0x10]);
  const normalSize = Buffer.from([0x1b, 0x21, 0x00]);
  const cut = Buffer.from([0x1d, 0x56, 0x00]);
  const textBuf = Buffer.from(`${String(text || '')}\n\n`, 'utf8');
  /** 58 mm: altura normal para que el texto preparado en cliente quepa; 80 mm: doble altura legible. */
  const narrow = Number(paperWidthMm) === 58;
  const lead = narrow ? normalSize : doubleHeightOn;
  const body = Buffer.concat([lead, textBuf, normalSize]);
  const n = Math.min(5, Math.max(1, Number(copies || 1)));
  const chunks = [];
  for (let i = 0; i < n; i += 1) {
    chunks.push(init, body, cut);
  }
  return Buffer.concat(chunks);
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

  const buffer = buildEscPosBuffer(ticket, copies, paperW);
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
  };

  await enqueuePrint(run, jobId);
  return { success: true, jobId, queued: true };
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'resto-print-agent',
    port: PORT,
    bind: BIND_HOST,
    queueLength: printQueue.length,
    usb: usbSupportedHint(),
  });
});

app.get('/printers', (req, res) => {
  try {
    const printers = listPrintersOs();
    res.json({ ok: true, printers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'list error', printers: [] });
  }
});

app.post('/print', async (req, res) => {
  try {
    const out = await executePrintBody(req.body || {});
    res.json(out);
  } catch (err) {
    log('error', 'POST /print', err?.message || err);
    res.status(500).json({ error: err.message || 'Error de impresión' });
  }
});

app.listen(PORT, BIND_HOST, () => {
  log('info', `Escuchando http://${BIND_HOST}:${PORT} (POST /print, GET /printers, GET /health)`);
  if (BIND_HOST === '127.0.0.1') {
    log('info', 'Tablets/Android en la misma WiFi: defina BIND_HOST=0.0.0.0 y abra el puerto en el firewall');
  }
});
