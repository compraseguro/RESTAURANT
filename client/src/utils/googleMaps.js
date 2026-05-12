/**
 * URL de búsqueda en Google Maps. Si pasas `restaurantAddress` (dirección del local en Mi Restaurante),
 * se añade al texto de búsqueda para priorizar resultados en tu zona (p. ej. Moyobamba vs. Lima).
 * @param {string} address Dirección de entrega del pedido
 * @param {{ restaurantAddress?: string }} [opts]
 * @returns {string} URL o cadena vacía si no hay datos
 */
export function buildGoogleMapsSearchUrl(address, opts = {}) {
  const q = String(address || '').trim();
  const anchor = String(opts.restaurantAddress || '').trim();
  if (!q && !anchor) return '';
  if (!q) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(anchor)}`;
  }
  if (!anchor) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  const anchorHead = anchor.slice(0, Math.min(24, anchor.length)).toLowerCase();
  const qLower = q.toLowerCase();
  const alreadyHasContext = anchorHead.length >= 4 && qLower.includes(anchorHead.slice(0, Math.min(12, anchorHead.length)));
  const full = alreadyHasContext ? q : `${q}, ${anchor}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
}
