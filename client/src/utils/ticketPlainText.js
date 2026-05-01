/** Texto plano para impresoras térmicas por red (ESC/POS vía TCP). */

/** Nota de pedido mesa/salón «para llevar» (POS). Debe coincidir con lo guardado en `orders.notes`. */
export const KITCHEN_TAKEOUT_NOTE = 'PARA LLEVAR';

export function orderHasTakeoutNote(order) {
  return String(order?.notes || '').toUpperCase().includes(KITCHEN_TAKEOUT_NOTE);
}

function isCuentaClienteSelfOrder(order) {
  return String(order?.table_number || '') === 'Cliente' && String(order?.customer_id || '').trim() !== '';
}

/**
 * Comanda mínima (reimpresión desde cocina/bar): solo ubicación, fecha/hora de impresión e ítems.
 * Sin nombre del restaurante, totales ni notas extendidas.
 */
export function buildSimpleComandaPlainText(order, printedAt = new Date()) {
  const lines = [];
  const when = printedAt.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  if (isCuentaClienteSelfOrder(order)) {
    lines.push(`Cliente: ${String(order.customer_name || 'Cliente').trim()}`);
  } else if (order.type === 'delivery') {
    lines.push('Delivery');
  } else if (order.type === 'pickup') {
    lines.push('Recojo');
  } else {
    lines.push(order.table_number ? `Mesa ${order.table_number}` : 'Mesa —');
  }
  lines.push(when);
  lines.push('--------------------------------');
  for (const it of order.items || []) {
    const q = Number(it.quantity || 0);
    const nm = String(it.product_name || '').trim() || '—';
    const v = String(it.variant_name || '').trim();
    lines.push(`${q}x ${nm}${v ? ` (${v})` : ''}`);
  }
  return lines.join('\n');
}

export function buildKitchenTicketPlainText({
  restaurant = {},
  title = '',
  orders = [],
  copies = 1,
}) {
  const lines = [];
  const clip = (s, n = 42) => String(s || '').slice(0, n);
  lines.push('================================');
  lines.push(clip(restaurant.name || 'Restaurante'));
  if (restaurant.address) lines.push(clip(restaurant.address));
  if (restaurant.phone) lines.push(`Tel: ${clip(restaurant.phone, 32)}`);
  lines.push('--------------------------------');
  lines.push(clip(title));
  lines.push(new Date().toLocaleString('es-PE'));
  lines.push('================================');
  lines.push('');
  (orders || []).forEach((order) => {
    if (orderHasTakeoutNote(order)) {
      lines.push(KITCHEN_TAKEOUT_NOTE);
      lines.push('--------------------------------');
    }
    const orderTypeLabel =
      order.type === 'delivery' ? 'Delivery' : order.type === 'pickup' ? 'Recojo' : 'Mesa/Salon';
    if (isCuentaClienteSelfOrder(order)) {
      lines.push(clip(order.customer_name || 'Cliente', 42));
      lines.push(`#${order.order_number} ${orderTypeLabel}`);
    } else if (order.type === 'delivery') {
      lines.push('Delivery');
    } else {
      const tbl = order.table_number ? ` Mesa ${order.table_number}` : '';
      lines.push(`#${order.order_number} ${orderTypeLabel}${tbl}`);
    }
    (order.items || []).forEach((item) => {
      let line = ` ${item.quantity}x ${item.product_name || ''}`;
      if (item.variant_name) line += ` (${item.variant_name})`;
      if (item.notes) line += ` - ${item.notes}`;
      lines.push(line.slice(0, 48));
    });
    lines.push('');
    lines.push('--------------------------------');
  });
  lines.push('');
  lines.push('');
  const nc = Math.min(5, Math.max(1, Number(copies || 1)));
  const blocks = [];
  for (let c = 0; c < nc; c += 1) {
    if (nc > 1) blocks.push(`--- Copia ${c + 1} de ${nc} ---`);
    blocks.push(...lines);
  }
  return blocks.join('\n');
}
