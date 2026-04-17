/** Misma regla que en el servidor: ancla YYYY-MM-DD + 1 o 6 meses. */
export function proximaFechaFromControlAnchor(anchorYyyyMmDd, periodo) {
  const months = periodo === 'semestral' ? 6 : 1;
  const parts = String(anchorYyyyMmDd || '').trim().split('-');
  if (parts.length !== 3) return '';
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !mo || !d) return '';
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return '';
  dt.setMonth(dt.getMonth() + months);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
