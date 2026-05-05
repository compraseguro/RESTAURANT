const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const dataDir = process.env.RESTO_PRINT_AGENT_DATA || path.join(root, 'data');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

module.exports = { root, dataDir, ensureDataDir };
