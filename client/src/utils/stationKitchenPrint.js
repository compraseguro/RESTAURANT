import { buildKitchenTicketPlainText } from './ticketPlainText';
import { sendEscPosToStation } from './cajaThermalPrint';
import { dedupeThermalAutoPrintJob } from './thermalPrintDedupe';
import { getStationPrinterConfig, hasPrinterConfigured, isBrowserUsbPaired } from './localPrinterStorage';

/** Misma lógica que el servidor / panel cocina para repartir ítems entre bar y cocina. */
export function isBarItemForStation(item) {
  if (String(item?.production_area || '').toLowerCase() === 'bar') return true;
  const name = String(item?.product_name || '').toLowerCase();
  return ['bar', 'bebida', 'bebidas', 'trago', 'tragos', 'coctel', 'cocteles', 'cocktail', 'cocktails'].some((t) =>
    name.includes(t)
  );
}

export function isBarOnlyOrder(order) {
  const items = order?.items || [];
  if (!items.length) return false;
  return items.every(isBarItemForStation);
}

/** @param {'cocina'|'bar'} station */
export function orderAppliesToStation(order, station) {
  const barOnly = isBarOnlyOrder(order);
  if (station === 'bar') return barOnly;
  if (station === 'cocina') return !barOnly;
  return true;
}

/**
 * Tras crear o actualizar pedido desde POS: imprime en cocina y/o bar según ítems y opción local auto_print.
 */
export async function silentPrintOrderToStations({ api, order, labelPrefix = 'Pedido' }) {
  if (!order?.items?.length) return;
  let restaurant = { name: 'Resto-FADEY', address: '', phone: '' };
  try {
    const cfg = await api.get('/orders/print-config');
    restaurant = cfg?.restaurant || restaurant;
  } catch {
    return;
  }

  for (const station of ['cocina', 'bar']) {
    if (!orderAppliesToStation(order, station)) continue;
    const local = getStationPrinterConfig(station);
    if (Number(local.auto_print) === 0) continue;
    if (!hasPrinterConfigured(station)) continue;
    if (local.connection === 'usb_browser' && !isBrowserUsbPaired(station)) continue;

    const widthMm = [58, 80].includes(Number(local.width_mm)) ? Number(local.width_mm) : 80;
    const title = `${station === 'bar' ? 'Comandas de Bar' : 'Comandas de Cocina'} · ${labelPrefix} · #${order.order_number}`;
    const copies = Math.min(5, Math.max(1, Number(local.copies || 1)));
    await dedupeThermalAutoPrintJob(station, order, async () => {
      const plain = buildKitchenTicketPlainText({
        restaurant,
        title,
        orders: [order],
        copies: 1,
        widthMm,
      });
      return sendEscPosToStation({ station, text: plain, copies });
    });
  }
}
