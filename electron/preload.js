const { contextBridge, ipcRenderer } = require('electron');

console.log('PRELOAD CARGADO');

contextBridge.exposeInMainWorld('electronPrinting', {
  health: () => ipcRenderer.invoke('printing:health'),
  getConfig: () => ipcRenderer.invoke('printing:getConfig'),
  saveConfig: (cfg) => ipcRenderer.invoke('printing:saveConfig', cfg),
  getPrinters: (moduleKey = '') => ipcRenderer.invoke('printing:getPrinters', moduleKey),
  getStatus: (moduleKey) => ipcRenderer.invoke('printing:getStatus', moduleKey),
  printTest: (moduleKey) => ipcRenderer.invoke('printing:printTest', moduleKey),
  printModule: (moduleKey, payload = {}) => ipcRenderer.invoke('printing:printModule', moduleKey, payload),
});
