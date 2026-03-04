const { queryOne } = require('./database');

const PAYMENT_METHOD_LABELS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  yape: 'Yape',
  plin: 'Plin',
  online: 'Online',
};

function parseJsonSafe(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function normalizeMethodName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapMethodNameToId(value) {
  const normalized = normalizeMethodName(value);
  if (!normalized) return '';
  if (normalized.includes('efect')) return 'efectivo';
  if (normalized.includes('tarjet')) return 'tarjeta';
  if (normalized.includes('yape')) return 'yape';
  if (normalized.includes('plin')) return 'plin';
  if (normalized === 'efectivo' || normalized === 'tarjeta' || normalized === 'yape' || normalized === 'plin') return normalized;
  return '';
}

function getAppSettingsSnapshot() {
  const pagosRow = queryOne('SELECT value FROM app_settings WHERE key = ?', ['pagos_sistema']);
  const settingsRow = queryOne('SELECT value FROM app_settings WHERE key = ?', ['settings']);
  return {
    pagosSistema: parseJsonSafe(pagosRow?.value, {}),
    settings: parseJsonSafe(settingsRow?.value, {}),
  };
}

function getAllowedPaymentMethods() {
  const { pagosSistema, settings } = getAppSettingsSnapshot();
  const formasPago = Array.isArray(settings?.formas_pago) ? settings.formas_pago : [];
  const fromForms = formasPago
    .filter((item) => Number(item?.active ?? 1) === 1)
    .map((item) => mapMethodNameToId(item?.name))
    .filter(Boolean);
  if (fromForms.length > 0) {
    return Array.from(new Set(fromForms));
  }

  const options = [];
  if (Number(pagosSistema?.acepta_efectivo ?? 1) === 1) options.push('efectivo');
  if (Number(pagosSistema?.acepta_tarjeta ?? 1) === 1) options.push('tarjeta');
  if (Number(pagosSistema?.acepta_yape ?? 0) === 1) options.push('yape');
  if (Number(pagosSistema?.acepta_plin ?? 0) === 1) options.push('plin');
  if (options.length === 0) return ['efectivo', 'tarjeta'];
  return options;
}

function normalizePaymentMethod(rawMethod, { fallback = 'efectivo', allowOnline = false } = {}) {
  const requested = String(rawMethod || '').trim().toLowerCase();
  if (!requested) return fallback;
  if (allowOnline && requested === 'online') return 'online';
  const allowed = getAllowedPaymentMethods();
  if (allowed.includes(requested)) return requested;
  return fallback;
}

function isPaymentMethodAllowed(method, { allowOnline = false } = {}) {
  const normalized = String(method || '').trim().toLowerCase();
  if (allowOnline && normalized === 'online') return true;
  return getAllowedPaymentMethods().includes(normalized);
}

function assertPaymentMethodAllowed(method, { allowOnline = false } = {}) {
  if (isPaymentMethodAllowed(method, { allowOnline })) return;
  const allowed = getAllowedPaymentMethods();
  const labels = allowed.map((m) => PAYMENT_METHOD_LABELS[m] || m).join(', ');
  throw new Error(`Método de pago no permitido. Configuración actual: ${labels}`);
}

const FINANCIAL_FILTER_SQL = "status != 'cancelled' AND payment_status = 'paid'";

module.exports = {
  FINANCIAL_FILTER_SQL,
  getAllowedPaymentMethods,
  normalizePaymentMethod,
  isPaymentMethodAllowed,
  assertPaymentMethodAllowed,
};
