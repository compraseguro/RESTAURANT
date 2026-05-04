import { getPrintServiceBaseUrl, getStationPrinterConfig, hasPrinterConfigured } from './localPrinterStorage';
import { sendEscPosViaBrowserUsb } from './browserUsbPrint';

function explainLocalPrintFetchFailure(baseUrl) {
  const u = String(baseUrl || '').replace(/\/$/, '') || 'http://127.0.0.1:3049';
  return [
    'El navegador no pudo hablar con el complemento de impresión en ESTE equipo',
    `(${u}).`,
    'Instale el .exe de impresión, reinicie sesión en Windows y pruebe en Chrome/Edge abriendo',
    `${u}/health (debe verse "ok": true).`,
    'La impresión por red/COM/Windows solo funciona en el PC donde corre ese programa, no desde el móvil u otra máquina sin instalarlo.',
  ].join(' ');
}

/**
 * Envía ticket: Web Serial (USB en navegador / PWA) o microservicio local (LAN, COM, Windows).
 * @param {{ station: string, text: string, copies?: number, open_cash_drawer?: boolean }} opts
 * @returns {Promise<{ ok: boolean, via?: string, error?: string }>}
 */
export async function sendEscPosToStation({ station, text, copies, open_cash_drawer = false }) {
  const plain = String(text || '').trim();
  if (!plain) return { ok: false, error: 'Vacío' };

  const cfg = getStationPrinterConfig(station);
  if (cfg.connection === 'usb_browser') {
    return sendEscPosViaBrowserUsb({ station, text, copies, open_cash_drawer });
  }

  if (!hasPrinterConfigured(station)) {
    return { ok: false, error: 'Sin impresora configurada en este equipo (IP, COM o Windows)' };
  }

  const n = Math.min(5, Math.max(1, Number(copies ?? cfg.copies ?? 1) || 1));
  const base = getPrintServiceBaseUrl();

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
      return { ok: false, error: explainLocalPrintFetchFailure(base) };
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
