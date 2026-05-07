const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { buildTicket } = require('../server/printing/escposBuilder');

const MODULE_KEYS = ['caja', 'cocina', 'bar'];
const LOCAL_ASSISTANT_PORT = Number(process.env.RESTO_ASSISTANT_PORT || 3001);
let mainWindow = null; // Ventana oculta auxiliar para APIs de impresión del sistema.
let tray = null;
let localServer = null;
let printerLib = null;
try {
  // Fallback nativo RAW si el módulo está disponible en esa instalación.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  printerLib = require('printer');
  console.log('[electron-printing] módulo "printer" cargado');
} catch (err) {
  console.warn('[electron-printing] módulo "printer" no disponible, se usarán fallbacks');
}

function isValidIp(value) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(value || '').trim());
}

function configPath() {
  return path.join(app.getPath('userData'), 'printer-config.json');
}

function defaultConfig() {
  return {
    caja: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, paperWidth: 80 },
    cocina: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, paperWidth: 80 },
    bar: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, paperWidth: 80 },
  };
}

function normalizeModule(raw = {}, moduleKey) {
  const tipo = String(raw.tipo || 'usb').toLowerCase() === 'red' ? 'red' : 'usb';
  const paper = Number(raw.paperWidth ?? raw.anchoPapel ?? 80) === 58 ? 58 : 80;
  const puerto = Number(raw.puerto ?? 9100);
  return {
    tipo,
    nombre: String(raw.nombre || '').trim(),
    ip: tipo === 'usb' ? '' : String(raw.ip || '').trim(),
    puerto: Number.isFinite(puerto) && puerto > 0 && puerto <= 65535 ? puerto : 9100,
    autoPrint: moduleKey === 'caja' ? true : Boolean(raw.autoPrint ?? true),
    paperWidth: paper,
    anchoPapel: paper,
  };
}

function normalizeConfig(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    caja: normalizeModule(src.caja, 'caja'),
    cocina: normalizeModule(src.cocina, 'cocina'),
    bar: normalizeModule(src.bar, 'bar'),
  };
}

function ensureConfigFile() {
  const p = configPath();
  if (!fs.existsSync(p)) {
    const cfg = normalizeConfig(defaultConfig());
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
    console.log(`[electron-printing] config creada: ${p}`);
  }
}

function loadConfig() {
  try {
    ensureConfigFile();
    const p = configPath();
    const raw = fs.readFileSync(p, 'utf8');
    const cfg = normalizeConfig(JSON.parse(raw));
    console.log(`[electron-printing] config cargada: ${p}`);
    return cfg;
  } catch (err) {
    console.error('[electron-printing] error leyendo config:', err.message || err);
    const cfg = normalizeConfig(defaultConfig());
    try {
      fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
    } catch (_) {
      // noop
    }
    return cfg;
  }
}

function saveConfig(input) {
  const current = loadConfig();
  const incoming = input && typeof input === 'object' ? input : {};
  const merged = {
    caja: { ...current.caja, ...(incoming.caja || {}) },
    cocina: { ...current.cocina, ...(incoming.cocina || {}) },
    bar: { ...current.bar, ...(incoming.bar || {}) },
  };
  const normalized = normalizeConfig(merged);
  MODULE_KEYS
    .filter((k) => Object.prototype.hasOwnProperty.call(incoming, k))
    .forEach((k) => {
      const cfg = normalized[k];
      if (cfg.tipo === 'usb') {
        if (!cfg.nombre) throw new Error(`Seleccione impresora USB en ${k}`);
      } else {
        if (!isValidIp(cfg.ip)) throw new Error(`IP inválida en ${k}`);
      }
    });
  fs.writeFileSync(configPath(), JSON.stringify(normalized, null, 2), 'utf8');
  console.log('[electron-printing] config guardada');
  return normalized;
}

