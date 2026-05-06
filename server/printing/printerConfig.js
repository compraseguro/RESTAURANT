const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'printer-config.json');

const DEFAULT_CONFIG = {
  caja: { tipo: 'usb', nombre: '', anchoPapel: 80 },
  cocina: { tipo: 'red', nombre: '', ip: '', puerto: 9100, autoPrint: true, anchoPapel: 80 },
  bar: { tipo: 'red', nombre: '', ip: '', puerto: 9100, autoPrint: true, anchoPapel: 80 },
};

function isValidIp(value) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(value || '').trim());
}

function normalizeModule(moduleConfig, moduleName) {
  const tipo = String(moduleConfig?.tipo || 'usb').toLowerCase() === 'red' ? 'red' : 'usb';
  const puerto = Number(moduleConfig?.puerto || 9100);
  const anchoRaw = Number(moduleConfig?.anchoPapel || 80);
  const anchoPapel = anchoRaw === 58 ? 58 : 80;
  const ip = String(moduleConfig?.ip || '').trim();
  if (tipo === 'red' && !isValidIp(ip)) {
    throw new Error(`IP inválida en ${moduleName}: ${ip || '(vacía)'}`);
  }
  return {
    tipo,
    nombre: String(moduleConfig?.nombre || '').trim(),
    ip,
    puerto: Number.isFinite(puerto) && puerto > 0 && puerto <= 65535 ? puerto : 9100,
    autoPrint: moduleName === 'caja' ? true : Boolean(moduleConfig?.autoPrint ?? true),
    anchoPapel,
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
