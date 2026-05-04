/**
 * Configuración de impresión por estación guardada solo en este navegador (localStorage).
 * La app desplegada en Vercel no guarda IP en el servidor; cada PC del local define su térmica.
 *
 * connection:
 * - lan: IP + puerto TCP (RAW 9100)
 * - usb_serial: puerto COM vía microservicio local (Windows/Linux)
 * - usb_windows: impresora Windows RAW vía microservicio (solo Windows)
 * - usb_browser: USB térmica directa desde Chrome/Edge (Web Serial), ideal con app instalada
 */

const KEY_SCOPE = 'resto_fadey_printer_scope';

/** Ámbito opcional (p. ej. restaurant_id) para separar impresoras por sucursal en el mismo navegador. */
export function getPrinterStorageScope() {
  try {
    return localStorage.getItem(KEY_SCOPE) || 'default';
  } catch {
    return 'default';
  }
}

export function setPrinterStorageScope(scope) {
  try {
    localStorage.setItem(KEY_SCOPE, String(scope || 'default'));
  } catch {
    /* */
  }
}

function keyForStation(station) {
  const st = String(station || '').toLowerCase();
  const sc = getPrinterStorageScope();
  if (!sc || sc === 'default') return `resto_fadey_printer_${st}`;
  return `resto_fadey_printer_${sc}_${st}`;
}
const KEY_SERVICE = 'resto_fadey_print_service_url';

/** Instalador Windows incluido en public/downloads/ (mismo sitio que la PWA). */
export const DEFAULT_PRINT_INSTALLER_PATH = '/downloads/RestoFadey-Print-Setup.exe';

/**
 * Enlace al instalador del complemento de impresión (Windows).
 * - Por defecto: `/downloads/RestoFadey-Print-Setup.exe` junto al front en Vercel.
 * - Opcional: `VITE_PRINT_INSTALLER_URL` = URL absoluta (https://...) o ruta que empiece por `/`.
 */
export function getPrintInstallerDownloadUrl() {
  try {
    const u = String(import.meta.env?.VITE_PRINT_INSTALLER_URL || '').trim();
    if (u) {
      if (/^https?:\/\//i.test(u)) return u;
      if (u.startsWith('/')) return u;
    }
  } catch {
    /* */
  }
  return DEFAULT_PRINT_INSTALLER_PATH;
}

/** Misma validación que antes para RAW LAN (no placeholders). */
export function isThermalLanIp(ip) {
  const s = String(ip || '').trim();
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => n > 255 || Number.isNaN(n))) return false;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isUsbComPort(s) {
  const t = String(s || '').trim();
  if (!/^COM\d+$/i.test(t)) return false;
  const n = Number(/^COM(\d+)$/i.exec(t)[1]);
  return n >= 1 && n <= 256;
}

export function isUsbUnixDevice(s) {
  const t = String(s || '').trim();
  return /^\/dev\/(ttyUSB|ttyACM|tty\.usb|cu\.)\w+/i.test(t) && t.length < 200;
}

