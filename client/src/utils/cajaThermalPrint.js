import { getPrintServiceBaseUrl, getStationPrinterConfig, hasPrinterIp } from './localPrinterStorage';

/**
 * Envía texto plano del ticket al microservicio local; allí se convierte a ESC/POS y se envía por TCP a la IP.
 * @param {{ station: string, text: string, copies?: number, open_cash_drawer?: boolean }} opts
 * @returns {Promise<{ ok: boolean, via?: string, error?: string }>}
 */
export async function sendEscPosToStation({ station, text, copies, open_cash_drawer = false }) {
  const plain = String(text || '').trim();
  if (!plain) return { ok: false, error: 'Vacío' };
  if (!hasPrinterIp(station)) return { ok: false, error: 'Sin IP de impresora en este equipo' };

  const cfg = getStationPrinterConfig(station);
  const n = Math.min(5, Math.max(1, Number(copies ?? cfg.copies ?? 1) || 1));
  const base = getPrintServiceBaseUrl();

  try {
    const res = await fetch(`${base}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: cfg.ip,
        port: cfg.port,
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
    return { ok: true, via: 'local-print-service' };
  } catch (e) {
    return { ok: false, error: e?.message || 'No se alcanzó el servicio local (¿está en ejecución?)' };
  }
}

/**
 * @param {{ text: string, copies?: number, open_cash_drawer?: boolean }} opts
 */
export async function sendEscPosToCaja(opts) {
  const { text, copies, open_cash_drawer } = opts;
  return sendEscPosToStation({ station: 'caja', text, copies, open_cash_drawer });
}
