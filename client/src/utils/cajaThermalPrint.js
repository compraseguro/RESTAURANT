import { shouldTryServerNetworkPrint, isThermalLanIp } from './networkPrinter';
import { postLocalAgentPrint, isLocalPrintAgentConfigured } from './localPrintAgent';

/**
 * Envía texto ESC/POS a la estación indicada: API (TCP) o print-agent (LAN/USB).
 * @param {{ api: object, station: string, stationConfig: object, printAgent: object, text: string, copies?: number }} opts
 * @returns {Promise<{ ok: boolean, via?: string }>}
 */
export async function sendEscPosToStation({ api, station, stationConfig, printAgent, text, copies }) {
  const c = stationConfig || {};
  const n = Math.min(5, Math.max(1, Number(copies ?? c.copies ?? 1) || 1));
  const plain = String(text || '').trim();
  if (!plain) return { ok: false };
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
      await postLocalAgentPrint(printAgent.base_url, {
        area: station,
        ticket: plain,
        printer: localName || undefined,
        ip_address: ipForAgent,
        port: c.port || 9100,
        copies: n,
        mode,
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
  return sendEscPosToStation({ ...opts, station: 'caja' });
}
