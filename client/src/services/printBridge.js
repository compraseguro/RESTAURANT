import { api } from '../utils/api';

/**
 * Puente de impresión vía API interna (`/api/printing`).
 * La ejecución física ocurre en el proceso Node del servidor (Windows típico en producción local).
 */

export async function fetchPrintConfig() {
  return api.get('/printing/config');
}

export async function savePrintConfig(partial) {
  return api.put('/printing/config', partial);
}

export async function fetchUsbPrinters() {
  return api.get('/printing/usb-printers');
}

export async function scanNetworkPrinters(body = {}) {
  return api.post('/printing/scan-network', body);
}

/**
 * @param {{ station: string, text?: string, orderId?: string, copies?: number, openCashDrawer?: boolean, widthMm?: number }} payload
 */
export async function executePrint(payload) {
  return api.post('/printing/print', payload);
}

export async function printKitchen(order) {
  return executePrint({ station: 'cocina', orderId: order?.id });
}

export async function printBar(order) {
  return executePrint({ station: 'bar', orderId: order?.id });
}

export async function printPreBill(text, opts = {}) {
  return executePrint({ station: 'caja', text, copies: opts.copies, widthMm: opts.widthMm });
}

export async function printReceipt(text, opts = {}) {
  return executePrint({ station: 'caja', text, copies: opts.copies, widthMm: opts.widthMm, openCashDrawer: opts.openCashDrawer });
}

/** Preferencias de ancho/copias guardadas en el servidor para una estación. */
export async function getStationPrintPrefs(station = 'caja') {
  try {
    const cfg = await fetchPrintConfig();
    const s = cfg[station] || {};
    return {
      widthMm: [58, 80].includes(Number(s.widthMm)) ? Number(s.widthMm) : 80,
      copies: Math.min(5, Math.max(1, Number(s.copies || 1))),
    };
  } catch {
    return { widthMm: 80, copies: 1 };
  }
}
