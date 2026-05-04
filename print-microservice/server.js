'use strict';

/**
 * Microservicio local: POST /print — LAN (TCP), USB serial (COM) o impresora Windows (RAW, sin diálogo).
 * GET /printers — lista nombres de impresoras (solo Windows).
 * Puerto por defecto 3049.
 */
const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { buildEscPosBuffer } = require('./escpos');
const { sendRawTcp, sendUsbSerial, sendWindowsRawPrinter } = require('./sendOutput');
const { scanLan, DEFAULT_PORTS } = require('./discoverLan');

const PORT = Number(process.env.PORT || process.env.PRINT_SERVICE_PORT || 3049);
const BIND_HOST = String(process.env.BIND_HOST || '127.0.0.1').trim() || '127.0.0.1';

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

function isValidComPort(s) {
  const t = String(s || '').trim();
  if (!/^COM\d+$/i.test(t)) return false;
  const n = Number(/^COM(\d+)$/i.exec(t)[1]);
  return n >= 1 && n <= 256;
}

function isValidUnixSerial(s) {
  const t = String(s || '').trim();
  return /^\/dev\/(ttyUSB|ttyACM|tty\.usb|cu\.)\w+/i.test(t) && t.length < 200;
}

const app = express();
// Sitio HTTPS (p. ej. Vercel) → localhost: Chrome exige Private Network Access en el preflight OPTIONS.
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'resto-fadey-print', port: PORT, platform: process.platform });
});

app.get('/discover-lan', async (req, res) => {
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
    res.json({ ok: true, ...result, default_ports: DEFAULT_PORTS });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Error en escaneo de red' });
  }
});

app.get('/printers', async (_req, res) => {
  if (process.platform !== 'win32') {
    return res.json({ ok: true, printers: [], hint: 'Listado solo en Windows' });
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$n = @(Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name); if ($n.Count -eq 0) { "[]" } else { $n | ConvertTo-Json -Compress }',
      ],
      { timeout: 20000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
    );
    const t = String(stdout || '').trim();
    let names = [];
    try {
      const parsed = JSON.parse(t || '[]');
      names = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      names = t ? [t] : [];
    }
    names = names.map((x) => String(x || '').trim()).filter(Boolean);
    return res.json({ ok: true, printers: names });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'No se pudo listar impresoras' });
  }
});

app.post('/print', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const copies = Math.min(5, Math.max(1, Number(req.body?.copies || 1) || 1));
    const paper = [58, 80].includes(Number(req.body?.paper_width_mm)) ? Number(req.body.paper_width_mm) : 80;
    const openDrawer = Boolean(req.body?.open_cash_drawer);

    if (!text || text.length > 24000) {
      return res.status(400).json({ ok: false, error: 'Texto de ticket vacío o demasiado largo' });
    }

    let connection = String(req.body?.connection || '').toLowerCase().trim();
    const ip = String(req.body?.ip || '').trim();
    const tcpPort = Math.min(65535, Math.max(1, Number(req.body?.port || 9100) || 9100));
    const comPort = String(req.body?.com_port || req.body?.comPort || '').trim();
    const baudRate = Math.min(921600, Math.max(1200, Number(req.body?.baud_rate || req.body?.baudRate || 9600) || 9600));
    const windowsPrinter = String(req.body?.windows_printer || req.body?.windowsPrinter || '').trim();

    if (!connection) {
      if (isAllowedPrinterHost(ip)) connection = 'lan';
      else if (isValidComPort(comPort) || isValidUnixSerial(comPort)) connection = 'usb_serial';
      else if (windowsPrinter) connection = 'usb_windows';
      else connection = 'lan';
    }

    const payload = buildEscPosBuffer(text, copies, paper, { open_cash_drawer: openDrawer });

    if (connection === 'lan') {
      if (!isAllowedPrinterHost(ip)) {
        return res.status(400).json({ ok: false, error: 'IP no permitida o vacía (use red local o 127.0.0.1)' });
      }
      await sendRawTcp(ip, tcpPort, payload);
      return res.json({ ok: true, via: 'tcp' });
    }

    if (connection === 'usb_serial') {
      if (!isValidComPort(comPort) && !isValidUnixSerial(comPort)) {
        return res.status(400).json({
          ok: false,
          error: 'Puerto serie inválido. Use COM1…COM256 (Windows) o /dev/ttyUSB0 (Linux)',
        });
      }
      await sendUsbSerial(comPort, baudRate, payload);
      return res.json({ ok: true, via: 'usb_serial' });
    }

    if (connection === 'usb_windows') {
      if (!windowsPrinter) {
        return res.status(400).json({ ok: false, error: 'Indique el nombre exacto de la impresora en Windows' });
      }
      await sendWindowsRawPrinter(windowsPrinter, payload);
      return res.json({ ok: true, via: 'usb_windows' });
    }

    return res.status(400).json({ ok: false, error: 'connection debe ser lan, usb_serial o usb_windows' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'Error de impresión' });
  }
});

app.listen(PORT, BIND_HOST, () => {
  console.log(
    `[print-microservice] http://${BIND_HOST}:${PORT}  POST /print  GET /health  GET /printers  GET /discover-lan`
  );
});
