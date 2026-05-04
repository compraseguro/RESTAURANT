'use strict';

/**
 * Microservicio local: POST /print recibe texto + IP:puerto de la térmica, envía ESC/POS RAW (9100).
 * Puerto por defecto 3049 para no chocar con la API del restaurante en 3001.
 *
 * Variables: PORT (default 3049), BIND_HOST (127.0.0.1)
 */
const net = require('net');
const express = require('express');
const cors = require('cors');
const { buildEscPosBuffer } = require('./escpos');

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

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(cors({ origin: true }));
app.use(express.json({ limit: '512kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'resto-fadey-print', port: PORT });
});

app.post('/print', async (req, res) => {
  try {
    const ip = String(req.body?.ip || '').trim();
    const port = Math.min(65535, Math.max(1, Number(req.body?.port || 9100) || 9100));
    const text = String(req.body?.text || '').trim();
    const copies = Math.min(5, Math.max(1, Number(req.body?.copies || 1) || 1));
    const paper = [58, 80].includes(Number(req.body?.paper_width_mm)) ? Number(req.body.paper_width_mm) : 80;
    const openDrawer = Boolean(req.body?.open_cash_drawer);

    if (!text || text.length > 24000) {
      return res.status(400).json({ ok: false, error: 'Texto de ticket vacío o demasiado largo' });
    }
    if (!isAllowedPrinterHost(ip)) {
      return res.status(400).json({ ok: false, error: 'IP no permitida (use red local 10.x, 192.168.x, 172.16-31.x o 127.0.0.1)' });
    }

    const payload = buildEscPosBuffer(text, copies, paper, { open_cash_drawer: openDrawer });
    await sendRawOnce(ip, port, payload);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'Error de impresión' });
  }
});

app.listen(PORT, BIND_HOST, () => {
  console.log(`[print-microservice] http://${BIND_HOST}:${PORT}  POST /print  GET /health`);
});
