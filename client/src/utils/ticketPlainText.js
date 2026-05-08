/** Texto plano monoespaciado para tickets (ancho tipo rollo 58/75/80 mm). */

import { formatDateTime, formatPeDateTimeParts, labelDeliveryPaymentModality } from './api';
import thermalLayout from '@thermalPrintLayout';

function defaultThermalPrintWidthChars() {
  return Number(thermalLayout.charsPerLine['80']) || 54;
}

/** Indica si el bundle JS actual incluye el layout térmico (diagnosticar caché de Vercel/navegador). */
export function getThermalPrintRevision() {
  return String(thermalLayout?.revision || '');
}

/** Nota de pedido mesa/salón «para llevar» (POS). Debe coincidir con lo guardado en `orders.notes`. */
export const KITCHEN_TAKEOUT_NOTE = 'PARA LLEVAR';

export function orderHasTakeoutNote(order) {
  return String(order?.notes || '').toUpperCase().includes(KITCHEN_TAKEOUT_NOTE);
}

/** Anchos de carácter típicos para papel 58 mm vs 80 mm. */
export function thermalPaperMetrics(widthMm) {
  const n = Number(widthMm);
  const narrow = n <= 58;
  const medium = n > 58 && n <= 75;
  const wideChars = thermalCharWidth(widthMm);
  return {
    clip: narrow ? 32 : medium ? 38 : 42,
    itemLine: narrow ? 32 : wideChars,
    nameInQtyRow: narrow ? 24 : medium ? 30 : 34,
    phoneClip: narrow ? 24 : medium ? 28 : 32,
  };
}

/** Ancho en caracteres (misma fuente que `server/printing/thermalPrintLayout.json` + escposBuilder). */
export function thermalCharWidth(widthMm) {
  const n = Number(widthMm);
  const cl = thermalLayout.charsPerLine;
  if (!Number.isFinite(n) || n <= 0) return Number(cl['80']) || 54;
  if (n <= 58) return Number(cl['58']) || 32;
  if (n <= 75) return Number(cl['75']) || 48;
  return Number(cl['80']) || 54;
}

/** Alinea `izq` y `der` en una sola línea de ancho fijo. */
export function padLeftRight(left, right, width) {
  const w = Math.max(8, Number(width) || defaultThermalPrintWidthChars());
  const L = String(left ?? '');
  const R = String(right ?? '');
  const space = w - L.length - R.length;
  if (space >= 1) return `${L}${' '.repeat(space)}${R}`;
  const maxR = Math.min(R.length, Math.floor(w / 2));
  const maxL = w - maxR - 1;
  return `${L.slice(0, maxL)} ${R.slice(R.length - maxR)}`;
}

export function centerThermalLine(text, width) {
  const w = Math.max(8, Number(width) || defaultThermalPrintWidthChars());
  const s = String(text || '').trim();
  if (!s) return '';
  if (s.length >= w) return s.slice(0, w);
  const pad = Math.floor((w - s.length) / 2);
  return `${' '.repeat(pad)}${s}`;
}

/** Quita pies que no deben imprimirse (p. ej. «Modulo: caja»). */
export function stripThermalDebugFooter(text) {
  let s = String(text || '')
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  s = s.replace(/\s*m[oó]dulo\s*:\s*[a-záéíóúñ0-9_-]+\b/gi, '');
  s = s.replace(/\n\d{1,2}\/\d{1,2}\/\d{4},\s*\d{1,2}:\d{2}:\d{2}\s*[ap]\.?\s*m\.?\s*$/i, '');
  return s
    .split('\n')
    .map((line) => line.replace(/\uFEFF/g, '').trimEnd())
    .filter((line) => {
      const t = String(line || '').trim();
      if (!t) return true;
      if (/^m[oó]dulo\b/i.test(t)) return false;
      if (/^module\s*:/i.test(t)) return false;
      return true;
    })
    .join('\n');
}

function moneyAmountStr(formatted) {
  return String(formatted || '')
    .replace(/^\s*S\/?\s*/i, '')
    .trim();
}

