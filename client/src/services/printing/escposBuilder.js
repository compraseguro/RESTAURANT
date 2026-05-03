/**
 * Construye datos ESC/POS para QZ Tray (raw).
 * Sin window.print(): bytes enviados directo a la térmica.
 */

/** ESC @ init, GS V 0 full cut */
export function escInit() {
  return new Uint8Array([0x1b, 0x40]);
}

export function escDoubleHeightOn() {
  return new Uint8Array([0x1b, 0x21, 0x10]);
}

export function escNormalSize() {
  return new Uint8Array([0x1b, 0x21, 0x00]);
}

export function escBold(on) {
  return new Uint8Array([0x1b, 0x45, on ? 1 : 0]);
}

export function escAlign(n) {
  /* 0 izq, 1 centro, 2 der */
  return new Uint8Array([0x1b, 0x61, n & 3]);
}

export function escCut() {
  return new Uint8Array([0x1d, 0x56, 0x00]);
}

/** Pulso cajón (compatible con muchas térmicas) */
export function escOpenCashDrawer() {
  return new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
}

export function escFeedLines(n = 3) {
  const k = Math.min(10, Math.max(1, n | 0));
  return new Uint8Array([0x1b, 0x64, k]);
}

function concatBytes(...parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function utf8Bytes(str) {
  return new TextEncoder().encode(String(str ?? ''));
}

/**
 * Texto plano (líneas) → buffer ESC/POS con corte y opciones.
 * @param {string} plainText
 * @param {{ copies?: number, paperWidthMm?: 58|80, openDrawer?: boolean }} opts
 */
export function buildEscPosFromPlainText(plainText, opts = {}) {
  const copies = Math.min(5, Math.max(1, Number(opts.copies || 1) || 1));
  const narrow = Number(opts.paperWidthMm) === 58;
  const lines = String(plainText || '').split(/\r?\n/);
  const bodyParts = [];
  bodyParts.push(narrow ? escNormalSize() : escDoubleHeightOn());
  bodyParts.push(utf8Bytes(lines.join('\n')));
  bodyParts.push(utf8Bytes('\n\n'));
  bodyParts.push(escNormalSize());
  if (opts.openDrawer) bodyParts.push(escOpenCashDrawer());
  const body = concatBytes(...bodyParts);

  const chunks = [];
  for (let c = 0; c < copies; c += 1) {
    chunks.push(escInit(), body, escFeedLines(2), escCut());
  }
  return concatBytes(...chunks);
}

/** Uint8Array → base64 (sin stack overflow en tickets largos) */
export function uint8ToBase64(u8) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Ticket de ejemplo (demostración).
 */
export function buildSampleTicketEscPos({
  restaurantName = 'Resto-FADEY',
  tableName = 'Mesa 5',
  orderNumber = '123',
  items = [{ qty: 2, name: 'Causa rellena' }],
  total = 'S/ 45.00',
} = {}) {
  const lines = [
    '================================',
    restaurantName.toUpperCase(),
    '--------------------------------',
    `MESA: ${tableName}`,
    `PEDIDO #${orderNumber}`,
    new Date().toLocaleString('es-PE'),
    '--------------------------------',
    ...items.map((it) => `${it.qty}x ${it.name}`),
    '--------------------------------',
    `TOTAL: ${total}`,
    '',
  ];
  return buildEscPosFromPlainText(lines.join('\n'), { copies: 1, paperWidthMm: 80 });
}
