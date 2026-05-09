const thermalLayout = require('./thermalPrintLayout.json');

/** Escala solo visual en impresión USB por GDI (fallback sin módulo RAW «printer»). */
function getThermalDisplayFontScale() {
  const s = Number(thermalLayout.fontSizeScale);
  if (!Number.isFinite(s) || s < 1) return 1;
  return Math.min(3, s);
}

/**
 * Tamaño del <pre> en impresión USB vía GDI (texto sin bytes ESC/POS).
 * Base 11 px × factor duplicado × `fontSizeScale`; luego escala según rollo y columnas
 * para que ~`charsPerLine` quepan en el ancho físico (50 mm referencia; 80 mm sin desborde).
 *
 * @param {number} [paperWidthMm=80]
 * @param {{ viaNetwork?: boolean }} [opts] — mismo criterio que `thermalEffectiveCharsPerLine`
 */
function getThermalGdiFontPx(paperWidthMm = 80, opts = {}) {
  const dup = Number(thermalLayout.gdiFontDuplicateFactor);
  const mult = Number.isFinite(dup) && dup > 0 ? Math.min(4, dup) : 2;
  const base = 11;
  const s = getThermalDisplayFontScale();
  let px = Math.max(11, Math.min(36, Math.round(base * mult * s)));
  const pw = Number(paperWidthMm);
  if (!Number.isFinite(pw) || pw <= 0) return px;
  const refPaper = 50;
  const refChars = thermalEffectiveCharsPerLine(refPaper, opts);
  const charsHere = thermalEffectiveCharsPerLine(pw, opts);
  let scale = (refChars / Math.max(8, charsHere)) * (pw / refPaper);
  /** Monoespaciado en Chromium suele ocupar más que el cálculo teórico; en 58–80 mm evita cortes con `pre-wrap`. */
  if (pw > 50) {
    const fudge = Number(thermalLayout.gdiPrintFitFudge);
    scale *= Number.isFinite(fudge) && fudge > 0 && fudge <= 1 ? fudge : 0.88;
  }
  px = Math.round(px * scale);
  return Math.max(9, Math.min(36, px));
}

function computeEscposMagnificationFactors() {
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

/**
 * @param {{ viaNetwork?: boolean }} opts — `viaNetwork: true` = impresora por IP:9100 (RAW).
 */
function shouldApplyEscposCharacterMagnify(opts = {}) {
  if (thermalLayout.useEscposCharacterMagnify === true) return true;
  if (opts.viaNetwork === true && thermalLayout.useEscposCharacterMagnifyNetwork !== false) {
    return true;
  }
  return false;
}

/**
 * Factores GS ! (Epson). En red suele ser RAW real; en USB GDI no se usan (se ve solo texto).
 * @param {{ viaNetwork?: boolean }} opts
 */
function getEscposMagnification(opts = {}) {
  if (!shouldApplyEscposCharacterMagnify(opts)) {
    return { width: 1, height: 1 };
  }
  return computeEscposMagnificationFactors();
}

function thermalBaseCharsPerLine(widthMm) {
  const n = Number(widthMm);
  const cl = thermalLayout.charsPerLine;
  if (!Number.isFinite(n) || n <= 0) return Number(cl['80']) || 48;
  if (n <= 50) return Number(cl['50']) || 28;
  if (n <= 58) return Number(cl['58']) || 32;
  if (n <= 75) return Number(cl['75']) || 42;
  return Number(cl['80']) || 48;
}

/** Columnas por línea según GS ! ancho (mismo criterio en cliente y servidor). */
function thermalEffectiveCharsPerLine(widthMm, opts = {}) {
  const base = thermalBaseCharsPerLine(widthMm);
  const { width: mw } = getEscposMagnification(opts);
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
  shouldApplyEscposCharacterMagnify,
  getThermalDisplayFontScale,
  getThermalGdiFontPx,
  thermalBaseCharsPerLine,
  thermalEffectiveCharsPerLine,
  gsBangMagnificationBuffer,
  GS_BANG_NORMAL,
};
