'use strict';

/**
 * Texto plano para comandas (paridad con client/src/utils/ticketPlainText.js — subset usado en servidor).
 */
const KITCHEN_TAKEOUT_NOTE = 'PARA LLEVAR';

function formatDateTime(iso) {
  if (!iso) return '';
  const raw = String(iso).trim();
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function orderHasTakeoutNote(order) {
  return String(order?.notes || '').toUpperCase().includes(KITCHEN_TAKEOUT_NOTE);
}

function isCuentaClienteSelfOrder(order) {
  return String(order?.table_number || '') === 'Cliente' && String(order?.customer_id || '').trim() !== '';
}

function thermalPaperMetrics(widthMm) {
  const narrow = Number(widthMm) <= 58;
  return {
    clip: narrow ? 32 : 42,
    itemLine: narrow ? 32 : 48,
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

function buildKitchenTicketPlainText({ restaurant = {}, title = '', orders = [], copies = 1, widthMm = 80 }) {
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
      const tbl = order.table_number ? ` MESA ${String(order.table_number).trim().toUpperCase()}` : '';
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

module.exports = { buildKitchenTicketPlainText, KITCHEN_TAKEOUT_NOTE };
