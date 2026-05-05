/** Texto plano monoespaciado para tickets (ancho tipo rollo 58/80 mm). */

import { formatDateTime, labelDeliveryPaymentModality } from './api';

/** Nota de pedido mesa/salón «para llevar» (POS). Debe coincidir con lo guardado en `orders.notes`. */
export const KITCHEN_TAKEOUT_NOTE = 'PARA LLEVAR';

export function orderHasTakeoutNote(order) {
  return String(order?.notes || '').toUpperCase().includes(KITCHEN_TAKEOUT_NOTE);
}

/** Anchos de carácter típicos para papel 58 mm vs 80 mm. */
export function thermalPaperMetrics(widthMm) {
  const narrow = Number(widthMm) <= 58;
  return {
    clip: narrow ? 32 : 42,
    itemLine: narrow ? 32 : 48,
    nameInQtyRow: narrow ? 24 : 34,
    phoneClip: narrow ? 24 : 32,
  };
}

function wrapThermalLine(text, maxLen) {
  const t = String(text || '').trim();
  if (!t) return [];
  if (t.length <= maxLen) return [t];
  const words = t.split(/\s+/);
  const out = [];
  let cur = '';
  for (const w of words) {
    const piece = cur ? `${cur} ${w}` : w;
    if (piece.length <= maxLen) {
      cur = piece;
      continue;
    }
    if (cur) out.push(cur);
    if (w.length <= maxLen) {
      cur = w;
      continue;
    }
    for (let i = 0; i < w.length; i += maxLen) {
      out.push(w.slice(i, i + maxLen));
    }
    cur = '';
  }
  if (cur) out.push(cur);
  return out;
}

function isCuentaClienteSelfOrder(order) {
  return String(order?.table_number || '') === 'Cliente' && String(order?.customer_id || '').trim() !== '';
}

/**
 * Comanda mínima (reimpresión desde cocina/bar): ubicación, fecha/hora de impresión,
 * «PARA LLEVAR» si aplica (debajo de esa fecha), ítems. Sin nombre del restaurante ni totales.
 */
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildSimpleComandaPlainText(order, printedAt = new Date(), widthMm = 80) {
  const { clip, itemLine } = thermalPaperMetrics(widthMm);
  const lines = [];
  const when = printedAt.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  if (isCuentaClienteSelfOrder(order)) {
    for (const seg of wrapThermalLine(`CLIENTE: ${String(order.customer_name || 'Cliente').trim().toUpperCase()}`, clip)) {
      lines.push(seg);
    }
  } else if (order.type === 'delivery') {
    lines.push('DELIVERY');
  } else if (order.type === 'pickup') {
    lines.push('RECOJO');
  } else {
    const m = order.table_number ? String(order.table_number).trim().toUpperCase() : '';
    lines.push(m ? `MESA ${m}` : 'MESA —');
  }
  lines.push(when);
  if (orderHasTakeoutNote(order)) {
    lines.push(KITCHEN_TAKEOUT_NOTE);
  }
  lines.push('--------------------------------');
  for (const it of order.items || []) {
    const q = Number(it.quantity || 0);
    const nm = String(it.product_name || '').trim() || '—';
    const v = String(it.variant_name || '').trim();
    const raw = `${q}x ${nm}${v ? ` (${v})` : ''}`;
    for (const seg of wrapThermalLine(raw, itemLine)) {
      lines.push(seg);
    }
  }
  return lines.join('\n');
}

/**
 * Misma comanda mínima que {@link buildSimpleComandaPlainText}, en HTML para impresión por navegador:
 * cabecera (mesa / delivery / …) centrada y en mayúsculas, cuerpo con tipografía más grande.
 */
