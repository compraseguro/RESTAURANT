const { logoToEscPosRaster } = require('./thermalLogo');

function charsPerLine(paperWidth) {
  return Number(paperWidth) === 58 ? 32 : 48;
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

  /** Cuerpo ya formateado en cliente: UTF-8 + alineación centrada + logo opcional + corte. */
  if (data.preformatted && String(data.text || '').trim()) {
    const lines = [];
    String(data.text)
      .split('\n')
      .forEach((part) => wrapLine(part, width).forEach((line) => lines.push(`${line}\n`)));
    lines.push('\n');
    const body = Buffer.from(lines.join(''), 'utf8');

    /**
     * Cuerpo preformateado en cliente (centerThermalLine, tablas con |, padLeftRight).
     * NO usar alineación ESC/POS centrada en todo el bloque: rompe columnas y totales.
     * Solo centrar el raster del logo; el texto va en alineación izquierda (por defecto).
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

    chunks.push(body);
    chunks.push(Buffer.from('\n', 'binary'));
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
