const { io } = require('socket.io-client');
const { loadConfig, appendLog } = require('./store');
const { enqueue } = require('./queue');

let socket = null;
let backoffMs = 2000;

function normalizeApiBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/$/, '');
}

function connectWs(onPrintJob) {
  const cfg = loadConfig();
  const apiBase = normalizeApiBase(cfg.apiBase || process.env.RESTO_API_URL);
  const token = String(cfg.token || process.env.RESTO_PRINT_AGENT_TOKEN || '').trim();
  if (!apiBase || !token) {
    appendLog('ws skip: falta apiBase o token (empareje desde el panel o config.json)');
    return;
  }

  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch (_) {
      /* noop */
    }
    socket = null;
  }

  const url = `${apiBase}/print-agent`;
  socket = io(url, {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: backoffMs,
    reconnectionDelayMax: 30000,
    auth: { token },
  });

  socket.on('connect', () => {
    backoffMs = 2000;
    appendLog(`ws connect ${url}`);
  });

  socket.on('agent-ready', (p) => {
    appendLog(`agent-ready ${JSON.stringify(p)}`);
  });

  socket.on('print-job', (payload) => {
    appendLog(`print-job ${payload?.jobId} ${payload?.area}`);
    if (typeof onPrintJob === 'function') onPrintJob(payload);
  });

  socket.on('disconnect', (reason) => {
    appendLog(`ws disconnect ${reason}`);
  });

  socket.on('connect_error', (err) => {
    appendLog(`ws connect_error ${err?.message || err}`);
    backoffMs = Math.min(backoffMs * 2, 30000);
  });
}

function getSocket() {
  return socket;
}

module.exports = {
  connectWs,
  getSocket,
  normalizeApiBase,
};
