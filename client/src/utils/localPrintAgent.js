/**
 * Agente de impresión local (ESC/POS por TCP sin cuadro del navegador).
 * Requiere servicio en local-print-agent y URL en Configuración → Impresoras.
 */

export function normalizeLocalAgentBase(url) {
  return String(url || 'http://127.0.0.1:49710').replace(/\/$/, '');
}

/** El envío por agente local está disponible si hay URL (la opción queda siempre activa en configuración). */
export function isLocalPrintAgentConfigured(printAgent) {
  return Boolean(String(printAgent?.base_url || '').trim());
}

/**
 * @param {string} baseUrl - p.ej. http://127.0.0.1:49710
 * @param {{ ip_address: string, port?: number, text: string, copies?: number }} payload
 */
export async function postLocalAgentPrint(baseUrl, payload) {
  const base = normalizeLocalAgentBase(baseUrl);
  const ip = String(payload?.ip_address || '').trim();
  if (!ip) throw new Error('Falta IP de impresora para el agente local');
  const res = await fetch(`${base}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ip_address: ip,
      port: Math.min(65535, Math.max(1, Number(payload?.port || 9100) || 9100)),
      text: String(payload?.text || ''),
      copies: Math.min(5, Math.max(1, Number(payload?.copies || 1) || 1)),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Agente local (${res.status})`);
  }
  return data;
}

export async function probeLocalAgent(baseUrl) {
  const base = normalizeLocalAgentBase(baseUrl);
  const res = await fetch(`${base}/health`, { method: 'GET' });
  return res.ok;
}
