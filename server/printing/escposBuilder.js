const { logoToEscPosRaster } = require('./thermalLogo');
const thermalLayout = require('./thermalPrintLayout.json');

/** Quita pies de depuración que no deben salir en papel (p. ej. «Modulo: caja»). */
function stripDebugLinesFromPreformattedText(raw) {
  let s = String(raw || '')
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  /** Cualquier «modulo: xxx» pegado o en línea (builds antiguos / drivers). */
  s = s.replace(/\s*m[oó]dulo\s*:\s*[a-záéíóúñ0-9_-]+\b/gi, '');
  /** Fecha/hora tipo inglés que suele ir tras ese pie */
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

/** Misma tabla que `thermalPrintLayout.json` y `thermalCharWidth()` en el cliente. */
function charsPerLine(paperWidth) {
  const n = Number(paperWidth);
  const cl = thermalLayout.charsPerLine;
  if (!Number.isFinite(n) || n <= 0) return Number(cl['80']) || 54;
  return n <= 58 ? Number(cl['58']) || 32 : Number(cl['80']) || 54;
}

function center(text, width) {
  const value = String(text || '').trim();
  if (!value) return '\n';
  if (value.length >= width) return `${value}\n`;
  const left = Math.floor((width - value.length) / 2);
  return `${' '.repeat(left)}${value}\n`;
}

function sep(width) {
  return `${'-'.repeat(width)}\n`;
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

/**
 * @param {string} moduleName
 * @param {object} data
 * @param {object} options — { paperWidth: 58|80 }
 * @returns {Promise<Buffer>}
 */
async function buildTicket(moduleName, data = {}, options = {}) {
  const paperW = Number(data.paperWidth) || Number(options.paperWidth) || 80;
  const width = charsPerLine(paperW);

  /** Cuerpo ya formateado en cliente (centrados locales con espacios, tablas con |). Recorte con wrap al ancho térmico. */
  const cleanedPreformatted = stripDebugLinesFromPreformattedText(String(data.text || '').trim());
  if (data.preformatted && cleanedPreformatted) {
    const lines = [];
    cleanedPreformatted
      .split('\n')
      .forEach((part) => wrapLine(part, width).forEach((line) => lines.push(`${line}\n`)));
    lines.push('\n');
    const body = Buffer.from(lines.join(''), 'utf8');

    /**
     * Logo centrado; texto del ticket alineado a la izquierda para usar el ancho útil del papel.
     * Centrar todo el bloque ESC/POS dejaba una «columna» estrecha con márgenes grandes en 80 mm.
     */
    const chunks = [Buffer.from('\x1B\x40', 'binary')];

    const logoUrl = data.logoUrl || data.logo;
    if (logoUrl) {
      const raster = await logoToEscPosRaster(String(logoUrl).trim(), paperW);
      if (raster && raster.length) {
        chunks.push(Buffer.from('\x1B\x61\x01', 'binary'));
        chunks.push(raster);
        chunks.push(Buffer.from('\n\x1B\x61\x00', 'binary'));
      }
    }

    chunks.push(Buffer.from('\x1B\x61\x00', 'binary'));
    chunks.push(body);
    chunks.push(Buffer.from('\n\x1B\x61\x00', 'binary'));
    chunks.push(Buffer.from('\x1D\x56\x41', 'binary'));
    return Buffer.concat(chunks);
  }

  const body = [];
  const header =
    String(data.restaurantHeader || data.restaurantName || 'RESTAURANTE').trim() || 'RESTAURANTE';
  body.push(center(header.toUpperCase(), width));
  if (data.title) body.push(center(String(data.title).toUpperCase(), width));
  if (data.mesa) body.push(...wrapLine(`Mesa: ${data.mesa}`, width).map((v) => `${v}\n`));
  if (data.orderNumber != null) {
    body.push(...wrapLine(`Pedido: #${data.orderNumber}`, width).map((v) => `${v}\n`));
  }
  body.push(sep(width));

  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach((item) => {
    const qty = Number(item.quantity || item.qty || 0);
    const name = String(item.product_name || item.name || '').trim() || 'Producto';
    wrapLine(`${qty || 1} ${name}`, width).forEach((line) => body.push(`${line}\n`));
  });

  if (items.length === 0 && data.text) {
    String(data.text)
      .split('\n')
      .forEach((part) => wrapLine(part, width).forEach((line) => body.push(`${line}\n`)));
  }

  body.push('\n');
  body.push(sep(width));

  return Buffer.concat([
    Buffer.from('\x1B\x40\x1B\x61\x01', 'binary'),
    Buffer.from(body.join(''), 'utf8'),
    Buffer.from('\x1B\x61\x00\n\n\x1D\x56\x41', 'binary'),
  ]);
}

module.exports = { buildTicket, charsPerLine };