export function getPrintServiceBaseUrl() {
  try {
    const env = String(import.meta.env?.VITE_PRINT_SERVICE_URL || '').trim();
    if (env && /^https?:\/\//i.test(env)) return env.replace(/\/$/, '');
  } catch {
    /* */
  }
  try {
    const u = localStorage.getItem(KEY_SERVICE);
    if (u && /^https?:\/\//i.test(u)) return u.replace(/\/$/, '');
  } catch {
    /* */
  }
  return 'http://127.0.0.1:3049';
}

export function setPrintServiceBaseUrl(url) {
  try {
    const v = String(url || '').trim().replace(/\/$/, '') || 'http://127.0.0.1:3049';
    localStorage.setItem(KEY_SERVICE, v);
  } catch {
    /* */
  }
}

/** Mensaje cuando fetch a 127.0.0.1:3049 falla (complemento parado, URL mal en panel, o navegador bloqueando). */
export function localPrintServiceUnreachableHelp(baseUrl) {
  const u = String(baseUrl || '').replace(/\/$/, '') || 'http://127.0.0.1:3049';
  return [
    'El navegador no pudo hablar con el complemento de impresión en ESTE equipo',
    `(${u}).`,
    'Instale el .exe, reinicie sesión en Windows y abra en Chrome/Edge',
    `${u}/health (debe verse "ok": true).`,
    'La URL del servicio debe ser http://127.0.0.1:3049 (http, no https).',
    'Si imprime desde otro equipo o el móvil, instale el complemento en ese mismo equipo.',
  ].join(' ');
}

const defaultStation = () => ({
  connection: 'lan',
  ip: '',
  port: 9100,
  com_port: '',
  baud_rate: 9600,
  windows_printer: '',
  browser_usb_paired: 0,
  browser_usb_vendor_id: null,
  browser_usb_product_id: null,
  width_mm: 80,
  copies: 1,
  auto_print: 1,
});

function normalizeConnection(raw) {
  const c = String(raw || '').toLowerCase().trim();
  if (c === 'usb_serial' || c === 'usb_windows' || c === 'usb_browser') return c;
  return 'lan';
}

/** @param {'cocina'|'bar'|'caja'|'delivery'|'parrilla'} station */
export function getStationPrinterConfig(station) {
  const st = String(station || '').toLowerCase();
  try {
    let row = localStorage.getItem(keyForStation(st));
    if (!row) row = localStorage.getItem(`resto_fadey_printer_${st}`);
    if (!row) return { ...defaultStation() };
    const o = JSON.parse(row);
    const wm = [58, 80].includes(Number(o.width_mm)) ? Number(o.width_mm) : 80;
    const connection = normalizeConnection(o.connection);
    return {
      connection,
      ip: String(o.ip ?? o.ip_address ?? '').trim(),
      port: Math.min(65535, Math.max(1, Number(o.port || 9100) || 9100)),
      com_port: String(o.com_port ?? o.comPort ?? '').trim(),
      baud_rate: Math.min(921600, Math.max(1200, Number(o.baud_rate ?? o.baudRate ?? 9600) || 9600)),
      windows_printer: String(o.windows_printer ?? o.windowsPrinter ?? '').trim(),
      browser_usb_paired: Number(o.browser_usb_paired) === 1 || o.browser_usb_paired === true ? 1 : 0,
      browser_usb_vendor_id: o.browser_usb_vendor_id != null ? Number(o.browser_usb_vendor_id) : null,
      browser_usb_product_id: o.browser_usb_product_id != null ? Number(o.browser_usb_product_id) : null,
      width_mm: wm,
      copies: Math.min(5, Math.max(1, Number(o.copies || 1) || 1)),
      auto_print: Number(o.auto_print) === 0 || o.auto_print === false ? 0 : 1,
    };
  } catch {
    return { ...defaultStation() };
  }
}

export function setStationPrinterConfig(station, cfg) {
  const st = String(station || '').toLowerCase();
  const connection = normalizeConnection(cfg?.connection);
  const next = {
    connection,
    ip: String(cfg?.ip ?? cfg?.ip_address ?? '').trim(),
    port: Math.min(65535, Math.max(1, Number(cfg?.port || 9100) || 9100)),
    com_port: String(cfg?.com_port ?? cfg?.comPort ?? '').trim(),
    baud_rate: Math.min(921600, Math.max(1200, Number(cfg?.baud_rate ?? cfg?.baudRate ?? 9600) || 9600)),
    windows_printer: String(cfg?.windows_printer ?? cfg?.windowsPrinter ?? '').trim(),
    browser_usb_paired: Number(cfg?.browser_usb_paired) === 1 || cfg?.browser_usb_paired === true ? 1 : 0,
    browser_usb_vendor_id: cfg?.browser_usb_vendor_id != null ? Number(cfg.browser_usb_vendor_id) : null,
    browser_usb_product_id: cfg?.browser_usb_product_id != null ? Number(cfg.browser_usb_product_id) : null,
    width_mm: [58, 80].includes(Number(cfg?.width_mm)) ? Number(cfg.width_mm) : 80,
    copies: Math.min(5, Math.max(1, Number(cfg?.copies || 1) || 1)),
    auto_print: Number(cfg?.auto_print) === 0 || cfg?.auto_print === false ? 0 : 1,
  };
  try {
    localStorage.setItem(keyForStation(st), JSON.stringify(next));
  } catch {
    /* */
  }
}

/** Hay destino térmico configurado (red, microservicio USB o Web Serial emparejado). */
export function hasPrinterConfigured(station) {
  const c = getStationPrinterConfig(station);
  if (c.connection === 'lan') return isThermalLanIp(c.ip);
  if (c.connection === 'usb_serial') return isUsbComPort(c.com_port) || isUsbUnixDevice(c.com_port);
  if (c.connection === 'usb_windows') return Boolean(c.windows_printer);
  if (c.connection === 'usb_browser') {
    try {
      if (typeof navigator !== 'undefined' && navigator.serial) return true;
    } catch {
      /* */
    }
    return false;
  }
  return false;
}

/** Para impresión automática silenciosa vía Web Serial debe estar emparejado. */
export function isBrowserUsbPaired(station) {
  const c = getStationPrinterConfig(station);
  return c.connection === 'usb_browser' && Number(c.browser_usb_paired) === 1;
}

/** @deprecated usar hasPrinterConfigured */
export function hasPrinterIp(station) {
  return hasPrinterConfigured(station);
}
