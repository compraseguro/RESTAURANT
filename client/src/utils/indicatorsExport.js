import { API_BASE } from './api';

export async function downloadIndicatorsExport({ format = 'csv', tab = 'all', from, to }) {
  const token = localStorage.getItem('token');
  const qs = new URLSearchParams({ format, tab });
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const res = await fetch(`${API_BASE}/reports/indicators-export?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo exportar');
  }
  const blob = await res.blob();
  const ext = format === 'pdf' ? 'pdf' : format === 'json' ? 'json' : 'csv';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `indicadores-${tab}-${from || 'periodo'}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportHubJsonClient(hub, filename = 'indicadores.json') {
  const blob = new Blob([JSON.stringify(hub, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