async function getPrinters() {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  const fromPrinterModule = () => {
    if (!printerLib || typeof printerLib.getPrinters !== 'function') return [];
    try {
      const list = (printerLib.getPrinters() || [])
        .map((p) => ({ name: String(p?.name || '').trim() }))
        .filter((p) => p.name);
      if (list.length) {
        console.log(`[electron-printing] impresoras detectadas (printer): ${list.length}`);
      }
      return list;
    } catch (err) {
      console.error('[electron-printing] error printer.getPrinters:', err.message || err);
      return [];
    }
  };
  const fromElectron = async () => {
    if (!win || typeof win.webContents?.getPrintersAsync !== 'function') {
      return [];
    }
    try {
      const raw = await win.webContents.getPrintersAsync();
      const list = (raw || [])
        .map((p) => ({ name: String(p?.name || '').trim() }))
        .filter((p) => p.name);
      if (list.length) {
        console.log(`[electron-printing] impresoras detectadas (Electron): ${list.length}`);
      }
      return list;
    } catch (err) {
      console.error('[electron-printing] error getPrintersAsync:', err.message || err);
      return [];
    }
  };

  const fromWindowsPowerShell = () => new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);
    const ps = 'Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress';
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          console.error('[electron-printing] error PowerShell Get-Printer:', err.message || err);
          return resolve([]);
        }
        try {
          const parsed = JSON.parse(String(stdout || '').trim() || '[]');
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const list = arr
            .map((name) => ({ name: String(name || '').trim() }))
            .filter((p) => p.name);
          if (list.length) {
            console.log(`[electron-printing] impresoras detectadas (PowerShell): ${list.length}`);
          }
          resolve(list);
        } catch (parseErr) {
          console.error('[electron-printing] JSON inválido de Get-Printer:', parseErr.message || parseErr);
          resolve([]);
        }
      },
    );
  });

  const first = fromPrinterModule();
  if (first.length) return first;
  const second = await fromElectron();
  if (second.length) return second;
  const third = await fromWindowsPowerShell();
  if (third.length) return third;
  if (!win) {
    console.warn('[electron-printing] getPrinters sin ventana y sin datos PowerShell');
  } else {
    console.warn('[electron-printing] no se detectaron impresoras por printer, Electron ni PowerShell');
  }
  return [];
}

function getNetworkPrintersFromWindows() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve([]);
    const ps = [
      '$printers = Get-Printer | Select-Object Name,PortName',
      '$ports = Get-PrinterPort | Select-Object Name,PrinterHostAddress,HostAddress,PortNumber',
      '$result = @()',
      'foreach($p in $printers){',
      '  $port = $ports | Where-Object { $_.Name -eq $p.PortName } | Select-Object -First 1',
      '  if($port){',
      '    $ip = $port.PrinterHostAddress',
      '    if(-not $ip){ $ip = $port.HostAddress }',
      '    if($ip){',
      '      $result += [pscustomobject]@{',
      '        name = $p.Name',
      '        ip = $ip',
      '        port = [int]($port.PortNumber)',
      '        portName = $p.PortName',
      '      }',
      '    }',
      '  }',
      '}',
      '$result | ConvertTo-Json -Compress',
    ].join('; ');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, timeout: 6000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          console.error('[electron-printing] error Get-PrinterPort:', err.message || err);
          return resolve([]);
        }
        try {
          const parsed = JSON.parse(String(stdout || '').trim() || '[]');
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const list = arr
            .map((it) => ({
              name: String(it?.name || '').trim(),
              ip: String(it?.ip || '').trim(),
              port: Number(it?.port || 9100),
              portName: String(it?.portName || '').trim(),
            }))
            .filter((it) => isValidIp(it.ip) && Number.isFinite(it.port) && it.port > 0 && it.port <= 65535);
          console.log(`[electron-printing] impresoras de red detectadas (Windows): ${list.length}`);
          resolve(list);
        } catch (parseErr) {
          console.error('[electron-printing] JSON inválido Get-PrinterPort:', parseErr.message || parseErr);
          resolve([]);
        }
      },
    );
  });
}

