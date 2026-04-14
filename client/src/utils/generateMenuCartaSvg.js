/** Escapa texto de usuario para insertar en SVG/XML. */
export function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Interpreta líneas de menú.
 * - Con precio al final: "Ceviche clásico  S/ 28" · "Lomo 35,50" · "Chicha 8"
 * - Línea con # al inicio: título de sección explícito
 * - Sin precio reconocible: sección (ej. "Entradas", "Postres")
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
    rows.push({ kind: 'section', label: line });
  }
  return rows;
}

function formatPriceS(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'S/ —';
  const fixed = Math.abs(n - Math.round(n)) < 0.001 ? String(Math.round(n)) : n.toFixed(2).replace(/\.?0+$/, '');
  return `S/ ${fixed}`;
}

function clipMenuName(name, max = 36) {
  const s = String(name || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Genera un SVG vertical tipo carta (fondo oscuro, acentos dorados / azul).
 * @param {{ rows: ReturnType<typeof parseMenuLines>, title?: string }} opts
 */
export function buildMenuCartaSvgString({ rows, title = 'Nuestra carta' }) {
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
    '<stop offset="0%" style="stop-color:#0f172a"/>',
    '<stop offset="55%" style="stop-color:#1e293b"/>',
    '<stop offset="100%" style="stop-color:#0c4a6e"/>',
    '</linearGradient>',
    '<linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">',
    '<stop offset="0%" style="stop-color:#fbbf24"/>',
    '<stop offset="50%" style="stop-color:#fcd34d"/>',
    '<stop offset="100%" style="stop-color:#38bdf8"/>',
    '</linearGradient>',
    '</defs>'
  );
  parts.push(`<rect width="100%" height="100%" fill="url(#bg)"/>`);
  parts.push(`<rect x="${padX}" y="36" width="${W - padX * 2}" height="3" fill="url(#accent)" rx="1.5"/>`);
  parts.push(
    `<text x="${W / 2}" y="72" text-anchor="middle" fill="#f8fafc" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="26" font-weight="700" letter-spacing="0.02em">${escapeXml(title)}</text>`
  );
  parts.push(
    `<text x="${W / 2}" y="96" text-anchor="middle" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="11" letter-spacing="0.12em">MENÚ</text>`
  );

  let y = titleBlock + 28;
  for (const r of rows) {
    if (r.kind === 'section') {
      parts.push(
        `<text x="${padX}" y="${y}" fill="#e2e8f0" font-family="system-ui,-apple-system,sans-serif" font-size="15" font-weight="700" letter-spacing="0.06em">${escapeXml(r.label)}</text>`
      );
      parts.push(
        `<line x1="${padX}" y1="${y + 8}" x2="${W - padX}" y2="${y + 8}" stroke="#334155" stroke-width="1"/>`
      );
      y += lineHSection + 8;
    } else {
      const name = escapeXml(clipMenuName(r.name));
      const price = escapeXml(formatPriceS(r.price));
      parts.push(
        `<text x="${padX}" y="${y}" fill="#f1f5f9" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="500">${name}</text>`
      );
      parts.push(
        `<text x="${W - padX}" y="${y}" text-anchor="end" fill="#fcd34d" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="700">${price}</text>`
      );
      y += lineHItem;
    }
  }

  parts.push(
    `<text x="${W / 2}" y="${totalH - 18}" text-anchor="middle" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10">Gracias por su visita</text>`
  );
  parts.push('</svg>');
  return parts.join('');
}

/** Blob listo para `api.upload` (image/svg+xml). */
export function buildMenuCartaSvgBlob({ rows, title }) {
  const svg = buildMenuCartaSvgString({ rows, title });
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}
