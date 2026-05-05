const iconv = require('iconv-lite');

/**
 * Buffer ESC/POS: texto (CP858 para español), corte parcial.
 */
function buildEscPosBuffer(text, options = {}) {
  const cut = options.cut !== false;
  const openDrawer = !!options.openCashDrawer;

  const init = Buffer.from([0x1b, 0x40]);
  const alignLeft = Buffer.from([0x1b, 0x61, 0x00]);
  const plain = String(text || '') + '\n\n';
  let body;
  try {
    body = iconv.encode(plain, 'cp858');
  } catch (_) {
    body = Buffer.from(plain, 'latin1');
  }

  const chunks = [init, alignLeft, body];

  if (openDrawer) {
    chunks.push(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
  }

  if (cut) {
    chunks.push(Buffer.from([0x1d, 0x56, 0x42, 0x00]));
  }

  return Buffer.concat(chunks);
}

module.exports = { buildEscPosBuffer };
