/**
 * Buffers ESC/POS: texto, negrita, centrado, QR (modelo 2), corte, apertura de cajón.
 */

function escInit() {
  return Buffer.from([0x1b, 0x40]);
}

function escAlign(n) {
  /* 0 izq, 1 centro, 2 der */
  return Buffer.from([0x1b, 0x61, n & 3]);
}

function escBold(on) {
  return Buffer.from([0x1b, 0x45, on ? 1 : 0]);
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

/** Pulso estándar cajón (pin 2); compatible con mayoría de impresoras térmicas. */
function escOpenCashDrawer() {
  return Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
}

function escQrCode(text) {
  const s = Buffer.from(String(text || ''), 'utf8');
  if (!s.length) return Buffer.alloc(0);
  const pl = s.length + 3;
  const pL = pl % 256;
  const pH = Math.floor(pl / 256);
  return Buffer.concat([
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]),
    Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),
    s,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
  ]);
}

function escFeed(n = 3) {
  const k = Math.min(10, Math.max(1, Number(n) || 3));
  return Buffer.from([0x1b, 0x64, k]);
}

/**
 * @param {string} text
 * @param {number} copies
 * @param {number} paperWidthMm 58 | 80
 * @param {{ qr_text?: string, open_cash_drawer?: boolean, center_header_lines?: number }} opts
 */
function buildEscPosBuffer(text, copies, paperWidthMm, opts = {}) {
  const narrow = Number(paperWidthMm) === 58;
  const lines = String(text || '').split(/\r?\n/);
  const headerN = Math.min(8, Math.max(0, Number(opts.center_header_lines ?? 0) || 0));
  const chunks = [];

  const bodyPart = () => {
    const out = [];
    if (headerN > 0) {
      out.push(escAlign(1), escBold(1), narrow ? escSizeNormal() : escSizeDoubleHeight());
      for (let i = 0; i < headerN && i < lines.length; i += 1) {
        out.push(Buffer.from(`${lines[i]}\n`, 'utf8'));
      }
      out.push(escBold(0), escSizeNormal(), escAlign(0));
      for (let i = headerN; i < lines.length; i += 1) {
        out.push(Buffer.from(`${lines[i]}\n`, 'utf8'));
      }
    } else {
      out.push(narrow ? escSizeNormal() : escSizeDoubleHeight());
      out.push(Buffer.from(`${String(text || '')}\n`, 'utf8'));
      out.push(escSizeNormal());
    }
    if (opts.qr_text) {
      out.push(escFeed(2), escAlign(1), escQrCode(opts.qr_text), escAlign(0), escFeed(2));
    } else {
      out.push(Buffer.from('\n', 'utf8'));
    }
    if (opts.open_cash_drawer) {
      out.push(escOpenCashDrawer());
    }
    return Buffer.concat(out);
  };

  const n = Math.min(5, Math.max(1, Number(copies || 1)));
  for (let c = 0; c < n; c += 1) {
    chunks.push(escInit(), bodyPart(), escCut());
  }
  return Buffer.concat(chunks);
}

module.exports = {
  buildEscPosBuffer,
  escOpenCashDrawer,
};
