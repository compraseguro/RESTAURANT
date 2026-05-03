/**
 * Print-agent local: ESC/POS sin cuadro del navegador.
 * Requiere servicio en carpeta local-print-agent y URL en configuración.
 * Token opcional (misma clave en PRINT_AGENT_TOKEN del agente y en Configuración).
 *
 * Nota: una página HTTPS (p. ej. Vercel) no puede llamar a http://127.0.0.1 (contenido mixto).
 * En `npm run dev` se usa el proxy de Vite `/print-agent`. En producción HTTPS use URL relativa
 * `/print-agent` y configure nginx (u otro) que reenvíe a 127.0.0.1:3001, o abra la app por http://.
 */

export function normalizeLocalAgentBase(url) {
  return String(url || 'http://127.0.0.1:3001').replace(/\/$/, '');
}

export function isLocalPrintAgentConfigured(printAgent) {
  return Boolean(String(printAgent?.base_url || '').trim());
}

function isLoopbackHttpUrl(base) {
  try {
    const u = new URL(base);
    if (u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
  } catch {
    return false;
  }
}

/**
 * URL que el navegador puede usar sin bloqueo HTTPS→HTTP.
 * @param {object|null} printAgent { base_url, agent_token? }
 */
export function resolvePrintAgentFetchBase(printAgent) {
  const raw = String(printAgent?.base_url || '').trim();
  const fallback = 'http://127.0.0.1:3001';
  let base = raw || fallback;

  if (base.startsWith('/')) {
    if (typeof window !== 'undefined') {
      return `${window.location.origin.replace(/\/$/, '')}${base}`.replace(/\/$/, '');
    }
    return base.replace(/\/$/, '');
  }

  base = base.replace(/\/$/, '');

  if (typeof window === 'undefined') return base;

  const pageHttps = window.location.protocol === 'https:';
  /** Desarrollo: siempre mismo origen vía proxy Vite. */
  if (import.meta.env.DEV && isLoopbackHttpUrl(base)) {
    return `${window.location.origin}/print-agent`;
  }
  /** Producción HTTPS + agente en loopback HTTP: mismo origen (requiere proxy /print-agent en el servidor). */
  if (pageHttps && isLoopbackHttpUrl(base)) {
    return `${window.location.origin}/print-agent`;
  }

  return base;
}

function agentHeaders(printAgent, json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  const t = String(printAgent?.agent_token || '').trim();
  if (t) h['X-Print-Agent-Token'] = t;
  return h;
}

function explainFetchFailure(err, attemptedBase) {
  const msg = String(err?.message || '');
  if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError') && !msg.includes('Load failed')) {
    return err;
  }
  const https = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const usedRelative =
    typeof attemptedBase === 'string' && attemptedBase.startsWith(String(window?.location?.origin || ''));
  let hint =
    'Compruebe que el print-agent está en ejecución (carpeta local-print-agent → npm start). ';
  if (https && !usedRelative) {
    hint +=
      'Si abre el sistema por HTTPS y la URL del agente es http://127.0.0.1, el navegador lo bloquea. Use npm run dev (proxy /print-agent), abra la app por http:// en la LAN, o ponga en configuración la URL «/print-agent» y un proxy en su servidor hacia el puerto del agente. ';
  } else if (usedRelative) {
    hint +=
      'La URL apunta a /print-agent en este mismo sitio: hace falta el proxy (Vite en desarrollo o nginx en producción) hacia 127.0.0.1:3001. ';
  }
  return new Error(hint + `(${msg})`);
}

async function agentFetch(url, options, printAgent, attemptedBase) {
  try {
    return await fetch(url, options);
  } catch (e) {
    throw explainFetchFailure(e, attemptedBase);
  }
}

/**
 * @param {object} printAgent
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
export async function postLocalAgentPrint(printAgent, payload) {
  const attemptedBase = resolvePrintAgentFetchBase(printAgent);
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
  const res = await agentFetch(
    `${attemptedBase}/print`,
    {
      method: 'POST',
      headers: agentHeaders(printAgent, true),
      body: JSON.stringify(body),
    },
    printAgent,
    attemptedBase
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Agente de impresión (${res.status})`);
  }
  return data;
}

export async function fetchAgentPrinters(printAgent) {
  const attemptedBase = resolvePrintAgentFetchBase(printAgent);
  const res = await agentFetch(
    `${attemptedBase}/printers`,
    { method: 'GET', headers: agentHeaders(printAgent, false) },
    printAgent,
    attemptedBase
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `No se listaron impresoras (${res.status})`);
  }
  return Array.isArray(data.printers) ? data.printers : [];
}

export async function fetchAgentStatus(printAgent) {
  const attemptedBase = resolvePrintAgentFetchBase(printAgent);
  const res = await agentFetch(
    `${attemptedBase}/status`,
    { method: 'GET', headers: agentHeaders(printAgent, false) },
    printAgent,
    attemptedBase
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Estado del agente (${res.status})`);
  }
  return data;
}

export async function probeAgentTcp(printAgent, ip, port = 9100) {
  const attemptedBase = resolvePrintAgentFetchBase(printAgent);
  const p = Math.min(65535, Math.max(1, Number(port) || 9100));
  const ipS = String(ip || '').trim();
  const qs = new URLSearchParams({ ip_address: ipS, port: String(p) }).toString();
  /** GET evita 405 en algunos proxies que no reenvían POST correctamente bajo /print-agent. */
  let res = await agentFetch(
    `${attemptedBase}/probe?${qs}`,
    { method: 'GET', headers: agentHeaders(printAgent, false) },
    printAgent,
    attemptedBase
  );
  if (res.status === 405 || res.status === 404) {
    res = await agentFetch(
      `${attemptedBase}/probe`,
      {
        method: 'POST',
        headers: agentHeaders(printAgent, true),
        body: JSON.stringify({ ip_address: ipS, port: p }),
      },
      printAgent,
      attemptedBase
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint =
      res.status === 405
        ? ' (405: el navegador o el hosting no acepta esta ruta; use npm run dev con proxy /print-agent o abra la app por http:// en la red del local.)'
        : '';
    throw new Error((data?.error || `Sondeo TCP (${res.status})`) + hint);
  }
  return data;
}

export async function probeLocalAgent(printAgent) {
  const attemptedBase = resolvePrintAgentFetchBase(printAgent);
  try {
    const res = await agentFetch(
      `${attemptedBase}/health`,
      { method: 'GET', headers: agentHeaders(printAgent, false) },
      printAgent,
      attemptedBase
    );
    return res.ok;
  } catch {
    return false;
  }
}
