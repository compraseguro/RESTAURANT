/**
 * Texto plano comanda cocina/bar (misma estructura que el cliente).
 * Duplicado mínimo en CommonJS para impresión automática en el servidor Node.
 */

const KITCHEN_TAKEOUT_NOTE = 'PARA LLEVAR';
const thermalLayout = require('./thermalPrintLayout.json');

function thermalCharWidth(widthMm) {
  const n = Number(widthMm);
  const cl = thermalLayout.charsPerLine;
  if (!Number.isFinite(n) || n <= 0) return Number(cl['80']) || 54;
  if (n <= 58) return Number(cl['58']) || 32;
  if (n <= 75) return Number(cl['75']) || 48;
  return Number(cl['80']) || 54;
}

function padLeftRight(left, right, width) {
  const fallback = Number(thermalLayout.charsPerLine['80']) || 54;
  const w = Math.max(8, Number(width) || fallback);
  const L = String(left ?? '');
  const R = String(right ?? '');
  const space = w - L.length - R.length;
  if (space >= 1) return `${L}${' '.repeat(space)}${R}`;
  const maxR = Math.min(R.length, Math.floor(w / 2));
  const maxL = w - maxR - 1;
  return `${L.slice(0, maxL)} ${R.slice(R.length - maxR)}`;
}

function centerThermalLine(text, width) {
  const fallback = Number(thermalLayout.charsPerLine['80']) || 54;
  const w = Math.max(8, Number(width) || fallback);
  const s = String(text || '').trim();
  if (!s) return '';
  if (s.length >= w) return s.slice(0, w);
  const pad = Math.floor((w - s.length) / 2);
  return `${' '.repeat(pad)}${s}`;
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

function orderHasTakeoutNote(order) {
  return String(order?.notes || '').toUpperCase().includes(KITCHEN_TAKEOUT_NOTE);
}

function peParts(d) {
  const date = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date, time };
}

/**
 * @param {object} order
 * @param {object[]} items — ítems ya filtrados (cocina o bar)
 * @param {number} widthMm
 */
function buildPedidoMesaTicketPlainTextServer(order, items, widthMm = 80) {
  const w = thermalCharWidth(widthMm);
  const lines = [];
  const printedAt = new Date();
  lines.push(centerThermalLine('PEDIDO MESA', w));
  const { date, time } = peParts(printedAt);
  lines.push(padLeftRight(`Fecha: ${date}`, `Hora: ${time}`, w));
  lines.push(orderHasTakeoutNote(order) ? 'PARA LLEVAR: SÍ' : 'PARA LLEVAR: NO');
  const waiter = String(order?.created_by_user_name || '').trim();
  if (waiter) lines.push(`Mozo: ${waiter.slice(0, w)}`);
  if (order?.order_number != null && order?.order_number !== '') lines.push(`Pedido: #${order.order_number}`);
  const tableLbl =
    order?.type === 'dine_in' && order?.table_number
      ? `Mesa ${String(order.table_number).trim()}`
      : String(order?.table_number || '').trim();
  if (tableLbl) lines.push(`Ubicación: ${tableLbl.slice(0, w)}`);
  lines.push('-'.repeat(w));
  lines.push('DETALLE');
  for (const it of items || []) {
    const q = Number(it.quantity || it.qty || 0) || 1;
    const nm = String(it.product_name || it.name || '—').trim() || '—';
    const v = String(it.variant_name || '').trim();
    const title = v ? `${q}  ${nm} (${v})` : `${q}  ${nm}`;
    for (const seg of wrapThermalLine(title, w)) lines.push(seg);
    const noteBits = [];
    const rawNotes = String(it.notes || '').trim();
    if (rawNotes) {
      rawNotes.split(' | ').map((x) => x.trim()).filter(Boolean).forEach((p) => noteBits.push(p));
    }
    const modOpt = String(it.modifier_option || '').trim();
    if (modOpt) noteBits.push(`Modificador: ${modOpt}`);
    if (noteBits.length) {
      lines.push('  Detalles:');
      for (const b of noteBits) {
        for (const seg of wrapThermalLine(`  · ${b}`, w)) lines.push(seg);
      }
    }
    lines.push('');
  }
  lines.push('-'.repeat(w));
  lines.push('');
  return lines.join('\n');
}

module.exports = { buildPedidoMesaTicketPlainTextServer };
