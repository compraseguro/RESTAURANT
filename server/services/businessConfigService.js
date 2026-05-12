/**
 * Configuración empresarial parametrizable (Fase A): definiciones en BD, valores editables, historial.
 * Sin evaluar código arbitrario: solo tipos atómicos validados contra constraints_json.
 */

const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, withTransaction, logAudit } = require('../database');

const CACHE_MS = 4000;
let cacheKardexMetodo = { t: 0, value: 'promedio' };

const DOMAIN_LABELS = {
  general: 'General y operación',
  profitability: 'Rentabilidad',
  inventory: 'Inventario y costeo',
  production: 'Producción',
  automation: 'Automatización',
  commercial: 'Inteligencia comercial',
  predictive: 'Análisis predictivo',
  variance: 'Teórico vs real',
  alerts: 'Alertas',
  dashboard: 'Dashboard ejecutivo',
};

function parseJsonSafe(text, fallback) {
  try {
    if (text == null || text === '') return fallback;
    return JSON.parse(String(text));
  } catch (_) {
    return fallback;
  }
}

function parseConstraints(row) {
  return parseJsonSafe(row?.constraints_json, {});
}

function coerceAtomic(type, raw) {
  const t = String(type || 'string');
  if (t === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error('Se esperaba un número');
    return n;
  }
  if (t === 'boolean') {
    if (raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true') return true;
    if (raw === false || raw === 0 || raw === '0' || String(raw).toLowerCase() === 'false') return false;
    throw new Error('Se esperaba verdadero/falso');
  }
  if (t === 'json') {
    if (raw != null && typeof raw === 'object') return raw;
    return parseJsonSafe(raw, {});
  }
  return String(raw ?? '');
}

function stringifyAtomic(type, value) {
  const t = String(type || 'string');
  if (t === 'json') return JSON.stringify(value != null ? value : {});
  return JSON.stringify(value);
}

function validateAgainstConstraints(type, value, constraints) {
  const c = constraints && typeof constraints === 'object' ? constraints : {};
  if (type === 'number') {
    const n = value;
    if (c.min != null && Number(c.min) > n) throw new Error(`Valor mínimo: ${c.min}`);
    if (c.max != null && Number(c.max) < n) throw new Error(`Valor máximo: ${c.max}`);
  }
  if (type === 'string' && Array.isArray(c.allowed) && c.allowed.length) {
    if (!c.allowed.includes(value)) {
      throw new Error(`Valor no permitido. Use uno de: ${c.allowed.join(', ')}`);
    }
  }
}

function resolveRowValue(row) {
  const def = parseJsonSafe(row.default_value, null);
  const rawStored = row.stored_value;
  if (rawStored == null || rawStored === '') {
    return coerceAtomic(row.value_type, def);
  }
  return coerceAtomic(row.value_type, parseJsonSafe(rawStored, def));
}

/**
 * Valorización registrada en kardex (la lógica numérica sigue siendo promedio ponderado hasta implementar FIFO/último costo).
 */
function mapValuationMethodToKardexLabel(method) {
  const m = String(method || 'weighted_average').trim();
  if (m === 'fifo') return 'fifo';
  if (m === 'last_cost') return 'ultimo_costo';
  return 'promedio';
}

function invalidateKardexMetodoCache() {
  cacheKardexMetodo.t = 0;
}

function getKardexMetodoValorizacion() {
  const now = Date.now();
  if (now - cacheKardexMetodo.t < CACHE_MS) return cacheKardexMetodo.value;
  const row = queryOne(
    `SELECT COALESCE(v.value, d.default_value) AS val
     FROM business_config_definitions d
     LEFT JOIN business_config_values v ON v.config_key = d.config_key
     WHERE d.config_key = 'inv_valuation_method' AND d.active = 1`
  );
  const parsed = parseJsonSafe(row?.val, 'weighted_average');
  const method = typeof parsed === 'string' ? parsed : 'weighted_average';
  const label = mapValuationMethodToKardexLabel(method);
  cacheKardexMetodo = { t: now, value: label };
  return label;
}

function listDefinitionsMerged() {
  const rows = queryAll(
    `SELECT d.config_key, d.domain, d.label, d.value_type, d.default_value, d.constraints_json, d.description, d.sort_order,
            v.value AS stored_value, v.updated_at AS value_updated_at, v.updated_by AS value_updated_by
     FROM business_config_definitions d
     LEFT JOIN business_config_values v ON v.config_key = d.config_key
     WHERE d.active = 1
     ORDER BY d.domain ASC, d.sort_order ASC, d.config_key ASC`
  );
  return rows.map((r) => {
    const constraints = parseConstraints(r);
    let value;
    try {
      value = resolveRowValue(r);
    } catch (_) {
      value = parseJsonSafe(r.default_value, null);
    }
    return {
      key: r.config_key,
      domain: r.domain,
      label: r.label,
      value_type: r.value_type,
      value,
      default_value: parseJsonSafe(r.default_value, null),
      constraints,
      description: r.description || '',
      sort_order: Number(r.sort_order || 0),
      updated_at: r.value_updated_at || null,
      updated_by: r.value_updated_by || null,
    };
  });
}

function getEffectiveDomainsPayload() {
  const entries = listDefinitionsMerged();
  const byDomain = new Map();
  for (const e of entries) {
    if (!byDomain.has(e.domain)) byDomain.set(e.domain, []);
    byDomain.get(e.domain).push(e);
  }
  const domains = [];
  for (const [id, list] of byDomain) {
    domains.push({
      id,
      label: DOMAIN_LABELS[id] || id,
      entries: list,
    });
  }
  domains.sort((a, b) => String(a.label).localeCompare(String(b.label), 'es'));
  return { domains, domain_labels: DOMAIN_LABELS };
}

/** Objeto plano key → valor atómico (para consumo en informes u otros servicios). */
function getEffectiveFlat() {
  const out = {};
  for (const row of listDefinitionsMerged()) {
    out[row.key] = row.value;
  }
  return out;
}

function setValues(updates, { actorUserId = '', actorName = '', ip = '' } = {}) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('Se esperaba un objeto de actualizaciones');
  }
  const keys = Object.keys(updates);
  if (!keys.length) throw new Error('Sin cambios');

  const planned = [];
  for (const key of keys) {
    const def = queryOne('SELECT * FROM business_config_definitions WHERE config_key = ? AND active = 1', [key]);
    if (!def) throw new Error(`Parámetro desconocido o inactivo: ${key}`);
    const constraints = parseConstraints(def);
    const prevRow = queryOne('SELECT value FROM business_config_values WHERE config_key = ?', [key]);
    const prevAtomic =
      prevRow?.value != null && prevRow.value !== ''
        ? coerceAtomic(def.value_type, parseJsonSafe(prevRow.value, null))
        : coerceAtomic(def.value_type, parseJsonSafe(def.default_value, null));
    const nextAtomic = coerceAtomic(def.value_type, updates[key]);
    validateAgainstConstraints(def.value_type, nextAtomic, constraints);
    const beforeJson = stringifyAtomic(def.value_type, prevAtomic);
    const afterJson = stringifyAtomic(def.value_type, nextAtomic);
    if (beforeJson === afterJson) continue;
    planned.push({ key, beforeJson, afterJson });
  }
  if (!planned.length) throw new Error('Sin cambios efectivos');

  withTransaction((tx) => {
    for (const p of planned) {
      tx.run(
        `INSERT INTO business_config_values (config_key, value, updated_at, updated_by)
         VALUES (?, ?, datetime('now'), ?)
         ON CONFLICT(config_key) DO UPDATE SET value = excluded.value, updated_at = datetime('now'), updated_by = excluded.updated_by`,
        [p.key, p.afterJson, actorUserId || '']
      );
      tx.run(
        `INSERT INTO business_config_history (id, config_key, value_before, value_after, actor_user_id, actor_name, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          uuidv4(),
          p.key,
          p.beforeJson,
          p.afterJson,
          actorUserId || '',
          actorName || '',
          String(ip || '').slice(0, 64),
        ]
      );
    }
  });

  invalidateKardexMetodoCache();
  logAudit({
    actorUserId,
    actorName,
    action: 'business_config.update',
    resourceType: 'business_config',
    resourceId: 'bulk',
    details: { keys: planned.map((p) => p.key) },
  });
}

function listHistory({ key = '', limit = 50 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  if (key && String(key).trim()) {
    return queryAll(
      `SELECT * FROM business_config_history WHERE config_key = ? ORDER BY datetime(created_at) DESC LIMIT ?`,
      [String(key).trim(), lim]
    );
  }
  return queryAll(
    `SELECT * FROM business_config_history ORDER BY datetime(created_at) DESC LIMIT ?`,
    [lim]
  );
}

module.exports = {
  DOMAIN_LABELS,
  listDefinitionsMerged,
  getEffectiveDomainsPayload,
  getEffectiveFlat,
  setValues,
  listHistory,
  getKardexMetodoValorizacion,
  invalidateKardexMetodoCache,
  parseJsonSafe,
};
