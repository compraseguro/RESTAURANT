const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    if (data?.error) throw new Error(data.error);
    throw new Error(`Error ${res.status}: respuesta no JSON del servidor`);
  }

  return data;
}

export const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
  upload: async (file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'No se pudo subir el archivo');
    return data;
  },
};

export const parseApiDate = (value) => {
  if (!value) return null;
  const safe = String(value).replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(safe) ? safe : `${safe}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const toLocalDateKey = (value) => {
  const d = parseApiDate(value);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const formatCurrency = (amount, symbol = 'S/') => {
  return `${symbol} ${Number(amount || 0).toFixed(2)}`;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = parseApiDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const d = parseApiDate(dateStr);
  if (!d) return '';
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = parseApiDate(dateStr);
  if (!d) return '';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
};

export const ORDER_STATUS = {
  pending: { label: 'Pendiente', color: 'badge-pending' },
  preparing: { label: 'En Preparación', color: 'badge-preparing' },
  ready: { label: 'Listo', color: 'badge-ready' },
  delivered: { label: 'Entregado', color: 'badge-delivered' },
  cancelled: { label: 'Cancelado', color: 'badge-cancelled' },
};

export const ORDER_TYPES = {
  dine_in: 'Mesa',
  delivery: 'Delivery',
  pickup: 'Para llevar',
};

export const PAYMENT_METHODS = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  online: 'Online',
};

const normalizeMethodName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const mapMethodNameToId = (value) => {
  const normalized = normalizeMethodName(value);
  if (!normalized) return '';
  if (normalized.includes('efect')) return 'efectivo';
  if (normalized.includes('tarjet')) return 'tarjeta';
  if (normalized.includes('yape')) return 'yape';
  if (normalized.includes('plin')) return 'plin';
  if (normalized === 'efectivo' || normalized === 'tarjeta' || normalized === 'yape' || normalized === 'plin') return normalized;
  return '';
};

export const getPaymentMethodOptions = (appConfig, { includeOnline = false } = {}) => {
  const pagos = appConfig?.pagos_sistema || {};
  const formasPago = Array.isArray(appConfig?.formas_pago)
    ? appConfig.formas_pago
    : Array.isArray(appConfig?.settings?.formas_pago)
      ? appConfig.settings.formas_pago
      : [];

  const enabledFromForms = new Set(
    formasPago
      .filter((item) => Number(item?.active ?? 1) === 1)
      .map((item) => mapMethodNameToId(item?.name))
      .filter(Boolean)
  );

  const hasFormsConfig = enabledFromForms.size > 0;
  const base = [
    {
      value: 'efectivo',
      label: PAYMENT_METHODS.efectivo,
      enabled: hasFormsConfig ? enabledFromForms.has('efectivo') : Number(pagos.acepta_efectivo ?? 1) === 1,
    },
    {
      value: 'tarjeta',
      label: PAYMENT_METHODS.tarjeta,
      enabled: hasFormsConfig ? enabledFromForms.has('tarjeta') : Number(pagos.acepta_tarjeta ?? 1) === 1,
    },
    {
      value: 'yape',
      label: PAYMENT_METHODS.yape,
      enabled: hasFormsConfig ? enabledFromForms.has('yape') : Number(pagos.acepta_yape ?? 0) === 1,
    },
    {
      value: 'plin',
      label: PAYMENT_METHODS.plin,
      enabled: hasFormsConfig ? enabledFromForms.has('plin') : Number(pagos.acepta_plin ?? 0) === 1,
    },
  ];

  const options = base.filter(opt => opt.enabled).map(({ value, label }) => ({ value, label }));
  if (includeOnline) options.push({ value: 'online', label: PAYMENT_METHODS.online });
  if (options.length === 0) {
    return [
      { value: 'efectivo', label: PAYMENT_METHODS.efectivo },
      { value: 'tarjeta', label: PAYMENT_METHODS.tarjeta },
    ];
  }
  return options;
};
