import { executePrint } from '../services/printBridge';

/**
 * Envío térmico vía Print Bridge del servidor (`/api/printing/print`).
 * @param {{ station: string, text: string, copies?: number, open_cash_drawer?: boolean, width_mm?: number }} opts
 * @returns {Promise<{ ok: boolean, via?: string, error?: string }>}
 */
export async function sendEscPosToStation({ station, text, copies, open_cash_drawer = false, width_mm }) {
  const plain = String(text || '').trim();
  if (!plain) return { ok: false, error: 'Vacío' };
  try {
    const data = await executePrint({
      station,
      text: plain,
      copies,
      openCashDrawer: Boolean(open_cash_drawer),
      widthMm: width_mm,
    });
    return { ok: true, via: data?.via || 'print-bridge' };
  } catch (e) {
    return { ok: false, error: e?.message || 'Error de impresión' };
  }
}

export async function sendEscPosToCaja(opts) {
  const { text, copies, open_cash_drawer, width_mm } = opts;
  return sendEscPosToStation({ station: 'caja', text, copies, open_cash_drawer, width_mm });
}
