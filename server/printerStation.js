/** Normalización de área de impresión (cocina, bar, caja, delivery, parrilla, …). */

const KNOWN_PRINT_AREAS = ['cocina', 'bar', 'caja', 'delivery', 'parrilla'];

function normalizePrinterStation(p) {
  const s = String(p?.station || '')
    .toLowerCase()
    .trim();
  if (KNOWN_PRINT_AREAS.includes(s)) return s;
  const n = String(p?.name || '').toLowerCase();
  if (n.includes('parrilla')) return 'parrilla';
  if (n.includes('delivery')) return 'delivery';
  if (n.includes('caja')) return 'caja';
  if (n.includes('bar')) return 'bar';
  if (n.includes('cocina')) return 'cocina';
  return 'cocina';
}

module.exports = { normalizePrinterStation, KNOWN_PRINT_AREAS };
