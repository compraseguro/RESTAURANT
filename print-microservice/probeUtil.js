'use strict';

const net = require('net');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

function tryTcpConnect(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        /* */
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** ICMP opcional (Windows: ping). Devuelve true si hay respuesta. */
async function icmpPing(host, timeoutMs = 1500) {
  const h = String(host || '').trim();
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) return null;
  if (process.platform === 'win32') {
    try {
      await execFileAsync('ping', ['-n', '1', '-w', String(timeoutMs), h], {
        timeout: timeoutMs + 500,
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  }
  try {
    await execFileAsync('ping', ['-c', '1', '-W', String(Math.ceil(timeoutMs / 1000)), h], {
      timeout: timeoutMs + 500,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ ip: string, port?: number, ping?: boolean }} opts
 */
async function probeLanPrinter(opts) {
  const ip = String(opts?.ip || '').trim();
  const port = Math.min(65535, Math.max(1, Number(opts?.port || 9100) || 9100));
  const doPing = opts?.ping !== false;
  const tcpOk = await tryTcpConnect(ip, port, Number(opts?.tcpTimeoutMs) || 900);
  let pingOk = null;
  if (doPing) {
    pingOk = await icmpPing(ip, 1200);
  }
  let status = 'offline';
  if (tcpOk) status = 'connected';
  else if (pingOk === true) status = 'reachable_ping_only';
  else if (pingOk === false) status = 'offline';
  return {
    ok: tcpOk,
    status,
    tcp: tcpOk,
    ping: pingOk,
    ip,
    port,
  };
}

module.exports = { tryTcpConnect, icmpPing, probeLanPrinter };
