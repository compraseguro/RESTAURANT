const thermalLayout = require('./thermalPrintLayout.json');

/**
 * Factores de tamaño de carácter ESC/POS (Epson: GS ! n).
 * No existe 1,5× estándar; `fontSizeScale: 1.5` → redondeo a 2 en ancho y alto.
 */
function getEscposMagnification() {
  const ex = thermalLayout.escposMagnification;
  if (ex && typeof ex === 'object') {
    return {
      width: Math.max(1, Math.min(8, Number(ex.width) || 1)),
      height: Math.max(1, Math.min(8, Number(ex.height) || 1)),
    };
  }
  const s = Number(thermalLayout.fontSizeScale);
  if (Number.isFinite(s) && s > 1) {
    const k = Math.min(8, Math.max(1, Math.round(s)));
    if (k <= 1) return { width: 1, height: 1 };
    return { width: k, height: k };
  }
  return { width: 1, height: 1 };
}

function thermalBaseCharsPerLine(widthMm) {
  const n = Number(widthMm);
  const cl = thermalLayout.charsPerLine;
  if (!Number.isFinite(n) || n <= 0) return Number(cl['80']) || 48;
  if (n <= 58) return Number(cl['58']) || 32;
  if (n <= 75) return Number(cl['75']) || 42;
  return Number(cl['80']) || 48;
}

/** Columnas por línea teniendo en cuenta GS ! ancho (cada carácter ocupa `width` veces el ancho normal). */
function thermalEffectiveCharsPerLine(widthMm) {
  const base = thermalBaseCharsPerLine(widthMm);
  const { width: mw } = getEscposMagnification();
  const m = Math.max(1, mw);
  return Math.max(8, Math.floor(base / m));
}

/** GS ! n: nibble alto = factor ancho - 1, bajo = factor alto - 1. */
function gsBangMagnificationBuffer(mw, mh) {
  const w = Math.max(1, Math.min(8, mw));
  const h = Math.max(1, Math.min(8, mh));
  if (w <= 1 && h <= 1) return null;
  const n = ((w - 1) << 4) | (h - 1);
  return Buffer.from([0x1d, 0x21, n]);
}

const GS_BANG_NORMAL = Buffer.from([0x1d, 0x21, 0x00]);

module.exports = {
  getEscposMagnification,
  thermalBaseCharsPerLine,
  thermalEffectiveCharsPerLine,
  gsBangMagnificationBuffer,
  GS_BANG_NORMAL,
};
