'use strict';

const WebSocket = require('ws');

function attachPrintWebSocket(httpServer, options = {}) {
  const path = options.path || '/ws-print';
  const wss = new WebSocket.Server({ server: httpServer, path });

  function broadcast(obj) {
    const raw = JSON.stringify(obj);
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      try {
        client.send(raw);
      } catch {
        /* */
      }
    }
  }

  wss.on('connection', (ws) => {
    try {
      ws.send(JSON.stringify({ type: 'hello', service: 'resto-fadey-print', t: Date.now() }));
    } catch {
      /* */
    }
    ws.on('error', () => {});
  });

  return { wss, broadcast };
}

module.exports = { attachPrintWebSocket };
