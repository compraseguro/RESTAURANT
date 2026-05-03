/**
 * Envoltorio ligero para ejecutar el print-agent en segundo plano (Windows/macOS/Linux).
 * Uso: npm install electron --save-dev && npm run desktop
 * Inicio con Windows: acceso directo a "npm run desktop" en Inicio, o use node server.js con el mismo método.
 */
const { app, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let tray = null;
let childProc = null;

function startAgent() {
  if (childProc) return;
  const serverPath = path.join(__dirname, 'server.js');
  childProc = fork(serverPath, [], { stdio: 'inherit', env: { ...process.env } });
  childProc.on('exit', () => {
    childProc = null;
  });
}

function stopAgent() {
  if (childProc) {
    try {
      childProc.kill('SIGTERM');
    } catch (_) {}
    childProc = null;
  }
}

app.whenReady().then(() => {
  startAgent();
  try {
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    );
    tray = new Tray(icon);
    tray.setToolTip('RESTO-FADEY · Print Agent');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Reiniciar agente',
          click: () => {
            stopAgent();
            startAgent();
          },
        },
        { type: 'separator' },
        {
          label: 'Salir',
          click: () => {
            stopAgent();
            app.quit();
          },
        },
      ])
    );
  } catch (_) {
    /* Sin bandeja: el proceso sigue imprimiendo */
  }
});

app.on('before-quit', () => {
  stopAgent();
});
