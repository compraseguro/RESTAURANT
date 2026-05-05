'use strict';

/**
 * Detección de impresoras: colas Windows (equivalente a listar instaladas) y escaneo LAN puerto RAW.
 * No usa paquete nativo `printer` para evitar compilación en deploy; lista vía PowerShell (Get-Printer).
 */
const net = require('net');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const DEFAULT_PORTS = [9100, 9101, 9102, 4000, 5000];

function isPrivateLanIp(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 127) return true;
  return false;
}

function isIpv4(addr) {
  return addr && (addr.family === 'IPv4' || addr.family === 4);
}

function getSubnetsToScan() {
  const ifaces = os.networkInterfaces();
  const prefixes = new Set();
  const localIps = new Set();
  for (const addrs of Object.values(ifaces)) {
    for (const addr of addrs || []) {
      if (!isIpv4(addr) || addr.internal) continue;
      if (!isPrivateLanIp(addr.address)) continue;
      localIps.add(addr.address);
      const parts = addr.address.split('.');
      if (parts.length !== 4) continue;
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
    }
  }
  return { prefixes: [...prefixes], localIps: [...localIps] };
}

function tryTcpPort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;
    const done = (ok) => {
      if (finished) return;
      finished = true;
      try {
        socket.destroy();
      } catch {
        /* */
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

/**
 * Impresoras USB / colas instaladas en Windows (nombres para RAW).
 */
async function getUSBPrinters() {
  if (process.platform !== 'win32') {
    return { ok: true, printers: [], hint: 'En Linux use CUPS o solo modo red.' };
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$n = @(Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name); if ($n.Count -eq 0) { "[]" } else { $n | ConvertTo-Json -Compress }',
      ],
      { timeout: 20000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
    );
    const t = String(stdout || '').trim();
    let names = [];
    try {
      const parsed = JSON.parse(t || '[]');
      names = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      names = t ? [t] : [];
    }
    names = names.map((x) => String(x || '').trim()).filter(Boolean);
    return { ok: true, printers: names };
  } catch (e) {
    return { ok: false, printers: [], error: e?.message || String(e) };
  }
}

/**
 * Escaneo de hosts en LAN con puertos térmicos abiertos.
 * @param {{ timeout?: number, ports?: number[] }} opts
 */
async function scanNetworkPrinters(opts = {}) {
  const timeoutMs = Math.min(2500, Math.max(120, Number(opts.timeout) || 400));
  const ports =
    Array.isArray(opts.ports) && opts.ports.length > 0
      ? [...new Set(opts.ports.map((p) => Math.min(65535, Math.max(1, Number(p)))).filter((n) => n > 0))]
      : DEFAULT_PORTS;

  const { prefixes, localIps } = getSubnetsToScan();
  if (!prefixes.length) {
    return {
      ok: true,
      subnets: [],
      candidates: [],
      timeout_ms: timeoutMs,
      hint: 'Sin interfaz IPv4 privada; conecte red o use IP manual.',
      local_ips: localIps,
    };
  }

  const tasks = [];
  for (const prefix of prefixes) {
    for (let h = 1; h <= 254; h++) {
      const ip = `${prefix}.${h}`;
      for (const port of ports) {
        tasks.push({ ip, port });
      }
    }
  }

  const concurrency = 88;
  const found = [];
  let ti = 0;

  async function worker() {
    for (;;) {
      const i = ti++;
      if (i >= tasks.length) break;
      const { ip, port } = tasks[i];
      const ok = await tryTcpPort(ip, port, timeoutMs);
      if (ok) found.push({ ip, port });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  found.sort((a, b) => {
    const c = a.ip.localeCompare(b.ip, undefined, { numeric: true });
    return c !== 0 ? c : a.port - b.port;
  });

  const dedup = [];
  const seen = new Set();
  for (const c of found) {
    const k = `${c.ip}:${c.port}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(c);
  }

  return {
    ok: true,
    subnets: prefixes.map((p) => `${p}.0/24`),
    scanned_ports: ports,
    candidates: dedup,
    timeout_ms: timeoutMs,
    local_ips: localIps,
  };
}

module.exports = { getUSBPrinters, scanNetworkPrinters, DEFAULT_PORTS };