function padCenterStr(str, width) {
  const s = String(str);
  const w = Math.max(1, Number(width) || 1);
  if (s.length >= w) return s.slice(0, w);
  const pad = w - s.length;
  const left = Math.floor(pad / 2);
  return `${' '.repeat(left)}${s}${' '.repeat(pad - left)}`;
}

/**
 * Marca principal del ticket: «Nombre del Restaurante» (Mi empresa),
 * si no hay, nombre comercial de facturación.
 */
export function restaurantDisplayNameUpper(restaurant = {}) {
  const r = restaurant || {};
  const name = String(r.name || '').trim()
    || String(r.billing_nombre_comercial || '').trim()
    || '';
  return name ? name.toUpperCase() : '';
}

function pipedTableDims(wch) {
  const w = Math.max(24, Number(wch) || defaultThermalPrintWidthChars());
  const pipeCount = 5;
  const inner = w - pipeCount;
  let nameW;
  let qW;
  let uW;
  let tW;
  if (w <= 34) {
    qW = 3;
    uW = 5;
    tW = 6;
    nameW = inner - qW - uW - tW;
  } else {
    qW = 5;
    uW = 8;
    tW = 10;
    nameW = inner - qW - uW - tW;
  }
  if (nameW < 6) {
    nameW = 6;
    tW = Math.max(4, inner - nameW - qW - uW);
  }
  return { nameW, qW, uW, tW, w };
}

function pipedDataRow(c0, c1, c2, c3, dims) {
  const { nameW, qW, uW, tW, w } = dims;
  const a = String(c0).slice(0, nameW).padEnd(nameW);
  const b = padCenterStr(String(c1), qW);
  const c = String(c2).padStart(uW);
  const d = String(c3).padStart(tW);
  return `|${a}|${b}|${c}|${d}|`.slice(0, w);
}

export function pushProductTableSection(lines, groupedRows, formatCurrencyFn, widthMm) {
  const dims = pipedTableDims(thermalCharWidth(widthMm));
  const { nameW, w } = dims;

  lines.push('PRODUCTOS');
  lines.push('-'.repeat(w));
  const h0 = w <= 34 ? 'Prod' : 'Producto';
  const h1 = w <= 34 ? 'Cant' : 'Cant';
  const h2 = w <= 34 ? 'P.u' : 'P. u.';
  const h3 = w <= 34 ? 'Tot' : 'Total';
  lines.push(pipedDataRow(h0, h1, h2, h3, dims));
  lines.push('-'.repeat(w));

  for (const g of groupedRows || []) {
    const qty = Number(g.qty || 0);
    const nm = String(g.name || '').trim() || '—';
    const unit = g.unitPrice != null ? Number(g.unitPrice) : qty > 0 ? Number(g.subtotal || 0) / qty : 0;
    const sub = Number(g.subtotal != null ? g.subtotal : unit * qty);
    const uStr = moneyAmountStr(formatCurrencyFn(unit));
    const tStr = moneyAmountStr(formatCurrencyFn(sub));
    const segs = wrapThermalLine(nm, nameW);
    segs.forEach((seg, i) => {
      if (i === 0) {
        lines.push(pipedDataRow(seg, qty, uStr, tStr, dims));
      } else {
        lines.push(pipedDataRow(seg, '', '', '', dims));
      }
    });
  }
}

/** Líneas de cabecera: Mi Restaurante (información) + emisor SUNAT si existe (GET /restaurant). */
export function buildRestaurantTicketHeaderLines(restaurant = {}, widthMm = 80) {
  const w = thermalCharWidth(widthMm);
  const r = restaurant || {};
  const brand =
    String(r.billing_nombre_comercial || '').trim()
    || String(r.name || '').trim()
    || 'RESTAURANTE';
  const legal = String(r.legal_name || '').trim();
  const ruc = String(r.company_ruc || '').trim();
  const addr =
    String(r.billing_emisor_direccion || '').trim()
    || String(r.address || '').trim();
  const phone = String(r.phone || '').trim();
  const email = String(r.email || '').trim();
  const lines = [];
  lines.push(centerThermalLine(brand.toUpperCase(), w));
  if (legal) {
    for (const seg of wrapThermalLine(`Razón social: ${legal}`, w)) lines.push(seg);
  }
  if (ruc) lines.push(`RUC: ${ruc}`.slice(0, w));
  if (addr) {
    for (const seg of wrapThermalLine(`Dirección: ${addr}`, w)) lines.push(seg);
  }
  if (phone) {
    for (const seg of wrapThermalLine(`Tel: ${phone}`, w)) lines.push(seg);
  }
  if (email) {
    for (const seg of wrapThermalLine(`Correo: ${email}`, w)) lines.push(seg);
  }
  lines.push('-'.repeat(w));
  return lines;
}

