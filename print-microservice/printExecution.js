'use strict';

/**
 * Ejecución ESC/POS única (sin cola). Usado por la cola y por pruebas.
 */
const { buildEscPosBuffer } = require('./escpos');
const { sendRawTcp, sendUsbSerial, sendWindowsRawPrinter } = require('./sendOutput');

/** Quita campos internos del cliente/cola antes de imprimir o deduplicar. */
function sanitizePrintBody(body) {
  if (!body || typeof body !== 'object') return body;
  const b = { ...body };
  delete b._skipDedupe;
  delete b._persistJobId;
  return b;
}

function isAllowedPrinterHost(ip) {
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

function isValidComPort(s) {
  const t = String(s || '').trim();
  if (!/^COM\d+$/i.test(t)) return false;
  const n = Number(/^COM(\d+)$/i.exec(t)[1]);
  return n >= 1 && n <= 256;
}

function isValidUnixSerial(s) {
  const t = String(s || '').trim();
  return /^\/dev\/(ttyUSB|ttyACM|tty\.usb|cu\.)\w+/i.test(t) && t.length < 200;
}

function routeKeyFromBody(bodyIn) {
  const body = sanitizePrintBody(bodyIn);
  let connection = String(body?.connection || '').toLowerCase().trim();
  const ip = String(body?.ip || '').trim();
  const tcpPort = Math.min(65535, Math.max(1, Number(body?.port || 9100) || 9100));
  const comPort = String(body?.com_port || body?.comPort || '').trim();
  const windowsPrinter = String(body?.windows_printer || body?.windowsPrinter || '').trim();

  if (!connection) {
    if (isAllowedPrinterHost(ip)) connection = 'lan';
    else if (isValidComPort(comPort) || isValidUnixSerial(comPort)) connection = 'usb_serial';
    else if (windowsPrinter) connection = 'usb_windows';
    else connection = 'lan';
  }
  if (connection === 'lan') return `lan:${ip}:${tcpPort}`;
  if (connection === 'usb_serial') return `serial:${comPort}`;
  if (connection === 'usb_windows') return `win:${windowsPrinter}`;
  return `unk:${JSON.stringify(body).slice(0, 80)}`;
}

/**
 * @returns {Promise<{ via: string }>}
 */
async function executePrintJob(bodyIn) {
  const body = sanitizePrintBody(bodyIn);
  const text = String(body?.text || '').trim();
  const copies = Math.min(5, Math.max(1, Number(body?.copies || 1) || 1));
  const paper = [58, 80].includes(Number(body?.paper_width_mm)) ? Number(body.paper_width_mm) : 80;
  const openDrawer = Boolean(body?.open_cash_drawer);

  if (!text || text.length > 24000) {
    throw new Error('Texto de ticket vacío o demasiado largo');
  }

  let connection = String(body?.connection || '').toLowerCase().trim();
  const ip = String(body?.ip || '').trim();
  const tcpPort = Math.min(65535, Math.max(1, Number(body?.port || 9100) || 9100));
  const comPort = String(body?.com_port || body?.comPort || '').trim();
  const baudRate = Math.min(921600, Math.max(1200, Number(body?.baud_rate || body?.baudRate || 9600) || 9600));
  const windowsPrinter = String(body?.windows_printer || body?.windowsPrinter || '').trim();

  if (!connection) {
    if (isAllowedPrinterHost(ip)) connection = 'lan';
    else if (isValidComPort(comPort) || isValidUnixSerial(comPort)) connection = 'usb_serial';
    else if (windowsPrinter) connection = 'usb_windows';
    else connection = 'lan';
  }

  const payload = buildEscPosBuffer(text, copies, paper, { open_cash_drawer: openDrawer });

  if (connection === 'lan') {
    if (!isAllowedPrinterHost(ip)) {
      throw new Error('IP no permitida o vacía (use red local o 127.0.0.1)');
    }
    await sendRawTcp(ip, tcpPort, payload);
    return { via: 'tcp' };
  }

  if (connection === 'usb_serial') {
    if (!isValidComPort(comPort) && !isValidUnixSerial(comPort)) {
      throw new Error('Puerto serie inválido. Use COM1…COM256 (Windows) o /dev/ttyUSB0 (Linux)');
    }
    await sendUsbSerial(comPort, baudRate, payload);
    return { via: 'usb_serial' };
  }

  if (connection === 'usb_windows') {
    if (!windowsPrinter) {
      throw new Error('Indique el nombre exacto de la impresora en Windows');
    }
    await sendWindowsRawPrinter(windowsPrinter, payload);
    return { via: 'usb_windows' };
  }

  throw new Error('connection debe ser lan, usb_serial o usb_windows');
}

module.exports = {
  executePrintJob,
  routeKeyFromBody,
  sanitizePrintBody,
  isAllowedPrinterHost,
  isValidComPort,
  isValidUnixSerial,
};
