/**
 * Print-agent local: ESC/POS sin cuadro del navegador.
 * Requiere servicio en carpeta local-print-agent y URL en configuración.
 */

export function normalizeLocalAgentBase(url) {
  return String(url || 'http://127.0.0.1:3001').replace(/\/$/, '');
}

export function isLocalPrintAgentConfigured(printAgent) {
  return Boolean(String(printAgent?.base_url || '').trim());
}

/**
 * @param {string} baseUrl
 * @param {{
 *   area?: string,
 *   ticket?: string,
 *   text?: string,
 *   printer?: string,
 *   local_printer_name?: string,
 *   ip_address?: string,
 *   port?: number,
 *   copies?: number,
 *   mode?: 'lan'|'usb',
 *   paper_width_mm?: 58|80
 * }} payload
 */
export async function postLocalAgentPrint(baseUrl, payload) {
  const base = normalizeLocalAgentBase(baseUrl);
  const ticket = String(payload?.ticket ?? payload?.text ?? '');
  const ip = String(payload?.ip_address || '').trim();
  const printer = String(payload?.printer ?? payload?.local_printer_name ?? '').trim();
  if (!ip && !printer) {
    throw new Error('Para el agente local indique IP de térmica en red o nombre de impresora USB');
  }
  const mode = payload?.mode;
  const pwm = Number(payload?.paper_width_mm);
  const body = {
    area: payload?.area,
    ticket,
    text: ticket,
    printer: printer || undefined,
    ip_address: mode === 'usb' ? undefined : ip || undefined,
    port: Math.min(65535, Math.max(1, Number(payload?.port || 9100) || 9100)),
    copies: Math.min(5, Math.max(1, Number(payload?.copies || 1) || 1)),
    mode,
    paper_width_mm: [58, 80].includes(pwm) ? pwm : undefined,
  };
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
  const res = await fetch(`${base}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Agente de impresión (${res.status})`);
  }
  return data;
}

export async function fetchAgentPrinters(baseUrl) {
  const base = normalizeLocalAgentBase(baseUrl);
  const res = await fetch(`${base}/printers`, { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `No se listaron impresoras (${res.status})`);
  }
  return Array.isArray(data.printers) ? data.printers : [];
}

export async function probeLocalAgent(baseUrl) {
  const base = normalizeLocalAgentBase(baseUrl);
  const res = await fetch(`${base}/health`, { method: 'GET' });
  return res.ok;
}
