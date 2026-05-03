import { shouldTryServerNetworkPrint, isThermalLanIp, hasThermalDestination } from './networkPrinter';
import { postLocalAgentPrint, isLocalPrintAgentConfigured } from './localPrintAgent';
import { isQzTrayEnabled, printEscPosWithQz } from '../services/printing/qzService';

/**
 * Envía texto ESC/POS a la estación indicada: API (TCP) o print-agent (LAN/USB).
 * @param {{ api: object, station: string, stationConfig: object, printAgent: object, text: string, copies?: number, skipQz?: boolean }} opts
 * @returns {Promise<{ ok: boolean, via?: string }>}
 */
export async function sendEscPosToStation({ api, station, stationConfig, printAgent, text, copies, skipQz = false }) {
  const c = stationConfig || {};
  const n = Math.min(5, Math.max(1, Number(copies ?? c.copies ?? 1) || 1));
  const plain = String(text || '').trim();
  if (!plain) return { ok: false };

  if (!skipQz && isQzTrayEnabled(printAgent) && hasThermalDestination(c)) {
    try {
      await printEscPosWithQz({ stationConfig: c, text: plain, copies: n });
      return { ok: true, via: 'qz' };
    } catch (err) {
      console.warn('[impresión] QZ Tray falló; se intentará servidor o print-agent:', err?.message || err);
    }
  }

  if (shouldTryServerNetworkPrint(c)) {
    try {
      await api.post('/orders/print-network', { station, text: plain, copies: n });
      return { ok: true, via: 'network' };
    } catch {
      /* siguiente */
    }
  }
  const ipRaw = String(c.ip_address || '').trim();
  const localName = String(c.local_printer_name || '').trim();
  const pt = String(c.printer_type || 'lan').toLowerCase();
  const usableLanIp = isThermalLanIp(ipRaw) ? ipRaw : '';

  if (isLocalPrintAgentConfigured(printAgent) && (usableLanIp || localName)) {
    try {
      let mode;
      let ipForAgent = usableLanIp || undefined;
      if (pt === 'usb') {
        mode = 'usb';
        ipForAgent = undefined;
      } else if (usableLanIp && localName) {
        mode = 'lan';
      } else if (usableLanIp) {
        mode = 'lan';
      } else if (localName) {
        mode = 'usb';
      }
      const widthMm = [58, 80].includes(Number(c.width_mm)) ? Number(c.width_mm) : undefined;
      await postLocalAgentPrint(printAgent, {
        area: station,
        ticket: plain,
        printer: localName || undefined,
        ip_address: ipForAgent,
        port: c.port || 9100,
        copies: n,
        mode,
        paper_width_mm: widthMm,
      });
      return { ok: true, via: 'agent' };
    } catch {
      /* */
    }
  }
  return { ok: false };
}

/**
 * @returns {Promise<{ ok: boolean, via?: string }>}
 */
export async function sendEscPosToCaja(opts) {
  const { cajaConfig, stationConfig, ...rest } = opts;
  return sendEscPosToStation({
    ...rest,
    station: 'caja',
    stationConfig: stationConfig ?? cajaConfig,
  });
}
