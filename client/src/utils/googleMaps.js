/**
 * Abre la búsqueda de Google Maps con la dirección indicada (útil en móvil y escritorio).
 * @param {string} address
 * @returns {string} URL o cadena vacía si no hay dirección
 */
export function buildGoogleMapsSearchUrl(address) {
  const q = String(address || '').trim();
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