function escPosBufferToHtmlSafeText(buffer) {
  let s = Buffer.from(buffer || []).toString('latin1');
  /** Inicial ESC @: al quitar ESC queda «@» en impresión por GDI. */
  s = s.replace(/^\x1B@/, '');
  /** Corte GS V (p. ej. \\x1D\\x56\\x41): bytes imprimibles quedan como «VA». */
  s = s.replace(/[\r\n\x1A]*\x1D\x56[\x00\x01\x30\x31\x41][\s\S]*$/g, '');
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function printUSB(printerName, buffer) {
  if (printerLib && typeof printerLib.printDirect === 'function') {
    return new Promise((resolve, reject) => {
      try {
        printerLib.printDirect({
          data: buffer,
          printer: String(printerName || '').trim(),
          type: 'RAW',
          success: () => resolve({ ok: true }),
          error: (err) => reject(new Error(err?.message || String(err || 'Error al imprimir RAW'))),
        });
      } catch (err) {
        reject(new Error(err?.message || 'Error al imprimir RAW'));
      }
    });
  }
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('no hay ventana principal para imprimir');
  return new Promise((resolve, reject) => {
    const safeText = escPosBufferToHtmlSafeText(buffer) || '—';
    const html = `<pre style="font-family: Consolas, monospace; white-space: pre; margin: 0; font-size: 12px;">${safeText}</pre>`;
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true },
    });
    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    printWin.webContents.on('did-finish-load', () => {
      printWin.webContents.print(
        { silent: true, deviceName: printerName, printBackground: false },
        (success, failureReason) => {
          if (!success) {
            console.error('[electron-printing] fallo print (USB):', failureReason);
            reject(new Error(failureReason || 'Error al imprimir'));
          } else {
            resolve({ ok: true });
          }
          printWin.close();
        },
      );
    });
  });
}

function printNetwork(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.connect(Number(port || 9100), String(ip || '').trim(), () => {
      socket.write(buffer);
      socket.end();
    });
    socket.on('error', (err) => reject(new Error(`error de conexión: ${err.message}`)));
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('error de conexión: timeout'));
    });
    socket.on('close', () => resolve({ ok: true }));
  });
}

async function printByModule(moduleKey, payload = {}) {
  const key = String(moduleKey || '').toLowerCase();
  if (!MODULE_KEYS.includes(key)) throw new Error('módulo inválido');
  const cfg = loadConfig()[key];
  const ticket = await buildTicket(key, payload, { paperWidth: cfg.paperWidth || 80 });
  if (cfg.tipo === 'usb') {
    if (!cfg.nombre) throw new Error(`impresora USB no configurada en ${key}`);
    console.log(`[electron-printing] imprimir ${key} usb (Electron driver): ${cfg.nombre}`);
    return printUSB(cfg.nombre, ticket);
  }
  if (!isValidIp(cfg.ip)) throw new Error(`IP inválida en ${key}`);
  console.log(`[electron-printing] imprimir ${key} red: ${cfg.ip}:${cfg.puerto}`);
  return printNetwork(cfg.ip, cfg.puerto, ticket);
}

