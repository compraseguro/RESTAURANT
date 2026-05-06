const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'printer-config.json');

const DEFAULT_CONFIG = {
  caja: { tipo: 'usb', nombre: '' },
  cocina: { tipo: 'red', nombre: '', ip: '', puerto: 9100, autoPrint: true },
  bar: { tipo: 'red', nombre: '', ip: '', puerto: 9100, autoPrint: true },
};

function normalizeModule(moduleConfig, moduleName) {
  const tipo = String(moduleConfig?.tipo || 'usb').toLowerCase() === 'red' ? 'red' : 'usb';
  const puerto = Number(moduleConfig?.puerto || 9100);
  return {
    tipo,
    nombre: String(moduleConfig?.nombre || '').trim(),
    ip: String(moduleConfig?.ip || '').trim(),
    puerto: Number.isFinite(puerto) && puerto > 0 && puerto <= 65535 ? puerto : 9100,
    autoPrint: moduleName === 'caja' ? true : Boolean(moduleConfig?.autoPrint ?? true),
  };
}

function normalizeConfig(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    caja: normalizeModule(src.caja, 'caja'),
    cocina: normalizeModule(src.cocina, 'cocina'),
    bar: normalizeModule(src.bar, 'bar'),
  };
}

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  }
}

function loadConfig() {
  try {
    ensureConfigFile();
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch (err) {
    console.error('[printing] error leyendo config:', err.message);
    return normalizeConfig(DEFAULT_CONFIG);
  }
}

function saveConfig(nextConfig) {
  const normalized = normalizeConfig(nextConfig);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

module.exports = {
  loadConfig,
  saveConfig,
  normalizeConfig,
  DEFAULT_CONFIG,
};
