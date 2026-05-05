'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'printing-config.json');

/** @typedef {{ tipo: 'usb'|'red', nombre?: string, ip?: string, puerto?: number, autoPrint?: boolean, widthMm?: number, copies?: number }} StationCfg */

function defaultStation(overrides = {}) {
  return {
    tipo: 'red',
    nombre: '',
    ip: '',
    puerto: 9100,
    autoPrint: true,
    widthMm: 80,
    copies: 1,
    ...overrides,
  };
}

function defaultConfig() {
  return {
    caja: defaultStation({ tipo: 'usb', autoPrint: true }),
    cocina: defaultStation({ tipo: 'red', autoPrint: true }),
    bar: defaultStation({ tipo: 'red', autoPrint: true }),
    delivery: defaultStation({ tipo: 'usb', autoPrint: false }),
  };
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureDir();
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      const d = defaultConfig();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(d, null, 2), 'utf8');
      return d;
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const base = defaultConfig();
    for (const k of Object.keys(base)) {
      if (parsed[k] && typeof parsed[k] === 'object') {
        base[k] = { ...base[k], ...parsed[k] };
      }
    }
    return base;
  } catch (e) {
    console.error('[printing-config]', e.message);
    return defaultConfig();
  }
}

function saveConfig(cfg) {
  ensureDir();
  const merged = { ...defaultConfig(), ...cfg };
  for (const k of Object.keys(merged)) {
    if (cfg[k] && typeof cfg[k] === 'object') {
      merged[k] = { ...defaultConfig()[k], ...cfg[k] };
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function getStationConfig(station) {
  const s = String(station || '').toLowerCase();
  const cfg = loadConfig();
  return cfg[s] || defaultStation();
}

function isStationReady(st) {
  const c = st || {};
  const tipo = String(c.tipo || 'red').toLowerCase();
  if (tipo === 'usb') return Boolean(String(c.nombre || '').trim());
  if (tipo === 'red') {
    const ip = String(c.ip || '').trim();
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
    const p = Number(c.puerto || 9100);
    return p > 0 && p <= 65535;
  }
  return false;
}

module.exports = {
  loadConfig,
  saveConfig,
  getStationConfig,
  defaultConfig,
  isStationReady,
  CONFIG_PATH,
};
