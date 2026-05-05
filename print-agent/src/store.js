const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { dataDir, ensureDataDir } = require('./paths');

const configPath = path.join(dataDir, 'config.json');
const logPath = path.join(dataDir, 'agent.log');

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, obj) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

function loadConfig() {
  ensureDataDir();
  const cfg = readJson(configPath, {});
  if (!cfg.deviceId) cfg.deviceId = uuidv4();
  if (!cfg.bindings) cfg.bindings = {};
  return cfg;
}

function saveConfig(cfg) {
  writeJson(configPath, cfg);
}

function appendLog(line) {
  try {
    ensureDataDir();
    const ts = new Date().toISOString();
    fs.appendFileSync(logPath, `[${ts}] ${line}\n`, 'utf8');
  } catch (_) {
    /* noop */
  }
}

module.exports = {
  configPath,
  loadConfig,
  saveConfig,
  appendLog,
};
