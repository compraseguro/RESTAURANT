const net = require('net');
const { loadConfig } = require('./printerConfig');
const { buildTicket } = require('./escposBuilder');

let printerLib = null;
try {
  // eslint-disable-next-line global-require
  printerLib = require('printer');
} catch (_) {
  printerLib = null;
}

function isValidIp(value) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(value || '').trim());
}

function printUsb(printerName, buffer) {
  if (!printerName) {
    throw new Error('impresora no encontrada: nombre USB vacío');
  }
  if (!printerLib || typeof printerLib.printDirect !== 'function') {
    throw new Error('módulo "printer" no disponible en este entorno');
  }
  return new Promise((resolve, reject) => {
    printerLib.printDirect({
      data: buffer,
      printer: printerName,
      type: 'RAW',
      options: { interface: `printer:${printerName}` },
      success() { resolve({ ok: true }); },
      error(err) { reject(err); },
    });
  });
}

function printRed(ip, port, buffer) {
  const host = String(ip || '').trim();
  const safePort = Number(port || 9100);
  if (!isValidIp(host)) {
    throw new Error(`IP inválida: ${host}`);
  }
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);
    socket.connect(safePort, host, () => {
      socket.write(buffer);
      socket.end();
    });
    socket.on('error', (err) => {
      reject(new Error(`error de conexión: ${err.message}`));
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('error de conexión: timeout'));
    });
    socket.on('close', () => resolve({ ok: true }));
  });
}

async function print(moduleName, data = {}) {
  const moduleKey = String(moduleName || '').toLowerCase();
  if (!['caja', 'cocina', 'bar'].includes(moduleKey)) {
    throw new Error('módulo inválido para impresión');
  }
  const cfg = loadConfig();
  const moduleCfg = cfg[moduleKey];
  const ticket = buildTicket(moduleKey, data);

  if (moduleCfg.tipo === 'usb') {
    await printUsb(moduleCfg.nombre, ticket);
    return { ok: true, via: 'usb', module: moduleKey };
  }
  await printRed(moduleCfg.ip, moduleCfg.puerto, ticket);
  return { ok: true, via: 'red', module: moduleKey };
}

module.exports = { print, isValidIp };
