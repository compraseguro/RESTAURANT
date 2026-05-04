/**
 * Configuración de impresión por estación guardada solo en este navegador (localStorage).
 * La app desplegada en Vercel no guarda IP en el servidor; cada PC del local define su térmica.
 */

const KEY_STATION = (station) => `resto_fadey_printer_${String(station || '').toLowerCase()}`;
const KEY_SERVICE = 'resto_fadey_print_service_url';

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

const defaultStation = () => ({
  ip: '',
  port: 9100,
  width_mm: 80,
  copies: 1,
  auto_print: 1,
});

/** @param {'cocina'|'bar'|'caja'|'delivery'|'parrilla'} station */
export function getStationPrinterConfig(station) {
  const st = String(station || '').toLowerCase();
  try {
    const raw = localStorage.getItem(KEY_STATION(st));
    if (!raw) return { ...defaultStation() };
    const o = JSON.parse(raw);
    const wm = [58, 80].includes(Number(o.width_mm)) ? Number(o.width_mm) : 80;
    return {
      ip: String(o.ip ?? o.ip_address ?? '').trim(),
      port: Math.min(65535, Math.max(1, Number(o.port || 9100) || 9100)),
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
  const next = {
    ip: String(cfg?.ip ?? cfg?.ip_address ?? '').trim(),
    port: Math.min(65535, Math.max(1, Number(cfg?.port || 9100) || 9100)),
    width_mm: [58, 80].includes(Number(cfg?.width_mm)) ? Number(cfg.width_mm) : 80,
    copies: Math.min(5, Math.max(1, Number(cfg?.copies || 1) || 1)),
    auto_print: Number(cfg?.auto_print) === 0 || cfg?.auto_print === false ? 0 : 1,
  };
  try {
    localStorage.setItem(KEY_STATION(st), JSON.stringify(next));
  } catch {
    /* */
  }
}

export function hasPrinterIp(station) {
  return isThermalLanIp(getStationPrinterConfig(station).ip);
}
