/**
 * Texto plano para comandas (equivalente a buildSimpleComandaPlainText del cliente).
 */

const KITCHEN_TAKEOUT_NOTE = 'PARA LLEVAR';

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

function buildSimpleComandaPlainText(order, printedAt = new Date(), widthMm = 80) {
  const { clip, itemLine } = thermalPaperMetrics(widthMm);
  const lines = [];
  const when = printedAt.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  if (isCuentaClienteSelfOrder(order)) {
    for (const seg of wrapThermalLine(
      `CLIENTE: ${String(order.customer_name || 'Cliente').trim().toUpperCase()}`,
      clip
    )) {
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

module.exports = { buildSimpleComandaPlainText, orderHasTakeoutNote, KITCHEN_TAKEOUT_NOTE };
