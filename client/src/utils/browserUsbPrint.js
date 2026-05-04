import { getStationPrinterConfig, setStationPrinterConfig } from './localPrinterStorage';
import { buildEscPosUint8Array } from './escposBrowser';

export function isWebUsbSerialSupported() {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

async function pickGrantedPort(station) {
  const cfg = getStationPrinterConfig(station);
  const ports = await navigator.serial.getPorts();
  if (!ports.length) return null;
  const v = cfg.browser_usb_vendor_id;
  const p = cfg.browser_usb_product_id;
  if (v != null && p != null) {
    for (const port of ports) {
      const i = port.getInfo();
      if (i.usbVendorId === v && i.usbProductId === p) return port;
    }
  }
  return ports.length === 1 ? ports[0] : ports[0];
}

async function openSerialPort(port, baud) {
  if (port.writable) return;
  await port.open({ baudRate: baud });
}

/**
 * Empareja la térmica USB con este origen (PWA / Chrome / Edge). Requiere clic del usuario.
 */
export async function pairBrowserUsbPrinter(station) {
  if (!isWebUsbSerialSupported()) {
    return { ok: false, error: 'Use Chrome o Edge e instale la app desde el menú del navegador para imprimir por USB.' };
  }
  try {
    const cfg = getStationPrinterConfig(station);
    const baud = Math.min(921600, Math.max(1200, Number(cfg.baud_rate || 9600) || 9600));
    const port = await navigator.serial.requestPort({ filters: [] });
    await openSerialPort(port, baud);
    const info = port.getInfo();
    try {
      await port.close();
    } catch {
      /* */
    }
    setStationPrinterConfig(station, {
      ...cfg,
      connection: 'usb_browser',
      browser_usb_paired: 1,
      browser_usb_vendor_id: info.usbVendorId ?? null,
      browser_usb_product_id: info.usbProductId ?? null,
    });
    return { ok: true };
  } catch (e) {
    if (e?.name === 'NotFoundError') return { ok: false, error: 'Selección cancelada' };
    return { ok: false, error: e?.message || 'No se pudo vincular el puerto USB' };
  }
}

/**
 * Impresión directa por Web Serial (sin microservicio). Tras vincular, no pide puerto en cada ticket.
 */
export async function sendEscPosViaBrowserUsb({ station, text, copies, open_cash_drawer = false }) {
  if (!isWebUsbSerialSupported()) {
    return { ok: false, error: 'Web Serial no disponible en este navegador' };
  }
  const plain = String(text || '').trim();
  if (!plain) return { ok: false, error: 'Vacío' };

  const cfg = getStationPrinterConfig(station);
  const n = Math.min(5, Math.max(1, Number(copies ?? cfg.copies ?? 1) || 1));
  const payload = buildEscPosUint8Array(plain, n, cfg.width_mm, { open_cash_drawer: Boolean(open_cash_drawer) });
  const baud = Math.min(921600, Math.max(1200, Number(cfg.baud_rate || 9600) || 9600));

  let port = await pickGrantedPort(station);
  if (!port) {
    try {
      port = await navigator.serial.requestPort({ filters: [] });
      const info = port.getInfo();
      setStationPrinterConfig(station, {
        ...getStationPrinterConfig(station),
        connection: 'usb_browser',
        browser_usb_paired: 1,
        browser_usb_vendor_id: info.usbVendorId ?? null,
        browser_usb_product_id: info.usbProductId ?? null,
      });
    } catch (e) {
      if (e?.name === 'NotFoundError') {
        return { ok: false, error: 'Conceda el puerto USB o vincule la impresora en el panel Impresora.' };
      }
      return { ok: false, error: e?.message || 'Puerto USB no disponible' };
    }
  }

  try {
    await openSerialPort(port, baud);
    const writer = port.writable.getWriter();
    try {
      await writer.write(payload);
    } finally {
      writer.releaseLock();
    }
    await port.close();
    return { ok: true, via: 'web-serial' };
  } catch (e) {
    try {
      await port.close();
    } catch {
      /* */
    }
    return { ok: false, error: e?.message || 'Error al enviar por USB' };
  }
}