export function buildSimpleComandaPrintHtml(order, printedAt = new Date()) {
  const when = printedAt.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  const itemsHtml = (order.items || [])
    .map((it) => {
      const q = Number(it.quantity || 0);
      const nm = escHtml(String(it.product_name || '').trim() || '—');
      const v = String(it.variant_name || '').trim();
      const vpart = v ? ` (${escHtml(v)})` : '';
      return `<div class="comanda-item">${q}x ${nm}${vpart}</div>`;
    })
    .join('');
  let top = '';
  if (isCuentaClienteSelfOrder(order)) {
    top = `<div class="comanda-top">CLIENTE: ${escHtml(String(order.customer_name || 'Cliente').trim())}</div>`;
  } else if (order.type === 'delivery') {
    top = '<div class="comanda-top">DELIVERY</div>';
  } else if (order.type === 'pickup') {
    top = '<div class="comanda-top">RECOJO</div>';
  } else {
    const m = order.table_number ? String(order.table_number).trim() : '';
    top = `<div class="comanda-top">${m ? `MESA ${escHtml(m.toUpperCase())}` : 'MESA —'}</div>`;
  }
  const paraLlevar = orderHasTakeoutNote(order)
    ? `<div class="comanda-pl">${KITCHEN_TAKEOUT_NOTE}</div>`
    : '';
  return `${top}
    <div class="comanda-fecha">${escHtml(when)}</div>
    ${paraLlevar}
    <div class="comanda-sep">--------------------------------</div>
    ${itemsHtml}`;
}

