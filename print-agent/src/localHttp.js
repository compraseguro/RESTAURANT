const express = require('express');
const { loadConfig, saveConfig, appendLog } = require('./store');
const { getPendingCount } = require('./db');
const { connectWs, getSocket, normalizeApiBase } = require('./wsClient');
const { enqueue } = require('./queue');

const PORT = Number(process.env.RESTO_PRINT_AGENT_PORT || 37421);

function startLocalHttp() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/health', (req, res) => {
    const cfg = loadConfig();
    const sk = getSocket();
    let queuePending = 0;
    try {
      queuePending = getPendingCount();
    } catch (_) {
      /* db no listo */
    }
    res.json({
      ok: true,
      version: '1.1.0',
      deviceId: cfg.deviceId,
      paired: !!(cfg.token && cfg.apiBase),
      wsConnected: !!(sk && sk.connected),
      queuePending,
      queueBackend: 'sqlite',
      port: PORT,
    });
  });

  app.post('/pair', (req, res) => {
    try {
      const token = String(req.body?.token || '').trim();
      const apiBase = normalizeApiBase(req.body?.apiBase || req.body?.api_base);
      if (!token || !apiBase) {
        return res.status(400).json({ error: 'token y apiBase requeridos' });
      }
      const cfg = loadConfig();
      cfg.token = token;
      cfg.apiBase = apiBase;
      saveConfig(cfg);
      appendLog('pair ok desde panel web');
      connectWs((payload) => enqueue(payload, getSocket));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.listen(PORT, '127.0.0.1', () => {
    appendLog(`local http 127.0.0.1:${PORT}`);
    console.log(`[print-agent] HTTP local http://127.0.0.1:${PORT}/health`);
  });
}

module.exports = { startLocalHttp, PORT };