function paymentCheckboxRows(paymentMethod, width) {
  const pm = String(paymentMethod || 'efectivo').toLowerCase().trim();
  const mk = (on) => (on ? '[X]' : '[ ]');
  const e = `${mk(pm === 'efectivo')} Efectivo`;
  const y = `${mk(pm === 'yape' || pm === 'plin')} Yape/Plin`;
  const tr = `${mk(pm === 'transferencia')} Transferencia`;
  const cr = `${mk(pm === 'tarjeta' || pm === 'online')} Crédito`;
  const w = Math.max(8, Number(width) || defaultThermalPrintWidthChars());
  const half = Math.floor(w / 2);
  const row1 = `${e.padEnd(half)}${y}`.slice(0, w);
  const row2 = `${tr.padEnd(half)}${cr}`.slice(0, w);
  return [row1, row2];
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
  restaurant = {},
  tableName = '',
  mozoName = '',
  takeoutLine = '',
  customerLines = [],
  groupedRows = [],
  formatCurrencyFn = (n) => String(n),
  subtotal = 0,
  discount = 0,
  payableTotal = 0,
  widthMm = 80,
  printedAt = new Date(),
}) {
  const w = thermalCharWidth(widthMm);
  const lines = [];
  /**
   * Cartel de precuenta: nombre comercial SUNAT si existe; si no, nombre del local («Mi restaurante»).
   * No usar otro fallback inventado para que coincida con lo configurado en la app.
   */
  const hasThermalLogo = String(restaurant?.logo || '').trim();
  const tradeRaw = String(
    restaurant?.billing_nombre_comercial || restaurant?.name || '',
  )
    .trim()
    .replace(/^@+\s*/u, '');
  const trade = tradeRaw ? tradeRaw.toUpperCase() : '';
  if (!hasThermalLogo && trade) {
    lines.push(centerThermalLine(trade, w));
    lines.push('-'.repeat(w));
  }
  lines.push(centerThermalLine('PRE CUENTA', w));
  const { date, time } = formatPeDateTimeParts(printedAt);
  lines.push(padLeftRight(`Fecha: ${date}`, `Hora: ${time}`, w));
  const mesaLbl = tableName ? `Mesa: ${tableName}` : 'Mesa: —';
  const mozoLbl = mozoName ? `Mozo: ${mozoName}` : 'Mozo: —';
  lines.push(padLeftRight(mesaLbl, mozoLbl, w));
  if (takeoutLine) lines.push(takeoutLine);
  for (const l of customerLines) {
    if (l) lines.push(String(l).slice(0, w));
  }
  lines.push('-'.repeat(w));
  pushProductTableSection(lines, groupedRows, formatCurrencyFn, widthMm);
  lines.push('-'.repeat(w));
  lines.push(padLeftRight('Subtotal:', formatCurrencyFn(subtotal), w));
  lines.push(padLeftRight('Descuento:', formatCurrencyFn(discount), w));
  lines.push(padLeftRight('TOTAL A PAGAR:', formatCurrencyFn(payableTotal), w));
  lines.push('-'.repeat(w));
  lines.push(centerThermalLine('¡Gracias por preferirnos!', w));
  lines.push('');
  return stripThermalDebugFooter(lines.join('\n'));
}

