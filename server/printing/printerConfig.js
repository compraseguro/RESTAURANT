const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'printer-config.json');

const DEFAULT_CONFIG = {
  caja: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, anchoPapel: 80 },
  cocina: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, anchoPapel: 80 },
  bar: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, anchoPapel: 80 },
};

function isValidIp(value) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(value || '').trim());
}

function resolveTipo(raw) {
  return String(raw || 'usb').toLowerCase() === 'red' ? 'red' : 'usb';
}

function resolveAnchoPapel(moduleConfig) {
  const fromPaper = moduleConfig?.paperWidth ?? moduleConfig?.anchoPapel;
  const n = Number(fromPaper || 80);
  return n === 58 ? 58 : 80;
}

function normalizePuerto(moduleConfig) {
  const puerto = Number(moduleConfig?.puerto ?? 9100);
  return Number.isFinite(puerto) && puerto > 0 && puerto <= 65535 ? puerto : 9100;
}

/** Lectura de archivo / respuestas: no exige IP en red vacía (evita romper configs previas). */
function normalizeModuleLenient(moduleConfig, moduleName) {
  const src = moduleConfig && typeof moduleConfig === 'object' ? moduleConfig : {};
  const tipo = resolveTipo(src.tipo);
  return {
    tipo,
    nombre: String(src.nombre || '').trim(),
    ip: tipo === 'usb' ? '' : String(src.ip || '').trim(),
    puerto: normalizePuerto(src),
    autoPrint: moduleName === 'caja' ? true : Boolean(src.autoPrint ?? true),
    anchoPapel: resolveAnchoPapel(src),
  };
}

/** Guardado: USB solo exige nombre; red exige IP y puerto válidos. */
function normalizeModuleStrict(moduleConfig, moduleName) {
  const base = normalizeModuleLenient(moduleConfig, moduleName);
  if (base.tipo === 'usb') {
    if (!String(base.nombre || '').trim()) {
      throw new Error(`Seleccione el nombre de la impresora USB en ${moduleName}`);
    }
    return {
      ...base,
      ip: '',
      puerto: normalizePuerto(moduleConfig || {}),
    };
  }
  const ip = String(moduleConfig?.ip || '').trim();
  if (!isValidIp(ip)) {
    throw new Error(`IP inválida en ${moduleName}`);
  }
  const puerto = normalizePuerto(moduleConfig || {});
  if (!Number.isFinite(puerto) || puerto <= 0 || puerto > 65535) {
    throw new Error(`Puerto inválido en ${moduleName}`);
  }
  return {
    ...base,
    tipo: 'red',
    ip,
    puerto,
    nombre: String(moduleConfig?.nombre || '').trim(),
  };
}

function normalizeConfig(input, options = {}) {
  const strict = Boolean(options.strict);
  const fn = strict ? normalizeModuleStrict : normalizeModuleLenient;
  const src = input && typeof input === 'object' ? input : {};
  return {
    caja: fn(src.caja, 'caja'),
    cocina: fn(src.cocina, 'cocina'),
    bar: fn(src.bar, 'bar'),
  };
}

function mergeModulePayload(current, incoming) {
  const a = current && typeof current === 'object' ? current : {};
  const b = incoming && typeof incoming === 'object' ? incoming : {};
  return { ...a, ...b };
}

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalizeConfig(DEFAULT_CONFIG, { strict: false }), null, 2), 'utf8');
  }
}

function loadConfig() {
  try {
    ensureConfigFile();
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return normalizeConfig(JSON.parse(raw), { strict: false });
  } catch (err) {
    console.error('[printing] error leyendo config:', err.message);
    return normalizeConfig(DEFAULT_CONFIG, { strict: false });
  }
}

function saveConfig(nextConfig) {
  ensureConfigFile();
  let currentRaw = {};
  try {
    currentRaw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    currentRaw = {};
  }
  const incoming = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
  const merged = {
    caja: mergeModulePayload(currentRaw.caja, incoming.caja),
    cocina: mergeModulePayload(currentRaw.cocina, incoming.cocina),
    bar: mergeModulePayload(currentRaw.bar, incoming.bar),
  };
  ['caja', 'cocina', 'bar'].forEach((k) => {
    if (merged[k].paperWidth != null && merged[k].anchoPapel == null) {
      merged[k].anchoPapel = merged[k].paperWidth;
    }
  });
  const keysExplicit = ['caja', 'cocina', 'bar'].filter((k) => Object.prototype.hasOwnProperty.call(incoming, k));
  let finalized = normalizeConfig(merged, { strict: false });
  keysExplicit.forEach((k) => {
    finalized[k] = normalizeModuleStrict(merged[k], k);
  });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(finalized, null, 2), 'utf8');
  return finalized;
}

module.exports = {
  loadConfig,
  saveConfig,
  normalizeConfig,
  DEFAULT_CONFIG,
  isValidIp,
};
