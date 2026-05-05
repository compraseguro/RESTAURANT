const net = require('net');
const fs = require('fs');

function sendTcp(host, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) || 9100 }, () => {
      socket.write(buffer, (err) => {
        if (err) {
          socket.destroy();
          return reject(err);
        }
        socket.end();
      });
    });
    socket.setTimeout(15000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout de red hacia impresora'));
    });
    socket.on('error', reject);
    socket.on('close', () => resolve());
  });
}

/**
 * Ruta UNC Windows (ej. \\\\localhost\\NombreImpresora) o ruta de dispositivo.
 */
function sendUnc(uncPath, buffer) {
  return new Promise((resolve, reject) => {
    fs.open(uncPath, 'w', (err, fd) => {
      if (err) return reject(err);
      fs.write(fd, buffer, 0, buffer.length, 0, (wErr) => {
        fs.close(fd, () => {
          if (wErr) reject(wErr);
          else resolve();
        });
      });
    });
  });
}

async function sendToBinding(binding, buffer) {
  if (!binding || typeof binding !== 'object') {
    throw new Error('Sin enlace de impresora (bindings en config.json)');
  }
  const t = String(binding.transport || 'tcp').toLowerCase();
  if (t === 'tcp' || t === 'lan' || t === 'network') {
    const host = String(binding.host || binding.ip || '').trim();
    const port = Number(binding.port || 9100);
    if (!host) throw new Error('Falta host/IP de impresora');
    return sendTcp(host, port, buffer);
  }
  if (t === 'unc' || t === 'windows' || t === 'share') {
    const unc = String(binding.unc || binding.share || '').trim();
    if (!unc) throw new Error('Falta ruta UNC de impresora');
    return sendUnc(unc, buffer);
  }
  throw new Error(`Transporte no soportado: ${t}`);
}

module.exports = { sendToBinding, sendTcp, sendUnc };