/** Texto plano para nota de venta. */
export function buildNotaVentaPlainText({
  restaurant = {},
  docLine = '',
  tableName = '',
  customerLines = [],
  groupedRows = [],
  formatCurrencyFn = (n) => String(n),
  subtotal = null,
  total = 0,
  widthMm = 80,
  printedAt = new Date(),
  paymentMethod = 'efectivo',
}) {
  const w = thermalCharWidth(widthMm);
  const lines = [];
  /** Nota de venta térmica: cabecera completa (Mi restaurante + emisor SUNAT). */
  lines.push(...buildRestaurantTicketHeaderLines(restaurant, widthMm));
  lines.push(centerThermalLine('NOTA DE VENTA', w));
  const { date, time } = formatPeDateTimeParts(printedAt);
  const numLeft = docLine ? `Número: ${docLine}` : 'Número: —';
  lines.push(padLeftRight(numLeft, `Hora: ${time}`, w));
  lines.push(`Fecha: ${date}`);
  if (tableName) lines.push(`Mesa: ${String(tableName).slice(0, w)}`);

  lines.push('DATOS DEL CLIENTE');
  if ((customerLines || []).filter(Boolean).length === 0) {
    lines.push('Nombre: _________________________');
    lines.push('DNI / RUC: ____________________');
  } else {
    for (const l of customerLines) {
      if (l) lines.push(String(l).slice(0, w));
    }
  }

  lines.push('Condición de pago:');
  for (const row of paymentCheckboxRows(paymentMethod, w)) lines.push(row);

  lines.push('-'.repeat(w));
  pushProductTableSection(lines, groupedRows, formatCurrencyFn, widthMm);
  lines.push('-'.repeat(w));
  const sumLines = (groupedRows || []).reduce((s, g) => s + Number(g.subtotal != null ? g.subtotal : 0), 0);
  const sub = subtotal != null ? Number(subtotal) : sumLines;
  lines.push(padLeftRight('SUBTOTAL:', formatCurrencyFn(sub), w));
  lines.push(padLeftRight('TOTAL:', formatCurrencyFn(total), w));
  lines.push(centerThermalLine('¡Gracias por preferirnos!', w));
  lines.push('');
  return stripThermalDebugFooter(lines.join('\n'));
}

/** Convierte una línea del carrito de mozo/caja en ítem para {@link buildPedidoMesaTicketPlainText}. */
export function enrichCartLineForKitchenItem(line, productsById, modifiersByIdMap = new Map()) {
  const p = productsById.get(line.product_id) || {};
  const mid = String(line.modifier_id || '').trim();
  const modName = mid ? String(modifiersByIdMap.get(mid)?.name || '').trim() : '';
  const bits = [];
  if (String(line.notes || '').trim()) bits.push(String(line.notes).trim());
  if (line.modifier_option) {
    bits.push(modName ? `${modName}: ${line.modifier_option}` : String(line.modifier_option));
  }
  return {
    product_name: String(line.name || p.name || '').trim() || '—',
    variant_name: String(line.variant_name || '').trim(),
    quantity: Number(line.quantity || 1),
    notes: bits.join(' | '),
    modifier_option: '',
  };
}

/**
 * Comanda cocina/bar: PEDIDO MESA, fecha/hora, para llevar, cantidad + producto y bloque de detalles/notas.
 */
export function buildPedidoMesaTicketPlainText({
  tableLabel = '',
  orderNumber = '',
  takeout = false,
  waiterName = '',
  items = [],
  widthMm = 80,
  printedAt = new Date(),
}) {
  const w = thermalCharWidth(widthMm);
  const { clip: clipMax } = thermalPaperMetrics(widthMm);
  const lines = [];
  lines.push(centerThermalLine('PEDIDO MESA', w));
  const { date, time } = formatPeDateTimeParts(printedAt);
  lines.push(padLeftRight(`Fecha: ${date}`, `Hora: ${time}`, w));
  lines.push(takeout ? 'PARA LLEVAR: SÍ' : 'PARA LLEVAR: NO');
  if (waiterName) lines.push(`Mozo: ${String(waiterName).slice(0, clipMax)}`);
  if (orderNumber !== '' && orderNumber != null) lines.push(`Pedido: #${orderNumber}`);
  if (tableLabel) lines.push(`Ubicación: ${String(tableLabel).slice(0, clipMax)}`);
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
      const parts = rawNotes.split(' | ').map((x) => x.trim()).filter(Boolean);
      parts.forEach((p) => noteBits.push(p));
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
