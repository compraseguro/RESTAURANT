'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

function sendRawTcp(host, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (_) {}
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(15000);
    socket.once('error', (e) => finish(e));
    socket.once('timeout', () => finish(new Error('Tiempo de espera al contactar la impresora (TCP)')));
    socket.once('connect', () => {
      socket.write(payload, (err) => {
        if (err) return finish(err);
        socket.end();
      });
    });
    socket.once('close', () => finish());
  });
}

async function sendUsbSerial(comPort, baudRate, payload) {
  let SerialPort;
  try {
    // eslint-disable-next-line global-require
    ({ SerialPort } = require('serialport'));
  } catch (e) {
    throw new Error('Paquete serialport no instalado. Ejecute npm install en print-microservice.');
  }
  const portPath = normalizeComPort(comPort);
  const baud = Math.min(921600, Math.max(1200, Number(baudRate) || 9600));
  return new Promise((resolve, reject) => {
    const sp = new SerialPort({ path: portPath, baudRate: baud, autoOpen: false });
    sp.open((err) => {
      if (err) return reject(err);
      sp.write(payload, (werr) => {
        if (werr) {
          sp.close(() => reject(werr));
          return;
        }
        sp.drain((derr) => {
          sp.close((cerr) => {
            if (derr) return reject(derr);
            if (cerr) return reject(cerr);
            resolve();
          });
        });
      });
    });
  });
}

function normalizeComPort(s) {
  const t = String(s || '').trim();
  if (!t) return t;
  const m = /^COM(\d+)$/i.exec(t);
  if (m && Number(m[1]) >= 10) {
    return `\\\\.\\COM${m[1]}`;
  }
  return t.toUpperCase().startsWith('COM') ? t.toUpperCase() : t;
}

async function sendWindowsRawPrinter(printerName, payload) {
  if (process.platform !== 'win32') {
    throw new Error('Impresora Windows (RAW) solo esta disponible en Windows');
  }
  const safeName = String(printerName || '').trim();
  if (!safeName || safeName.length > 260) {
    throw new Error('Nombre de impresora invalido');
  }
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `resto-fadey-print-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  await fs.promises.writeFile(tmpFile, payload);
  const ps1 = path.join(__dirname, 'raw-windows-print.ps1');
  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        ps1,
        '-PrinterName',
        safeName,
        '-BinaryPath',
        tmpFile,
      ],
      { timeout: 45000, windowsHide: true, maxBuffer: 1024 * 1024 }
    );
  } catch (e) {
    const msg = (e.stderr && String(e.stderr)) || e.message || 'Error al enviar RAW a la impresora Windows';
    throw new Error(msg.trim());
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

module.exports = { sendRawTcp, sendUsbSerial, sendWindowsRawPrinter, normalizeComPort };
