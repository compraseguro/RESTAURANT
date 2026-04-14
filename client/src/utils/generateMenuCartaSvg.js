/** Escapa texto de usuario para insertar en SVG/XML. */
export function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeHex(color, fallback = '#000000') {
  const s = String(color || '').trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) return `#${m[1].toLowerCase()}`;
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return fallback;
}

function hexToRgb(hex) {
  const h = normalizeHex(hex, '#000000').slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const u = 1 - t;
  return rgbToHex(A.r * u + B.r * t, A.g * u + B.g * t, A.b * u + B.b * t);
}

function shadeHex(hex, delta) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + delta, g + delta, b + delta);
}

/** Colores por defecto del generador (fondo oscuro, texto claro, secciones celeste). */
export const DEFAULT_MENU_CARTA_COLORS = {
  bg: '#0f172a',
  text: '#f1f5f9',
  section: '#7dd3fc',
  price: '#fcd34d',
};

/**
 * Interpreta líneas de menú.
 * - Línea con # al inicio (tras espacios): solo ahí es categoría / sección en la carta.
 * - Con precio al final: ítem con precio ("Ceviche clásico  28", "Lomo 35,50").
 * - Sin # y sin precio: ítem solo texto (mismo color que platos, sin línea de categoría).
 */
export function parseMenuLines(raw) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = [];
  for (const line of lines) {
    if (/^#+\s*/.test(line)) {
      rows.push({ kind: 'section', label: line.replace(/^#+\s*/, '').trim() });
      continue;
    }
    const m = line.match(/^(.+?)\s+(?:S\/?\s*)?\$?\s*([\d.,]+)\s*$/i);
    if (m) {
      let name = m[1].replace(/[·\u00B7\u2013\u2014\-–—]\s*$/u, '').trim();
      const num = parseFloat(String(m[2]).replace(',', '.'));
      if (name && Number.isFinite(num)) {
        rows.push({ kind: 'item', name, price: num });
        continue;
      }
    }
    rows.push({ kind: 'item', name: line, price: null });
  }
  return rows;
}

function formatPriceS(value) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return '';
  const fixed = Math.abs(n - Math.round(n)) < 0.001 ? String(Math.round(n)) : n.toFixed(2).replace(/\.?0+$/, '');
  return `S/ ${fixed}`;
}

function clipMenuName(name, max = 36) {
  const s = String(name || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Genera un SVG vertical tipo carta (colores configurables).
 * @param {{ rows: ReturnType<typeof parseMenuLines>, title?: string, colors?: Partial<typeof DEFAULT_MENU_CARTA_COLORS> }} opts
 */
export function buildMenuCartaSvgString({ rows, title = 'Nuestra carta', colors: colorsIn = {} }) {
  const c = { ...DEFAULT_MENU_CARTA_COLORS, ...colorsIn };
  const bg = normalizeHex(c.bg, DEFAULT_MENU_CARTA_COLORS.bg);
  const text = normalizeHex(c.text, DEFAULT_MENU_CARTA_COLORS.text);
  const section = normalizeHex(c.section, DEFAULT_MENU_CARTA_COLORS.section);
  const price = normalizeHex(c.price, DEFAULT_MENU_CARTA_COLORS.price);
  const bgStop0 = shadeHex(bg, 22);
  const bgStop1 = shadeHex(bg, 10);
  const bgStop2 = shadeHex(bg, -38);
  const titleFill = mixHex(text, bg, 0.06);
  const subtitleFill = mixHex(text, bg, 0.45);
  const footerFill = mixHex(text, bg, 0.5);
  const lineStroke = mixHex(text, bg, 0.55);
  const accent0 = mixHex(section, price, 0.35);
  const accent1 = section;
  const accent2 = mixHex(section, text, 0.25);

  const W = 420;
  const padX = 36;
  const titleBlock = 88;
  const lineHItem = 46;
  const lineHSection = 40;
  let totalH = titleBlock + 28 + 36;
  for (const r of rows) {
    totalH += r.kind === 'section' ? lineHSection + 8 : lineHItem;
  }
  totalH += 36;

  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" role="img" aria-label="${escapeXml(title)}">`
  );
  parts.push(
    '<defs>',
    '<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
    `<stop offset="0%" style="stop-color:${bgStop0}"/>`,
    `<stop offset="55%" style="stop-color:${bgStop1}"/>`,
    `<stop offset="100%" style="stop-color:${bgStop2}"/>`,
    '</linearGradient>',
    '<linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">',
    `<stop offset="0%" style="stop-color:${accent0}"/>`,
    `<stop offset="50%" style="stop-color:${accent1}"/>`,
    `<stop offset="100%" style="stop-color:${accent2}"/>`,
    '</linearGradient>',
    '</defs>'
  );
  parts.push(`<rect width="100%" height="100%" fill="url(#bg)"/>`);
  parts.push(`<rect x="${padX}" y="36" width="${W - padX * 2}" height="3" fill="url(#accent)" rx="1.5"/>`);
  parts.push(
    `<text x="${W / 2}" y="72" text-anchor="middle" fill="${titleFill}" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="26" font-weight="700" letter-spacing="0.02em">${escapeXml(title)}</text>`
  );
  parts.push(
    `<text x="${W / 2}" y="96" text-anchor="middle" fill="${subtitleFill}" font-family="system-ui,-apple-system,sans-serif" font-size="11" letter-spacing="0.12em">MENÚ</text>`
  );

  let y = titleBlock + 28;
  for (const r of rows) {
    if (r.kind === 'section') {
      parts.push(
        `<text x="${padX}" y="${y}" fill="${section}" font-family="system-ui,-apple-system,sans-serif" font-size="15" font-weight="700" letter-spacing="0.06em">${escapeXml(r.label)}</text>`
      );
      parts.push(
        `<line x1="${padX}" y1="${y + 8}" x2="${W - padX}" y2="${y + 8}" stroke="${lineStroke}" stroke-width="1"/>`
      );
      y += lineHSection + 8;
    } else {
      const name = escapeXml(clipMenuName(r.name));
      const hasPrice = r.price != null && Number.isFinite(Number(r.price));
      parts.push(
        `<text x="${padX}" y="${y}" fill="${text}" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="500">${name}</text>`
      );
      if (hasPrice) {
        const priceStr = escapeXml(formatPriceS(r.price));
        parts.push(
          `<text x="${W - padX}" y="${y}" text-anchor="end" fill="${price}" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="700">${priceStr}</text>`
        );
      }
      y += lineHItem;
    }
  }

  parts.push(
    `<text x="${W / 2}" y="${totalH - 18}" text-anchor="middle" fill="${footerFill}" font-family="system-ui,-apple-system,sans-serif" font-size="10">Gracias por su visita</text>`
  );
  parts.push('</svg>');
  return parts.join('');
}

/** Blob listo para `api.upload` (image/svg+xml). */
export function buildMenuCartaSvgBlob({ rows, title, colors }) {
  const svg = buildMenuCartaSvgString({ rows, title, colors });
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}
