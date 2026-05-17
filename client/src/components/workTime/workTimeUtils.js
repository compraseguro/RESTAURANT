export function formatMinutes(value) {
  const total = Math.max(0, Number(value || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function formatMoney(n) {
  return `S/ ${Number(n || 0).toFixed(2)}`;
}

export function severityBadge(severity) {
  if (severity === 'warning') return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800';
  if (severity === 'high') return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200';
  return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200';
}

export const ROLE_LABEL = {
  admin: 'Administrador',
  cajero: 'Cajero',
  mozo: 'Mozo',
  cocina: 'Cocina',
  bar: 'Bar',
  delivery: 'Delivery',
};
