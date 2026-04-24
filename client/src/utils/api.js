/**
 * Origen del API:
 * - Si defines VITE_API_URL (p. ej. en .env), se usa siempre.
 * - En desarrollo (npm run dev) sin variable: `/api` → proxy de Vite al backend local (p. ej. :3001).
 * - En build de producción sin variable: URL por defecto en la nube (despliegue clásico).
 */
const rawApi = import.meta.env.VITE_API_URL;
const hasExplicitApi = rawApi !== undefined && rawApi !== null && String(rawApi).trim() !== '';
let API_ORIGIN = '';
if (hasExplicitApi) {
  API_ORIGIN = String(rawApi).trim().replace(/\/$/, '');
} else if (import.meta.env.PROD) {
  API_ORIGIN = 'https://resto-fadey-api.onrender.com';
}
const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

/** URL absoluta para `/uploads/...` cuando el front y la API están en hosts distintos. */
export function resolveMediaUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/uploads/') && API_ORIGIN) return `${API_ORIGIN}${s}`;
  return s;
}

/** Mismo host que la API REST, para Socket.IO (sin `/api`). Si la página y la API están en hosts distintos, debe coincidir con `VITE_API_URL`. */
export function getSocketOrigin() {
  if (API_ORIGIN) return API_ORIGIN;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

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
    if (res.status === 404) {
      throw new Error(
        'No se encontró el servicio (404). En local, ejecute el backend en el puerto 3001 y use npm run dev sin VITE_API_URL, o despliegue la API con las rutas actualizadas.'
      );
    }
    throw new Error(
      data?.message || `Error ${res.status}: el servidor no devolvió JSON válido`
    );
  }

  return data;
}

export const api = {
  /** `options` se fusiona con fetch (p. ej. `{ cache: 'no-store' }`). */
  get: (endpoint, options = {}) => request(endpoint, { method: 'GET', cache: 'no-store', ...options }),
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
  /** Certificado SUNAT .pfx / .p12 → `uploads/billing-certs/` en el servidor Node. */
  uploadBillingCert: async (file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('cert', file);
    const res = await fetch(`${API_BASE}/upload/billing-cert`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'No se pudo subir el certificado');
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

/**
 * Fecha/hora sin zona (típico SQLite) → hora local del navegador.
 * Evita desfasar el día al forzar "Z" como parseApiDate en timestamps locales.
 */
export function parseLocalNaiveDateTime(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Apertura de caja: prioriza naive local; si no, parseApiDate. */
export function parseCashRegisterOpenedAt(value) {
  const naive = parseLocalNaiveDateTime(value);
  if (naive) return naive;
  return parseApiDate(value);
}

/** Fecha local dd/mm/aaaa (sin depender del locale del navegador). */
function formatPeDateDdMmYyyy(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Hora local 12 h, minutos con dos dígitos, sin segundos (ej. 9:05 a.m., 9:50 p.m.). */
function formatPeTime12hNoSeconds(d) {
  const h24 = d.getHours();
  const min = d.getMinutes();
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const mm = String(min).padStart(2, '0');
  const suffix = h24 < 12 ? 'a.m.' : 'p.m.';
  return `${h12}:${mm} ${suffix}`;
}

function peDateTimePartsFromDate(d) {
  return {
    date: formatPeDateDdMmYyyy(d),
    time: formatPeTime12hNoSeconds(d),
  };
}

/** Fecha (dd/mm/aaaa) y hora solo h:mm (12 h, sin segundos) para arqueo / impresión. */
export function formatPeDateTimeParts(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { date: '—', time: '—' };
    return peDateTimePartsFromDate(value);
  }
  const d = parseCashRegisterOpenedAt(value);
  if (!d) return { date: '—', time: '—' };
  return peDateTimePartsFromDate(d);
}

/** Una sola cadena: `dd/mm/aaaa h:mm a.m.|p.m.` */
export function formatPeDateTimeLine(value) {
  const { date, time } = formatPeDateTimeParts(value);
  if (date === '—') return '—';
  return `${date} ${time}`;
}

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

/** Al crear pedido delivery: anticipado vs contra entrega (distinto del medio de pago en caja). */
export const DELIVERY_PAYMENT_MODALITY_OPTIONS = [
  { value: 'anticipado', label: 'Anticipado' },
  { value: 'contra_entrega', label: 'Contra entrega' },
];

export function labelDeliveryPaymentModality(raw) {
  const k = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (k === 'anticipado') return 'Anticipado';
  if (k === 'contra_entrega') return 'Contra entrega';
  return '';
}

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

  const activeFormas = formasPago.filter((item) => Number(item?.active ?? 1) === 1);

  /**
   * Con formas activas en Ajustes → Formas de pago: orden y texto mostrado = configuración del sistema.
   * Solo se incluyen métodos reconocidos (efectivo / tarjeta / yape / plin).
   */
  if (activeFormas.length > 0) {
    const seen = new Set();
    const options = [];
    for (const item of activeFormas) {
      const id = mapMethodNameToId(item?.name);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const rawName = String(item?.name || '').trim();
      const label = rawName || PAYMENT_METHODS[id] || id;
      options.push({ value: id, label });
    }
    if (includeOnline) options.push({ value: 'online', label: PAYMENT_METHODS.online });
    if (options.length === 0) {
      return [
        { value: 'efectivo', label: PAYMENT_METHODS.efectivo },
        { value: 'tarjeta', label: PAYMENT_METHODS.tarjeta },
      ];
    }
    return options;
  }

  /* Sin filas activas en formas_pago: mismos interruptores que Mi restaurante → pagos_sistema */
  const base = [
    { value: 'efectivo', label: PAYMENT_METHODS.efectivo, enabled: Number(pagos.acepta_efectivo ?? 1) === 1 },
    { value: 'tarjeta', label: PAYMENT_METHODS.tarjeta, enabled: Number(pagos.acepta_tarjeta ?? 1) === 1 },
    { value: 'yape', label: PAYMENT_METHODS.yape, enabled: Number(pagos.acepta_yape ?? 0) === 1 },
    { value: 'plin', label: PAYMENT_METHODS.plin, enabled: Number(pagos.acepta_plin ?? 0) === 1 },
  ];

  const options = base.filter((opt) => opt.enabled).map(({ value, label }) => ({ value, label }));
  if (includeOnline) options.push({ value: 'online', label: PAYMENT_METHODS.online });
  if (options.length === 0) {
    return [
      { value: 'efectivo', label: PAYMENT_METHODS.efectivo },
      { value: 'tarjeta', label: PAYMENT_METHODS.tarjeta },
    ];
  }
  return options;
};
