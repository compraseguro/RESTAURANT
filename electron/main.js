const fs = require('fs');
const path = require('path');
const net = require('net');
const { app, BrowserWindow, ipcMain } = require('electron');
const { buildTicket } = require('../server/printing/escposBuilder');

const MODULE_KEYS = ['caja', 'cocina', 'bar'];
let mainWindow = null;

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
  if (!win) {
    console.warn('[electron-printing] getPrinters sin ventana; devolviendo lista vacía');
    return [];
  }
  try {
    const raw = await win.webContents.getPrintersAsync();
    const list = (raw || [])
      .map((p) => ({ name: String(p?.name || '').trim() }))
      .filter((p) => p.name);
    console.log(`[electron-printing] impresoras detectadas (Electron): ${list.length}`);
    return list;
  } catch (err) {
    console.error('[electron-printing] error getPrintersAsync:', err.message || err);
    return [];
  }
}

function printUSB(printerName, buffer) {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('no hay ventana principal para imprimir');
  return new Promise((resolve, reject) => {
    const html = `<pre style="font-family: monospace; white-space: pre;">${buffer.toString('utf8')}</pre>`;
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
  const ticket = buildTicket(key, payload, { paperWidth: cfg.paperWidth || 80 });
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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const localHtml = path.join(__dirname, '..', 'client', 'dist', 'index.html');
    mainWindow.loadFile(localHtml);
  }
}

function registerPrintingIpc() {
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
      title: 'TEST RESTO FADEY',
      text: `Módulo: ${label}\n${new Date().toLocaleString('es-PE')}`,
    });
  });
  ipcMain.handle('printing:printModule', async (_event, moduleKey, payload) => printByModule(moduleKey, payload || {}));
}

app.whenReady().then(() => {
  console.log('[electron] proceso main iniciado');
  registerPrintingIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
