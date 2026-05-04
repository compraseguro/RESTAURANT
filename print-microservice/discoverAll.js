'use strict';

/**
 * Descubrimiento unificado: red LAN + COM + colas Windows (sin duplicar lógica en el cliente).
 */
const { listWindowsPrinters, listSerialPorts } = require('./winEnumerate');

function dedupeById(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const id = it.id || `${it.kind}:${it.label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

/** Ethernet/IP antes que USB: más estable con varios POS y menos cortes en hora punta. */
const KIND_PRIORITY = { lan: 0, usb_windows: 1, usb_serial: 2 };

function sortMergedRestaurant(items) {
  return [...items].sort((a, b) => {
    const pa = KIND_PRIORITY[a.kind] ?? 9;
    const pb = KIND_PRIORITY[b.kind] ?? 9;
    if (pa !== pb) return pa - pb;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });
}

/**
 * @returns {Promise<object>}
 */
async function discoverAll(opts = {}) {
  const timeout = Math.min(1200, Math.max(250, Number(opts.timeout) || 380));
  const errors = [];
  const merged = [];

  const lanP = (async () => {
    try {
      const { scanLan } = require('./discoverLan');
      return await scanLan({ timeout, ports: opts.ports });
    } catch (e) {
      errors.push({ scope: 'lan', message: e?.message || String(e) });
      return { candidates: [], subnets: [], scanned_ports: [] };
    }
  })();

  const [lanResult, serResult, winResult] = await Promise.all([
    lanP,
    listSerialPorts(),
    listWindowsPrinters(),
  ]);

  if (!serResult.ok && serResult.error) {
    errors.push({ scope: 'usb_serial', message: serResult.error });
  }
  if (!winResult.ok && winResult.error) {
    errors.push({ scope: 'windows', message: winResult.error });
  }

  for (const c of lanResult.candidates || []) {
    merged.push({
      id: `lan:${c.ip}:${c.port}`,
      kind: 'lan',
      label: `Red ${c.ip}:${c.port} (RAW TCP)`,
      ip: c.ip,
      port: c.port,
      escpos: true,
    });
  }

  for (const com of serResult.ports || []) {
    merged.push({
      id: `serial:${com}`,
      kind: 'usb_serial',
      label: `USB/Serie ${com}`,
      com_port: com,
      escpos: true,
    });
  }

  for (const name of winResult.printers || []) {
    merged.push({
      id: `win:${name}`,
      kind: 'usb_windows',
      label: `Windows «${name}»`,
      windows_printer: name,
      escpos: true,
      note: 'Impresora instalada en Windows (RAW)',
    });
  }

  const mergedDeduped = sortMergedRestaurant(dedupeById(merged));

  return {
    ok: true,
    lan: {
      subnets: lanResult.subnets || [],
      candidates: lanResult.candidates || [],
      local_ips: lanResult.local_ips || [],
      timeout_ms: lanResult.timeout_ms,
    },
    usb_serial: { ports: serResult.ports || [], hint: serResult.hint },
    windows: { printers: winResult.printers || [] },
    merged: mergedDeduped,
    errors,
    generated_at: new Date().toISOString(),
    network_hints: [
      'Prioridad: Ethernet/IP sobre USB cuando exista — mejor para restaurantes y varias terminales POS.',
      'Configure IP estática en la térmica o reserva DHCP en el router para que la IP no cambie tras reinicios.',
      'Térmicas ESC/POS por red (HPRT O-Series, Epson, XPrinter, Rongta, Star): suele usarse puerto RAW 9100.',
    ],
  };
}

module.exports = { discoverAll };
