/**
 * Print-agent local: ESC/POS sin cuadro del navegador.
 * Requiere servicio en carpeta local-print-agent y URL en configuración.
 * Token opcional (misma clave en PRINT_AGENT_TOKEN del agente y en Configuración).
 */

export function normalizeLocalAgentBase(url) {
  return String(url || 'http://127.0.0.1:3001').replace(/\/$/, '');
}

export function isLocalPrintAgentConfigured(printAgent) {
  return Boolean(String(printAgent?.base_url || '').trim());
}

function agentHeaders(printAgent, json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  const t = String(printAgent?.agent_token || '').trim();
  if (t) h['X-Print-Agent-Token'] = t;
  return h;
}

/**
 * @param {string} baseUrl
 * @param {object} payload
 * @param {object} [printAgent] para cabecera de token
 */
export async function postLocalAgentPrint(baseUrl, payload, printAgent = null) {
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
    qr_text: payload?.qr_text || undefined,
    open_cash_drawer: payload?.open_cash_drawer || undefined,
    escpos_header_lines: payload?.escpos_header_lines,
  };
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
  const res = await fetch(`${base}/print`, {
    method: 'POST',
    headers: agentHeaders(printAgent, true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Agente de impresión (${res.status})`);
  }
  return data;
}

export async function fetchAgentPrinters(baseUrl, printAgent = null) {
  const base = normalizeLocalAgentBase(baseUrl);
  const res = await fetch(`${base}/printers`, { method: 'GET', headers: agentHeaders(printAgent, false) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `No se listaron impresoras (${res.status})`);
  }
  return Array.isArray(data.printers) ? data.printers : [];
}

export async function fetchAgentStatus(baseUrl, printAgent = null) {
  const base = normalizeLocalAgentBase(baseUrl);
  const res = await fetch(`${base}/status`, { method: 'GET', headers: agentHeaders(printAgent, false) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Estado del agente (${res.status})`);
  }
  return data;
}

export async function probeAgentTcp(baseUrl, printAgent, ip, port = 9100) {
  const base = normalizeLocalAgentBase(baseUrl);
  const res = await fetch(`${base}/probe`, {
    method: 'POST',
    headers: agentHeaders(printAgent, true),
    body: JSON.stringify({
      ip_address: String(ip || '').trim(),
      port: Math.min(65535, Math.max(1, Number(port) || 9100)),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Sondeo TCP (${res.status})`);
  }
  return data;
}

export async function probeLocalAgent(baseUrl, printAgent = null) {
  const base = normalizeLocalAgentBase(baseUrl);
  const res = await fetch(`${base}/health`, { method: 'GET', headers: agentHeaders(printAgent, false) });
  return res.ok;
}
