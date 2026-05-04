import {
  getPrintServiceBaseUrl,
  getStationPrinterConfig,
  isDestinationReady,
  localPrintServiceUnreachableHelp,
} from './localPrinterStorage';
import { sendEscPosViaBrowserUsb } from './browserUsbPrint';

/**
 * Mezcla el formulario (o vista previa) con lo guardado por estación — sin persistir.
 * Así «Probar impresión» usa IP/URL actuales aunque el usuario no haya pulsado Guardar.
 */
export function mergeRuntimePrinterCfg(station, runtime) {
  const base = getStationPrinterConfig(station);
  if (!runtime || typeof runtime !== 'object') return base;
  const conn = String(runtime.connection || base.connection || 'lan').toLowerCase();
  const connection =
    conn === 'usb_serial' || conn === 'usb_windows' || conn === 'usb_browser' ? conn : 'lan';
  const wm = Number(runtime.width_mm);
  const width_mm = [58, 80].includes(wm) ? wm : base.width_mm;
  return {
    ...base,
    connection,
    ip: runtime.ip != null ? String(runtime.ip).trim() : base.ip,
    port: Math.min(65535, Math.max(1, Number(runtime.port ?? base.port) || 9100)),
    com_port: runtime.com_port != null ? String(runtime.com_port).trim() : base.com_port,
    baud_rate: Math.min(921600, Math.max(1200, Number(runtime.baud_rate ?? base.baud_rate) || 9600)),
    windows_printer:
      runtime.windows_printer != null ? String(runtime.windows_printer).trim() : base.windows_printer,
    browser_usb_paired:
      runtime.browser_usb_paired != null
        ? Number(runtime.browser_usb_paired) === 1 || runtime.browser_usb_paired === true
          ? 1
          : 0
        : base.browser_usb_paired,
    width_mm,
    copies: Math.min(5, Math.max(1, Number(runtime.copies ?? base.copies) || 1)),
  };
}

/**
 * Envía ticket: Web Serial (USB en navegador / PWA) o microservicio local (LAN, COM, Windows).
 * @param {{ station: string, text: string, copies?: number, open_cash_drawer?: boolean, runtimeConfig?: object, runtimeServiceUrl?: string }} opts
 * `runtimeConfig` + `runtimeServiceUrl`: valores del panel sin guardar (prueba / integraciones).
 * @returns {Promise<{ ok: boolean, via?: string, error?: string }>}
 */
export async function sendEscPosToStation({
  station,
  text,
  copies,
  open_cash_drawer = false,
  runtimeConfig,
  runtimeServiceUrl,
}) {
  const plain = String(text || '').trim();
  if (!plain) return { ok: false, error: 'Vacío' };

  const cfg = mergeRuntimePrinterCfg(station, runtimeConfig);
  if (cfg.connection === 'usb_browser') {
    return sendEscPosViaBrowserUsb({ station, text, copies, open_cash_drawer, effectiveConfig: cfg });
  }

  if (!isDestinationReady(cfg)) {
    return { ok: false, error: 'Sin impresora configurada en este equipo (IP, COM o Windows)' };
  }

  const n = Math.min(5, Math.max(1, Number(copies ?? cfg.copies ?? 1) || 1));
  const base =
    runtimeServiceUrl != null && String(runtimeServiceUrl).trim()
      ? String(runtimeServiceUrl).trim().replace(/\/$/, '')
      : getPrintServiceBaseUrl();

  try {
    const res = await fetch(`${base}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connection: cfg.connection,
        ip: cfg.ip,
        port: cfg.port,
        com_port: cfg.com_port,
        baud_rate: cfg.baud_rate,
        windows_printer: cfg.windows_printer,
        text: plain,
        copies: n,
        paper_width_mm: cfg.width_mm,
        open_cash_drawer: Boolean(open_cash_drawer),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || res.statusText || 'Error' };
    }
    return { ok: true, via: data.via || 'local-print-service' };
  } catch (e) {
    const msg = String(e?.message || '');
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
      return { ok: false, error: localPrintServiceUnreachableHelp(base) };
    }
    return { ok: false, error: msg || 'No se alcanzó el servicio local (¿está en ejecución?)' };
  }
}

/**
 * @param {{ text: string, copies?: number, open_cash_drawer?: boolean }} opts
 */
export async function sendEscPosToCaja(opts) {
  const { text, copies, open_cash_drawer } = opts;
  return sendEscPosToStation({ station: 'caja', text, copies, open_cash_drawer });
}
