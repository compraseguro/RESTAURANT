const { logoToEscPosRaster } = require('./thermalLogo');
const {
  getEscposMagnification,
  thermalEffectiveCharsPerLine,
  gsBangMagnificationBuffer,
  GS_BANG_NORMAL,
} = require('./thermalMagnify');

/** Quita pies de depuración que no deben salir en papel (p. ej. «Modulo: caja»). */
function stripDebugLinesFromPreformattedText(raw) {
  let s = String(raw || '')
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
      if (/\bm[oó]dulo\s*:?\s*[a-záéíóúñ0-9_-]*/i.test(t)) return false;
      return true;
    })
    .join('\n');
}

function charsPerLine(paperWidth, options = {}) {
  return thermalEffectiveCharsPerLine(paperWidth, options);
}

function wrapLine(text, width) {
  const raw = String(text || '').trim();
  if (!raw) return [''];
  const words = raw.split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      return;
    }
    if (line) out.push(line);
    if (word.length <= width) {
      line = word;
      return;
    }
    for (let i = 0; i < word.length; i += width) {
      out.push(word.slice(i, i + width));
    }
    line = '';
  });
  if (line) out.push(line);
  return out.length ? out : [''];
}

/** ASCII imprimible para bytes que muchas térmicas tratan como texto plano. */
function escPosAsciiLine(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '?');
}

/**
 * Centrado solo con espacios, línea exactamente `w` caracteres.
 * Con ESC a 0 (izquierda) la impresora no «re-centra» y no sale corrido.
 */
function centerLine(text, w) {
  const value = escPosAsciiLine(String(text || '').trim());
  const width = Math.max(1, Number(w) || 1);
  if (!value) return `${' '.repeat(width)}\n`;
  let vis = value.length > width ? value.slice(0, width) : value;
  if (vis.length >= width) return `${vis}\n`;
  const pad = width - vis.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return `${' '.repeat(left)}${vis}${' '.repeat(right)}\n`;
}

/** Reinicio + alineación izquierda (sin tamaño; el GS ! va tras el logo si hay). */
const INIT_LEFT = Buffer.from('\x1B\x40\x1B\x61\x00', 'binary');
const CUT_PARTIAL = Buffer.from('\x1D\x56\x41', 'binary');

function magnifyStartBuffer(options = {}) {
  const viaNetwork = options.viaNetwork === true;
  const { width: mw, height: mh } = getEscposMagnification({ viaNetwork });
  const mag = gsBangMagnificationBuffer(mw, mh);
  return mag || Buffer.alloc(0);
}

function tailAfterBody() {
  return Buffer.concat([Buffer.from('\n', 'latin1'), GS_BANG_NORMAL, CUT_PARTIAL]);
}

/**
 * @param {string} moduleName
 * @param {object} data
 * @param {object} options — { paperWidth: 58|80, viaNetwork?: boolean }
 * @returns {Promise<Buffer>}
 */
async function buildTicket(moduleName, data = {}, options = {}) {
  const paperW = Number(data.paperWidth) || Number(options.paperWidth) || 80;
  const width = charsPerLine(paperW, options);
  const inset = paperW <= 58 ? 2 : paperW <= 75 ? 4 : 5;
  const contentWidth = Math.min(width, Math.max(8, width - inset));

  const cleanedPreformatted = stripDebugLinesFromPreformattedText(String(data.text || '').trim());
  if (data.preformatted && cleanedPreformatted) {
    const parts = [];
    cleanedPreformatted.split('\n').forEach((rawPart) => {
      wrapLine(rawPart, contentWidth).forEach((line) => {
        const row = centerLine(line, width);
        parts.push(Buffer.from(row, 'latin1'));
      });
    });
    parts.push(Buffer.from('\n', 'latin1'));
    const body = Buffer.concat(parts);

    const chunks = [INIT_LEFT];

    const logoUrl = data.logoUrl || data.logo;
    const skipLogo = data.skipThermalLogo === true || String(process.env.RESTO_THERMAL_NO_LOGO || '') === '1';
    /** Logo raster = bytes binarios; en drivers «texto» sale basura. Solo con opt-in o RESTO_THERMAL_LOGO=1. */
    const wantLogo =
      data.includeThermalLogo === true || String(process.env.RESTO_THERMAL_LOGO || '') === '1';
    if (logoUrl && wantLogo && !skipLogo) {
      const raster = await logoToEscPosRaster(String(logoUrl).trim(), paperW);
      if (raster && raster.length) {
        chunks.push(raster);
        chunks.push(Buffer.from('\n', 'latin1'));
      }
    }

    const magBuf = magnifyStartBuffer(options);
    if (magBuf.length) chunks.push(magBuf);

    chunks.push(body);
    chunks.push(tailAfterBody());
    return Buffer.concat(chunks);
  }

  const bodyParts = [];
  const pushCentered = (raw) => {
    wrapLine(raw, width).forEach((ln) => {
      bodyParts.push(Buffer.from(centerLine(ln, width), 'latin1'));
    });
  };

  const headerRaw =
    String(data.restaurantHeader || data.restaurantName || 'RESTAURANTE').trim() || 'RESTAURANTE';
  pushCentered(headerRaw.toUpperCase());
  if (data.title) pushCentered(String(data.title).toUpperCase());
  if (data.mesa) pushCentered(`Mesa: ${data.mesa}`);
  if (data.orderNumber != null) pushCentered(`Pedido: #${data.orderNumber}`);
  bodyParts.push(Buffer.from(centerLine('-'.repeat(width), width), 'latin1'));

  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach((item) => {
    const qty = Number(item.quantity || item.qty || 0);
    const name = String(item.product_name || item.name || '').trim() || 'Producto';
    pushCentered(`${qty || 1} ${name}`);
  });

  if (items.length === 0 && data.text) {
    String(data.text)
      .split('\n')
      .forEach((part) => pushCentered(part));
  }

  bodyParts.push(Buffer.from('\n', 'latin1'));
  bodyParts.push(Buffer.from(centerLine('-'.repeat(width), width), 'latin1'));
  bodyParts.push(Buffer.from('\n', 'latin1'));

  const body = Buffer.concat(bodyParts);

  const magBuf = magnifyStartBuffer(options);
  const head = magBuf.length ? Buffer.concat([INIT_LEFT, magBuf]) : INIT_LEFT;
  return Buffer.concat([head, body, tailAfterBody()]);
}

module.exports = { buildTicket, charsPerLine };
