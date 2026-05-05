'use strict';

const { buildEscPosBuffer } = require('./escposBuilder');
const { sendRawTcp, sendWindowsRawPrinter } = require('./sendChannel');
const { getStationConfig, isStationReady } = require('./configManager');
const { logPrintEvent, logPrintError } = require('./printLogger');

const STATIONS = new Set(['caja', 'cocina', 'bar', 'delivery']);

function isAllowedLanIp(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * @param {string} station
 * @param {string} plainText
 * @param {{ copies?: number, openCashDrawer?: boolean, widthMm?: number }} options
 * @returns {Promise<{ ok: boolean, via?: string, error?: string }>}
 */
async function printToStation(station, plainText, options = {}) {
  const st = String(station || '').toLowerCase();
  if (!STATIONS.has(st)) {
    return { ok: false, error: 'Estación inválida' };
  }
  const text = String(plainText || '').trim();
  if (!text) {
    return { ok: false, error: 'Texto vacío' };
  }

  const cfg = getStationConfig(st);
  if (!isStationReady(cfg)) {
    logPrintError({ station: st, estado: 'sin_config', tipo: cfg.tipo });
    return { ok: false, error: 'Impresora no configurada para esta estación' };
  }

  const widthMm = [58, 80].includes(Number(options.widthMm ?? cfg.widthMm)) ? Number(options.widthMm ?? cfg.widthMm) : 80;
  const copies = Math.min(5, Math.max(1, Number(options.copies ?? cfg.copies) || 1));
  const openCashDrawer = Boolean(options.openCashDrawer);

  let buffer;
  try {
    buffer = buildEscPosBuffer(text, copies, widthMm, { openCashDrawer });
  } catch (e) {
    logPrintError({ station: st, estado: 'build_error', error: e.message });
    return { ok: false, error: e.message || 'Error ESC/POS' };
  }

  const tipo = String(cfg.tipo || 'red').toLowerCase();
  logPrintEvent({ station: st, tipo, estado: 'enviando', bytes: buffer.length });

  try {
    if (tipo === 'usb') {
      const name = String(cfg.nombre || '').trim();
      await sendWindowsRawPrinter(name, buffer);
      logPrintEvent({ station: st, tipo: 'usb', nombre: name, estado: 'ok' });
      return { ok: true, via: 'windows-raw' };
    }
    if (tipo === 'red') {
      const ip = String(cfg.ip || '').trim();
      const port = Math.min(65535, Math.max(1, Number(cfg.puerto || 9100) || 9100));
      if (!isAllowedLanIp(ip)) {
        throw new Error('IP no permitida o inválida');
      }
      await sendRawTcp(ip, port, buffer);
      logPrintEvent({ station: st, tipo: 'red', ip, port, estado: 'ok' });
      return { ok: true, via: 'tcp' };
    }
    return { ok: false, error: 'Tipo de impresora no soportado' };
  } catch (e) {
    const err = e?.message || String(e);
    logPrintError({ station: st, tipo, estado: 'fallo', error: err });
    return { ok: false, error: err };
  }
}

module.exports = { printToStation, STATIONS };