export function buildKitchenTicketPlainText({
  restaurant = {},
  title = '',
  orders = [],
  copies = 1,
  widthMm = 80,
}) {
  const { clip: clipMax, itemLine, phoneClip } = thermalPaperMetrics(widthMm);
  const clip = (s, n) => String(s || '').slice(0, n ?? clipMax);
  const lines = [];
  lines.push('================================');
  lines.push(clip(restaurant.name || 'Restaurante'));
  if (restaurant.address) lines.push(clip(restaurant.address));
  if (restaurant.phone) lines.push(`Tel: ${clip(restaurant.phone, phoneClip)}`);
  lines.push('--------------------------------');
  lines.push(clip(title));
  lines.push(new Date().toLocaleString('es-PE'));
  lines.push('================================');
  lines.push('');
  (orders || []).forEach((order) => {
    const orderTypeLabel =
      order.type === 'delivery' ? 'Delivery' : order.type === 'pickup' ? 'Recojo' : 'Mesa/Salon';
    if (isCuentaClienteSelfOrder(order)) {
      lines.push(clip(order.customer_name || 'Cliente', clipMax));
      lines.push(`#${order.order_number} ${orderTypeLabel}`);
    } else if (order.type === 'delivery') {
      lines.push('Delivery');
    } else {
      const tbl = order.table_number
        ? ` MESA ${String(order.table_number).trim().toUpperCase()}`
        : '';
      lines.push(`#${order.order_number} ${orderTypeLabel}${tbl}`);
    }
    const fechaPedido = formatDateTime(order.updated_at || order.created_at);
    if (fechaPedido) lines.push(fechaPedido);
    if (orderHasTakeoutNote(order)) {
      lines.push(KITCHEN_TAKEOUT_NOTE);
    }
    (order.items || []).forEach((item) => {
      let line = ` ${item.quantity}x ${item.product_name || ''}`;
      if (item.variant_name) line += ` (${item.variant_name})`;
      if (item.notes) line += ` - ${item.notes}`;
      for (const seg of wrapThermalLine(line.trim(), itemLine)) {
        lines.push(seg);
      }
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

/** Texto plano para precuenta de caja. */
export function buildPrecuentaPlainText({
  restaurantName = '',
  tableName = '',
  userLine = '',
  takeoutLine = '',
  customerLines = [],
  groupedRows = [],
  formatCurrencyFn = (n) => String(n),
  subtotal = 0,
  discount = 0,
  payableTotal = 0,
  widthMm = 80,
}) {
  const { clip: clipDef, nameInQtyRow } = thermalPaperMetrics(widthMm);
  const clip = (s, n) => String(s || '').slice(0, n ?? clipDef);
  const titleTable = Math.max(12, clipDef - 6);
  const lines = [];
  lines.push('================================');
  lines.push(clip(restaurantName));
  lines.push(`PRECUENTA - ${clip(tableName, titleTable)}`);
  lines.push(clip(userLine));
  if (takeoutLine) lines.push(takeoutLine);
  for (const l of customerLines) {
    if (l) lines.push(clip(l));
  }
  lines.push('--------------------------------');
  for (const g of groupedRows) {
    const qty = Number(g.qty || 0);
    const name = String(g.name || '').trim() || '—';
    lines.push(`${qty}x ${clip(name, nameInQtyRow)}`);
    lines.push(`  ${formatCurrencyFn(g.unitPrice != null ? g.unitPrice : 0)}  ${formatCurrencyFn(g.subtotal != null ? g.subtotal : 0)}`);
  }
  lines.push('--------------------------------');
  lines.push(`Subtotal: ${formatCurrencyFn(subtotal)}`);
  lines.push(`Descuento: ${formatCurrencyFn(discount)}`);
  lines.push(`TOTAL A PAGAR: ${formatCurrencyFn(payableTotal)}`);
  lines.push('');
  return lines.join('\n');
}

/** Texto plano para nota de venta. */
export function buildNotaVentaPlainText({
  restaurantName = '',
  docLine = '',
  tableName = '',
  dateLine = '',
  customerLines = [],
  groupedRows = [],
  formatCurrencyFn = (n) => String(n),
  total = 0,
  widthMm = 80,
}) {
  const { clip: clipDef, nameInQtyRow } = thermalPaperMetrics(widthMm);
  const clip = (s, n) => String(s || '').slice(0, n ?? clipDef);
  const lines = [];
  lines.push('================================');
  lines.push(clip(restaurantName));
  lines.push('NOTA DE VENTA');
  if (docLine) lines.push(clip(docLine));
  if (tableName) lines.push(clip(tableName));
  lines.push(clip(dateLine));
  for (const l of customerLines) {
    if (l) lines.push(clip(l));
  }
  lines.push('--------------------------------');
  for (const g of groupedRows) {
    const qty = Number(g.qty || 0);
    const name = String(g.name || '').trim() || '—';
    lines.push(`${qty}x ${clip(name, nameInQtyRow)}`);
    lines.push(`  ${formatCurrencyFn(g.unitPrice != null ? g.unitPrice : 0)}  ${formatCurrencyFn(g.subtotal != null ? g.subtotal : 0)}`);
  }
  lines.push('--------------------------------');
  lines.push(`TOTAL: ${formatCurrencyFn(total)}`);
  lines.push('');
  return lines.join('\n');
}

function orderLinesSummaryShort(order) {
  const items = order?.items || [];
  if (!items.length) return `Pedido #${order?.order_number ?? '—'}`;
  return items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ');
}

/** Reporte de entregas completadas del día (panel delivery). */
export function buildDeliveryReportPlainText({
  dateLabel = '',
  driverName = '',
  orders = [],
  formatCurrencyFn = (n) => String(n),
}) {
  const lines = [];
  lines.push('================================');
  lines.push('REPORTE DELIVERY');
  lines.push(`Fecha: ${String(dateLabel).slice(0, 42)}`);
  if (driverName) lines.push(`Repartidor: ${String(driverName).slice(0, 42)}`);
  lines.push('--------------------------------');
  let sum = 0;
  for (const o of orders || []) {
    sum += Number(o.total || 0);
    const mod = labelDeliveryPaymentModality(o.delivery_payment_modality) || '—';
    lines.push(`#${o.order_number} ${String(o.customer_name || '—').slice(0, 28)}`);
    lines.push(`  ${orderLinesSummaryShort(o).slice(0, 42)}`);
    lines.push(`  ${mod} · ${formatCurrencyFn(o.total || 0)}`);
  }
  lines.push('--------------------------------');
  lines.push(`TOTAL: ${formatCurrencyFn(sum)}`);
  lines.push('');
  return lines.join('\n');
}
