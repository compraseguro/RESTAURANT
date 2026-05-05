/**
 * Impresión solo con el diálogo del navegador (sin servidor ni drivers térmicos).
 */
export function printPlainTextInBrowser(text, title = 'Imprimir', options = {}) {
  const widthMm = [58, 80].includes(Number(options.widthMm)) ? Number(options.widthMm) : 80;
  const copies = Math.min(5, Math.max(1, Number(options.copies) || 1));
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    return { ok: false, error: 'El navegador bloqueó la ventana de impresión' };
  }
  const safe = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const ticketWidth = widthMm === 58 ? '54mm' : '76mm';
  const blocks = Array.from({ length: copies }, (_, idx) => {
    const label =
      copies > 1
        ? '<p class="copy-label">Copia ' + (idx + 1) + ' de ' + copies + '</p>'
        : '';
    return label + '<pre class="ticket">' + safe + '</pre>';
  }).join('<hr class="sep" />');
  const escTitle = String(title || 'Imprimir').replace(/</g, '');
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    escTitle +
    '</title><style>' +
    '@page { size: ' +
    widthMm +
    'mm auto; margin: 2mm; }' +
    'body { font-family: \'Courier New\', Courier, monospace; width: ' +
    ticketWidth +
    '; max-width: 100%; margin: 0 auto; font-size: 12px; line-height: 1.35; }' +
    '.ticket { margin: 0; white-space: pre-wrap; word-break: break-word; }' +
    '.copy-label { font-size: 11px; font-weight: 700; margin: 0 0 6px; }' +
    '.sep { border: 0; border-top: 1px dashed #ccc; margin: 8px 0; }' +
    '</style></head><body>' +
    blocks +
    '</body></html>';
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } finally {
      w.close();
    }
  }, 150);
  return { ok: true };
}
