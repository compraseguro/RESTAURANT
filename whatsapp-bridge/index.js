/**
 * Puente WhatsApp (ejecutar SOLO en tu laptop).
 *
 * 1) cp .env.example .env  y complete WHATSAPP_BRIDGE_SECRET (mismo valor que en Render/servidor)
 * 2) npm install && npm start
 * 3) Escanee el QR en la terminal con la app WhatsApp del teléfono
 * 4) Si el API está en Render: exponga este servicio (ej. ngrok http 9876) y ponga WHATSAPP_BRIDGE_URL en Render
 *
 * @see whatsapp-bridge/README.md
 */
require('dotenv').config();
const express = require('express');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const SECRET = String(process.env.WHATSAPP_BRIDGE_SECRET || '').trim();
const PORT = Number(process.env.WHATSAPP_BRIDGE_PORT || 9876);
const BIND = String(process.env.WHATSAPP_BRIDGE_BIND || '127.0.0.1').trim();

if (!SECRET) {
  console.error('Defina WHATSAPP_BRIDGE_SECRET en whatsapp-bridge/.env');
  process.exit(1);
}

let ready = false;
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

client.on('qr', (qr) => {
  console.log('Escanea este QR con WhatsApp → Dispositivos vinculados:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  ready = true;
  console.log('WhatsApp Web conectado. Puente listo para enviar documentos.');
});

client.on('auth_failure', (m) => console.error('Fallo de autenticación WhatsApp:', m));
client.on('disconnected', (r) => {
  ready = false;
  console.warn('WhatsApp desconectado:', r);
});

client.initialize();

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, whatsapp_ready: ready });
});

app.post('/send-document', async (req, res) => {
  if (String(req.get('x-bridge-secret') || '') !== SECRET) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  if (!ready) {
    return res.status(503).json({ ok: false, error: 'whatsapp_not_ready' });
  }
  const { phone, pdfUrl, caption, filename } = req.body || {};
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits || digits.length < 11) {
    return res.status(400).json({ ok: false, error: 'invalid_phone' });
  }
  const url = String(pdfUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ ok: false, error: 'invalid_pdf_url' });
  }
  try {
    const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
    const fn = String(filename || 'comprobante.pdf').replace(/[^\w.-]+/g, '_').slice(0, 120) || 'comprobante.pdf';
    media.filename = fn;
    const chatId = `${digits}@c.us`;
    await client.sendMessage(chatId, media, { caption: String(caption || '').slice(0, 1024) });
    return res.json({ ok: true });
  } catch (e) {
    console.error('send-document:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.listen(PORT, BIND, () => {
  console.log(`Puente HTTP en http://${BIND}:${PORT}  (health: /health, envío: POST /send-document)`);
});
