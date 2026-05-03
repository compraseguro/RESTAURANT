/**
 * Mapea la configuración del backend (print-config) al destino QZ Tray.
 * Cocina / Bar / Caja: IP+puerto RAW o nombre de cola Windows.
 *
 * Cómo agregar otra impresora o sede:
 * - En Configuración → Impresoras, cree una fila con la estación (cocina, bar, caja, …),
 *   tipo «Red local» + IP fija + puerto 9100, o tipo USB + nombre exacto de la cola en Windows.
 * - Active «Usar QZ Tray» en el PC que imprime; QZ usa esa IP o ese nombre sin pasar por el navegador.
 * - Por sede: guarde `app_settings` distintos por local o use rutas de impresora en BD si ya las tiene.
 */

import { isThermalLanIp } from '../../utils/networkPrinter';

/**
 * @param {object} stationConfig fila de cocina/bar/caja desde print-config
 * @returns {{ type: 'network', host: string, port: number } | { type: 'spool', name: string } | null}
 */
export function stationConfigToQzPrinter(stationConfig) {
  const c = stationConfig || {};
  const ip = String(c.ip_address || '').trim();
  const port = Math.min(65535, Math.max(1, Number(c.port || 9100) || 9100));
  const local = String(c.local_printer_name || '').trim();
  const pt = String(c.printer_type || 'lan').toLowerCase();

  if (pt === 'usb' && local) {
    return { type: 'spool', name: local };
  }
  if (isThermalLanIp(ip)) {
    return { type: 'network', host: ip, port };
  }
  if (local) {
    return { type: 'spool', name: local };
  }
  return null;
}

/** Objeto para qz.configs.create(printer, options) */
export function toQzCreateArg(descriptor) {
  if (!descriptor) return null;
  if (descriptor.type === 'network') {
    return { host: descriptor.host, port: descriptor.port };
  }
  return descriptor.name;
}
