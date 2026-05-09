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
      if (/\bm[oó]dulo\s*:?\s*[a-záéíóúñ0-9_-]*/i.test(t)) return false;
      return true;
    })
    .join('\n');
}

/** Misma tabla que `thermalPrintLayout.json` y `thermalCharWidth()` en el cliente. */
function charsPerLine(paperWidth) {
  const n = Number(paperWidth);
  const cl = thermalLayout.charsPerLine;
  if (!Number.isFinite(n) || n <= 0) return Number(cl['80']) || 54;
  if (n <= 58) return Number(cl['58']) || 32;
  if (n <= 75) return Number(cl['75']) || 42;
  return Number(cl['80']) || 54;
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

/** Títulos / cabeceras: doble alto y ancho + centrado hardware (ESC a 1, ESC ! 0x30). */
function encodeEmphasizedLine(text, paperWidthChars) {
  const t = String(text || '').trim();
  if (!t) return Buffer.from('\n', 'utf8');
  const maxChars = Math.max(8, Math.floor(Number(paperWidthChars) / 2));
  const slice = t.length > maxChars ? `${t.slice(0, maxChars - 1)}…` : t;
  return Buffer.concat([
    Buffer.from('\x1B\x61\x01\x1B!\x30', 'binary'),
    Buffer.from(`${slice}\n`, 'utf8'),
    Buffer.from('\x1B!\x00\x1B\x61\x00', 'binary'),
  ]);
}

function shouldEmphasizeThermalLine(trimmed, moduleKey) {
  const t = String(trimmed || '').trim();
  if (!t) return false;
  const k = String(moduleKey || '').toLowerCase();
  if (k === 'cocina' || k === 'bar') {
    if (/^MESA\s/i.test(t)) return true;
    if (/^DELIVERY$/i.test(t)) return true;
    if (/^RECOJO$/i.test(t)) return true;
    if (/^PEDIDO/i.test(t)) return true;
    return false;
  }
  if (/^PRE\s*CUENTA$/i.test(t)) return true;
  if (/^NOTA\s+DE\s+VENTA$/i.test(t)) return true;
  if (/^PRODUCTOS$/i.test(t)) return true;
  if (/^BOLETA\s+DE\s+VENTA/i.test(t)) return true;
  if (/^FACTURA\s+ELECTR/i.test(t)) return true;
  if (/^DATOS\s+DEL\s+CLIENTE$/i.test(t)) return true;
  if (/^GRACIAS\s+POR\s+SU\s+PREFERENCIA$/i.test(t)) return true;
  if (/^Nº\s+/i.test(t)) return true;
  /** Nombre comercial / razón en mayúsculas (cabecera), sin filas de dos columnas ni montos. */
  if (
    t.length >= 4 &&
    t.length <= 38 &&
    t === t.toUpperCase() &&
    !/^(SUBTOTAL|TOTAL|DESCUENTO|FECHA|HORA|MESA|MOZO|CLIENTE|DOC|DIR|TEL|MÉTODO|METHOD|IMPORTE|OP\.|IGV|HASH|REPRESENTACIÓN|RUC|RAZ|DIRECCI|CORREO|TEL:)/i.test(t) &&
    !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t) &&
    !/S\/?\s*\d/.test(t) &&
    !/^-{3,}/.test(t) &&
    /^[A-ZÁÉÍÓÚÑ0-9 .,'&\-]+$/u.test(t)
  ) {
    if (/\s{3,}/.test(t)) return false;
    return true;
  }
  return false;
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
  const key = String(moduleName || '').toLowerCase();
  /**
   * Márgenes tipo «recuadro»: en caja más fuerte; en cocina/bar también en 75 mm.
   */
  let contentWidth = width;
  if (key === 'caja') {
    contentWidth = Math.max(28, width - (paperW <= 58 ? 2 : paperW <= 75 ? 4 : 8));
  } else if (paperW <= 75) {
    contentWidth = Math.max(28, width - 2);
  }

  /** Cuerpo ya formateado en cliente; títulos con doble tamaño y centrado hardware. */
  const cleanedPreformatted = stripDebugLinesFromPreformattedText(String(data.text || '').trim());
  if (data.preformatted && cleanedPreformatted) {
    const parts = [];
    cleanedPreformatted.split('\n').forEach((rawPart) => {
      wrapLine(rawPart, contentWidth).forEach((line) => {
        const row = center(line, width);
        const trim = row.replace(/\n$/, '').trim();
        if (!trim) {
          parts.push(Buffer.from('\n', 'utf8'));
          return;
        }
        if (shouldEmphasizeThermalLine(trim, key)) {
          parts.push(encodeEmphasizedLine(trim, width));
        } else {
          parts.push(Buffer.from(row, 'utf8'));
        }
      });
    });
    parts.push(Buffer.from('\n', 'utf8'));
    const body = Buffer.concat(parts);

    /**
     * Logo: centrado hardware (ESC a 1). Cuerpo precuenta/caja: ESC a 0 (izquierda).
     * El texto ya viene centrado con espacios en ancho fijo (`center()`); si además se envía ESC a 1,
     * muchas térmicas «recentran» la línea y el ticket parece descuadrado.
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
