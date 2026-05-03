/**
 * Evita impresiones duplicadas cuando POS y panel cocina disparan el mismo trabajo casi a la vez.
 * Varias llamadas con la misma clave comparten una sola promesa (un solo envío físico).
 * Si ese envío falla, la clave se libera y un reintento posterior puede volver a imprimir.
 */

const inflight = new Map();

function stampForOrder(order) {
  const u = order?.updated_at ?? order?.created_at ?? '';
  if (u) return String(u);
  const items = order?.items || [];
  const n = items.length;
  const sig = items
    .slice(0, 12)
    .map((it) => `${it.product_id || ''}:${it.quantity}:${String(it.notes || '').slice(0, 20)}`)
    .join('|');
  return `i${n}:${sig}`;
}

function makeKey(station, order) {
  const id = order?.id;
  if (id == null || id === '') return null;
  const st = String(station || '').trim() || 'unknown';
  return `${st}:${id}:${stampForOrder(order)}`;
}

/**
 * @template T
 * @param {string} station
 * @param {object} order
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function dedupeThermalAutoPrintJob(station, order, fn) {
  const key = makeKey(station, order);
  if (!key) return fn();
  const cur = inflight.get(key);
  if (cur) return cur;
  const p = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}
