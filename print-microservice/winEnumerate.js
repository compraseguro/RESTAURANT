'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function listWindowsPrinters() {
  if (process.platform !== 'win32') {
    return { ok: true, printers: [] };
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
    return { ok: false, printers: [], error: e?.message };
  }
}

async function listSerialPorts() {
  if (process.platform !== 'win32') {
    return { ok: true, ports: [], hint: 'Linux/Mac: indique /dev/ttyUSB0 manualmente.' };
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$p = [System.IO.Ports.SerialPort]::GetPortNames(); if ($null -eq $p -or @($p).Count -eq 0) { "[]" } else { @($p) | Sort-Object | ConvertTo-Json -Compress }',
      ],
      { timeout: 15000, windowsHide: true, maxBuffer: 512 * 1024 }
    );
    const t = String(stdout || '').trim();
    let raw = [];
    try {
      const parsed = JSON.parse(t || '[]');
      raw = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      raw = t ? [t] : [];
    }
    raw = raw.map((x) => String(x || '').trim()).filter(Boolean);
    const ports = raw
      .filter((p) => /^COM\d+$/i.test(String(p).trim()))
      .map((p) => {
        const m = /^COM(\d+)$/i.exec(String(p).trim());
        return m ? `COM${m[1]}` : String(p).trim();
      });
    const uniq = [...new Set(ports)].sort((a, b) => {
      const na = Number(/^COM(\d+)$/i.exec(a)?.[1] || 0);
      const nb = Number(/^COM(\d+)$/i.exec(b)?.[1] || 0);
      return na - nb;
    });
    return { ok: true, ports: uniq };
  } catch (e) {
    return { ok: false, ports: [], error: e?.message };
  }
}

module.exports = { listWindowsPrinters, listSerialPorts };