async function printerStatus(moduleKey) {
  const key = String(moduleKey || '').toLowerCase();
  if (!MODULE_KEYS.includes(key)) throw new Error('módulo inválido');
  const cfg = loadConfig()[key];
  if (cfg.tipo === 'usb') {
    const connected = (await getPrinters()).some((p) => p.name === cfg.nombre);
    return { status: connected ? 'Conectada' : 'No disponible', connected, tipo: 'usb', module: key };
  }
  const connected = await new Promise((resolve) => {
    if (!isValidIp(cfg.ip)) return resolve(false);
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (_) { /* noop */ }
      resolve(ok);
    };
    socket.setTimeout(3000);
    socket.connect(Number(cfg.puerto || 9100), cfg.ip, () => finish(true));
    socket.on('error', () => finish(false));
    socket.on('timeout', () => finish(false));
  });
  return { status: connected ? 'Conectada' : 'No disponible', connected, tipo: 'red', module: key };
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const preloadPath = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath,
    },
  });
  mainWindow.on('close', (e) => {
    // Asistente en segundo plano: no cerrar al hacer "X".
    if (app.isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });
  mainWindow.loadURL('about:blank');
  return mainWindow;
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, '..', 'client', 'public', 'icon-192.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Resto FADEY - Asistente de impresión');
  const menu = Menu.buildFromTemplate([
    { label: 'Asistente activo (127.0.0.1:3001)', enabled: false },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true;
        try {
          if (localServer) localServer.close();
        } catch (_) {
          // noop
        }
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createLocalAssistantServer() {
  const assistant = express();
  assistant.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));
  assistant.use(express.json({ limit: '2mb' }));

  assistant.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'assistant' }));
  assistant.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: 'assistant' }));
  assistant.get('/api/printers', async (_req, res) => {
    try {
      const list = await getPrinters();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err?.message || 'No se pudo obtener impresoras' });
    }
  });
  assistant.get('/api/printing/config', (_req, res) => {
    try {
      res.json(loadConfig());
    } catch (err) {
      res.status(500).json({ error: err?.message || 'No se pudo leer configuración' });
    }
  });
  assistant.get('/api/printing/network-printers', async (_req, res) => {
    try {
      const list = await getNetworkPrintersFromWindows();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err?.message || 'No se pudo detectar impresoras de red' });
    }
  });
  assistant.put('/api/printing/config', (req, res) => {
    try {
      res.json(saveConfig(req.body || {}));
    } catch (err) {
      res.status(400).json({ error: err?.message || 'No se pudo guardar configuración' });
    }
  });
  assistant.get('/api/printing/status/:module', async (req, res) => {
    try {
      const status = await printerStatus(req.params.module);
      res.json(status);
    } catch (err) {
      res.status(400).json({ error: err?.message || 'No se pudo obtener estado' });
    }
  });
  assistant.post('/api/printing/test/:module', async (req, res) => {
    try {
      await printByModule(req.params.module, {
        title: 'PRUEBA DE IMPRESIÓN',
        text: `${String(req.params.module || '').toUpperCase()}\n${new Date().toLocaleString('es-PE')}`,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err?.message || 'No se pudo imprimir prueba' });
    }
  });
  assistant.post('/api/printing/print/:module', async (req, res) => {
    try {
      await printByModule(req.params.module, req.body || {});
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err?.message || 'No se pudo imprimir' });
    }
  });

  localServer = assistant.listen(LOCAL_ASSISTANT_PORT, '127.0.0.1', () => {
    console.log(`[electron] asistente de impresión activo en http://127.0.0.1:${LOCAL_ASSISTANT_PORT}`);
  });
  localServer.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(`[electron] puerto ${LOCAL_ASSISTANT_PORT} en uso. Cierre otra instancia del asistente.`);
      return;
    }
    console.error('[electron] error servidor asistente:', err?.message || err);
  });
}

function configureAutoStart() {
  if (process.platform !== 'win32') return;
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
    });
    console.log('[electron] inicio con Windows activado');
  } catch (err) {
    console.warn('[electron] no se pudo activar inicio con Windows:', err?.message || err);
  }
}

function registerPrintingIpc() {
  ipcMain.on('preload:ready', () => {
    console.log('[electron] IPC funcionando: preload:ready');
  });
  ipcMain.handle('printing:health', async () => ({ status: 'ok' }));
  ipcMain.handle('printing:getConfig', async () => loadConfig());
  ipcMain.handle('printing:saveConfig', async (_event, cfg) => saveConfig(cfg));
  ipcMain.handle('printing:getPrinters', async (_event, moduleKey = '') => {
    console.log(`[electron-printing] getPrinters solicitado por módulo: ${moduleKey || '-'}`);
    return getPrinters();
  });
  ipcMain.handle('printing:getStatus', async (_event, moduleKey) => printerStatus(moduleKey));
  ipcMain.handle('printing:printTest', async (_event, moduleKey) => {
    const label = moduleKey === 'caja' ? 'Caja' : moduleKey === 'cocina' ? 'Cocina' : 'Bar';
    return printByModule(moduleKey, {
      title: 'PRUEBA DE IMPRESIÓN',
      text: `${label}\n${new Date().toLocaleString('es-PE')}`,
    });
  });
  ipcMain.handle('printing:printModule', async (_event, moduleKey, payload) => printByModule(moduleKey, payload || {}));
}

app.whenReady().then(() => {
  console.log('[electron] proceso main iniciado');
  configureAutoStart();
  createWindow();
  createTray();
  createLocalAssistantServer();
  registerPrintingIpc();
  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // Mantener asistente en segundo plano.
  if (process.platform === 'darwin') app.dock?.hide();
});
