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
    socket.once('timeout', () => finish(new Error('Timeout TCP hacia la impresora')));
    socket.once('connect', () => {
      socket.write(payload, (err) => {
        if (err) return finish(err);
        socket.end();
      });
    });
    socket.once('close', () => finish());
  });
}

async function sendWindowsRawPrinter(printerName, payload) {
  if (process.platform !== 'win32') {
    throw new Error('Impresora USB (cola Windows) solo en Windows');
  }
  const safeName = String(printerName || '').trim();
  if (!safeName || safeName.length > 260) {
    throw new Error('Nombre de impresora inválido');
  }
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `fadey-print-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  await fs.promises.writeFile(tmpFile, payload);
  const ps1 = path.join(__dirname, 'raw-windows-print.ps1');
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-PrinterName', safeName, '-BinaryPath', tmpFile],
      { timeout: 45000, windowsHide: true, maxBuffer: 1024 * 1024 }
    );
  } catch (e) {
    const msg = (e.stderr && String(e.stderr)) || e.message || 'Error RAW Windows';
    throw new Error(String(msg).trim());
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}

module.exports = { sendRawTcp, sendWindowsRawPrinter };
