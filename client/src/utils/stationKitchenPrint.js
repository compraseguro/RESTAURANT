import { buildKitchenTicketPlainText } from './ticketPlainText';
import { sendEscPosToStation } from './cajaThermalPrint';

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
 * Tras crear o actualizar pedido desde POS: imprime en cocina y/o bar según ítems y `auto_print` de cada estación.
 * Silencioso (sin diálogo del navegador): solo red vía API o agente local.
 */
export async function silentPrintOrderToStations({ api, order, labelPrefix = 'Pedido' }) {
  if (!order?.items?.length) return;
  let cfg;
  try {
    cfg = await api.get('/orders/print-config');
  } catch {
    return;
  }
  const printers = cfg?.printers || {};
  const restaurant = cfg?.restaurant || { name: 'Resto-FADEY', address: '', phone: '' };
  const printAgent = cfg?.print_agent || {};

  for (const station of ['cocina', 'bar']) {
    if (!orderAppliesToStation(order, station)) continue;
    const stationConfig = printers[station];
    if (Number(stationConfig?.auto_print ?? 1) === 0) continue;
    const title = `${station === 'bar' ? 'Comandas de Bar' : 'Comandas de Cocina'} · ${labelPrefix} · #${order.order_number}`;
    const plain = buildKitchenTicketPlainText({
      restaurant,
      title,
      orders: [order],
      copies: 1,
    });
    const copies = Math.min(5, Math.max(1, Number(stationConfig?.copies || 1)));
    await sendEscPosToStation({
      api,
      station,
      stationConfig,
      printAgent,
      text: plain,
      copies,
    });
  }
}
