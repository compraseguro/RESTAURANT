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
  if (!Number.isFinite(n) || n <= 0) return Number(cl['80']) || 48;
  if (n <= 58) return Number(cl['58']) || 32;
  if (n <= 75) return Number(cl['75']) || 42;
  return Number(cl['80']) || 48;
}

function center(text, width) {
  const value = String(text || '').trim();
  const w = Math.max(1, Number(width) || 1);
  if (!value) return `${' '.repeat(w)}\n`;
  /** Vista térmica monoespaciada: la línea debe tener exactamente `w` caracteres (relleno izq + texto + der). */
  let vis = value.length > w ? value.slice(0, w) : value;
  if (vis.length >= w) return `${vis}\n`;
  const pad = w - vis.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return `${' '.repeat(left)}${vis}${' '.repeat(right)}\n`;
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

/** Sin acentos en bytes: las térmicas en modo ESC/POS suelen usar página única; UTF-8 puede imprimir basura. */
function escPosAsciiLine(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '?');
}

/**
 * Títulos: doble alto (ESC ! 0x10). Debe enviarse con ESC a 1 (centrar) ya activo en la impresora.
 * No alternar ESC a 0 aquí: antes se dejaba en izquierda y el ticket salía corrido.
 */
function encodeEmphasizedLine(text, paperWidthChars) {
  const t = escPosAsciiLine(String(text || '').trim());
  if (!t) return Buffer.from('\n', 'latin1');
  const maxChars = Math.max(10, Number(paperWidthChars) || 42);
  const slice = t.length > maxChars ? `${t.slice(0, maxChars - 3)}...` : t;
  return Buffer.concat([
    Buffer.from('\x1B!\x10', 'binary'),
    Buffer.from(`${slice}\n`, 'latin1'),
    Buffer.from('\x1B!\x00', 'binary'),
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
   * Mismo ancho útil en caja / cocina / bar para que el texto y las tablas ocupen todo el rollo configurado.
   */
  const contentWidth = Math.max(24, width - (paperW <= 58 ? 2 : 4));

  /**
   * Cuerpo preformateado: centrado por HARDWARE (ESC a 1), sin rellenar con espacios en servidor.
   * Antes: ESC a 0 + líneas con espacios → la térmica imprimía desde la izquierda y sobraba “marco” falso.
   */
  const cleanedPreformatted = stripDebugLinesFromPreformattedText(String(data.text || '').trim());
  if (data.preformatted && cleanedPreformatted) {
    const parts = [];
    cleanedPreformatted.split('\n').forEach((rawPart) => {
      wrapLine(rawPart, contentWidth).forEach((line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed) {
          parts.push(Buffer.from('\n', 'utf8'));
          return;
        }
        if (shouldEmphasizeThermalLine(trimmed, key)) {
          parts.push(encodeEmphasizedLine(trimmed, width));
        } else {
          parts.push(Buffer.from(`${trimmed}\n`, 'utf8'));
        }
      });
    });
    parts.push(Buffer.from('\n', 'utf8'));
    const body = Buffer.concat(parts);

    const chunks = [Buffer.from('\x1B\x40\x1B\x74\x02\x1B\x52\x00\x1B\x20\x00', 'binary')];

    const logoUrl = data.logoUrl || data.logo;
    if (logoUrl) {
      const raster = await logoToEscPosRaster(String(logoUrl).trim(), paperW);
      if (raster && raster.length) {
        chunks.push(Buffer.from('\x1B\x61\x01', 'binary'));
        chunks.push(raster);
        chunks.push(Buffer.from('\n', 'binary'));
      }
    }

    chunks.push(Buffer.from('\x1B\x61\x01', 'binary'));
    chunks.push(body);
    chunks.push(Buffer.from('\x1B\x61\x00\n', 'binary'));
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
    Buffer.from('\x1B\x40\x1B\x74\x02\x1B\x52\x00\x1B\x20\x00\x1B\x61\x01', 'binary'),
    Buffer.from(body.join(''), 'utf8'),
    Buffer.from('\x1B\x61\x00\n\n\x1D\x56\x41', 'binary'),
  ]);
}

module.exports = { buildTicket, charsPerLine };
