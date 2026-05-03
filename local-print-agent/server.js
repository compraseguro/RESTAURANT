/**
 * Agente local: recibe JSON desde el navegador y envía bytes ESC/POS RAW a IP:9100.
 * Instalar en el PC del restaurante: npm install && npm start
 * Por defecto escucha en http://127.0.0.1:49710 (cambie con PORT=).
 */
const net = require('net');
const express = require('express');
const cors = require('cors');

const PORT = Number(process.env.PORT || 49710);
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '512kb' }));

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

function sendEscPosToHost(host, port, text, copies) {
  const init = Buffer.from([0x1b, 0x40]);
  const doubleHeightOn = Buffer.from([0x1b, 0x21, 0x10]);
  const normalSize = Buffer.from([0x1b, 0x21, 0x00]);
  const cut = Buffer.from([0x1d, 0x56, 0x00]);
  const textBuf = Buffer.from(`${String(text || '')}\n\n`, 'utf8');
  const body = Buffer.concat([doubleHeightOn, textBuf, normalSize]);
  const n = Math.min(5, Math.max(1, Number(copies || 1)));
  const chunks = [];
  for (let i = 0; i < n; i += 1) {
    chunks.push(init, body, cut);
  }
  const payload = Buffer.concat(chunks);
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

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'resto-local-print-agent', port: PORT });
});

app.post('/print', async (req, res) => {
  try {
    const ip = String(req.body?.ip_address || '').trim();
    const port = Math.min(65535, Math.max(1, Number(req.body?.port || 9100) || 9100));
    const text = String(req.body?.text || '').trim();
    const copies = Math.min(5, Math.max(1, Number(req.body?.copies || 1) || 1));
    if (!ip) return res.status(400).json({ error: 'ip_address requerida' });
    if (!isAllowedPrinterHost(ip)) {
      return res.status(400).json({ error: 'Solo se permiten IPs de red local' });
    }
    if (!text || text.length > 12000) {
      return res.status(400).json({ error: 'texto inválido o demasiado largo' });
    }
    await sendEscPosToHost(ip, port, text, copies);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error de impresión' });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[local-print-agent] http://127.0.0.1:${PORT}  (POST /print, GET /health)`);
});
