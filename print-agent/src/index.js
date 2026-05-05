/**
 * Resto Print Agent — impresión silenciosa vía Socket.IO (namespace /print-agent).
 */
require('./paths').ensureDataDir();

async function main() {
  const { initDb } = require('./db');
  await initDb();

  const { loadConfig, saveConfig } = require('./store');
  const cfg = loadConfig();
  saveConfig(cfg);

  const { startLocalHttp } = require('./localHttp');
  startLocalHttp();

  const { connectWs, getSocket } = require('./wsClient');
  const { enqueue, drainQueue } = require('./queue');

  connectWs((payload) => enqueue(payload, getSocket));

  setTimeout(() => {
    drainQueue(getSocket).catch(() => {});
  }, 800);
}

const { appendLog } = require('./store');

main().catch((e) => {
  appendLog(`fatal ${e.message}`);
  console.error(e);
  process.exit(1);
});

process.on('uncaughtException', (e) => {
  appendLog(`uncaughtException ${e.message}`);
});
process.on('unhandledRejection', (e) => {
  appendLog(`unhandledRejection ${e?.message || e}`);
});
