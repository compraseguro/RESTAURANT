/** ESC/POS en el navegador (Web Serial). Misma lógica que print-microservice/escpos.js */

function u8(...bytes) {
  return new Uint8Array(bytes);
}

function u8concat(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function escInit() {
  return u8(0x1b, 0x40);
}
function escSizeNormal() {
  return u8(0x1b, 0x21, 0x00);
}
function escSizeDoubleHeight() {
  return u8(0x1b, 0x21, 0x10);
}
function escCut() {
  return u8(0x1d, 0x56, 0x00);
}
function escOpenCashDrawer() {
  return u8(0x1b, 0x70, 0x00, 0x19, 0xfa);
}
function escFeed(n = 3) {
  const k = Math.min(10, Math.max(1, Number(n) || 3));
  return u8(0x1b, 0x64, k);
}

function utf8(s) {
  return new TextEncoder().encode(String(s || ''));
}

/**
 * @param {string} text
 * @param {number} copies
 * @param {58|80} paperWidthMm
 * @param {{ open_cash_drawer?: boolean }} opts
 */
export function buildEscPosUint8Array(text, copies, paperWidthMm, opts = {}) {
  const narrow = Number(paperWidthMm) === 58;
  const body = u8concat([
    narrow ? escSizeNormal() : escSizeDoubleHeight(),
    utf8(text),
    utf8('\n\n'),
    escSizeNormal(),
    opts.open_cash_drawer ? escOpenCashDrawer() : new Uint8Array(0),
  ]);
  const n = Math.min(5, Math.max(1, Number(copies || 1)));
  const chunks = [];
  for (let c = 0; c < n; c += 1) {
    chunks.push(escInit(), body, escFeed(2), escCut());
  }
  return u8concat(chunks);
}
