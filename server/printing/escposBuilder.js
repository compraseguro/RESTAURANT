'use strict';

/**
 * Generación de buffers ESC/POS (inicialización, texto UTF-8, avance, corte).
 * Misma semántica que el antiguo microservicio portable.
 */
const { Buffer } = require('buffer');

function escInit() {
  return Buffer.from([0x1b, 0x40]);
}
function escSizeNormal() {
  return Buffer.from([0x1b, 0x21, 0x00]);
}
function escSizeDoubleHeight() {
  return Buffer.from([0x1b, 0x21, 0x10]);
}
function escCut() {
  return Buffer.from([0x1d, 0x56, 0x00]);
}
function escOpenCashDrawer() {
  return Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
}
function escFeed(n = 3) {
  const k = Math.min(10, Math.max(1, Number(n) || 3));
  return Buffer.from([0x1b, 0x64, k]);
}

/**
 * @param {string} text
 * @param {number} copies
 * @param {58|80} paperWidthMm
 * @param {{ openCashDrawer?: boolean }} opts
 */
function buildEscPosBuffer(text, copies, paperWidthMm, opts = {}) {
  const narrow = Number(paperWidthMm) === 58;
  const chunks = [];
  const body = Buffer.concat([
    narrow ? escSizeNormal() : escSizeDoubleHeight(),
    Buffer.from(String(text || ''), 'utf8'),
    Buffer.from('\n\n', 'utf8'),
    escSizeNormal(),
    opts.openCashDrawer ? escOpenCashDrawer() : Buffer.alloc(0),
  ]);
  const n = Math.min(5, Math.max(1, Number(copies || 1)));
  for (let c = 0; c < n; c += 1) {
    chunks.push(escInit(), body, escFeed(2), escCut());
  }
  return Buffer.concat(chunks);
}

module.exports = { buildEscPosBuffer };
