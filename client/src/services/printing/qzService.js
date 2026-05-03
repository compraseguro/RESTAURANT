/**
 * QZ Tray — impresión térmica RAW sin diálogo del navegador.
 *
 * Requisitos:
 * - Instalar QZ Tray en Windows: https://qz.io/download/
 * - Activar «Usar QZ Tray» en Configuración → Impresoras (print_agent.qz_tray.enabled)
 *
 * Certificados (producción):
 * - Por defecto se usa el certificado de demostración de QZ + firma en demo.qz.io (apto pruebas).
 * - Para producción sin avisos: genere par de claves, suba el .pem público a su sitio y firme en su backend
 *   (qz.security.setCertificatePromise / setSignaturePromise). Ver https://qz.io/wiki/signing
 *
 * Impresoras Ethernet: configure IP + puerto 9100 en la estación (igual que print-agent por red).
 */

import qz from 'qz-tray';
import { buildEscPosFromPlainText, uint8ToBase64 } from './escposBuilder';
import { stationConfigToQzPrinter, toQzCreateArg } from './printerConfig';

let securityConfigured = false;
let reconnectTimer = null;
const RECONNECT_MS = 4000;
/**
 * Tras disconnect() el evento «closed» puede llegar async; un flag booleano falla.
 * No programar reconexión si acabamos de pedir desconexión explícita.
 */
let suppressReconnectUntil = 0;
let qzHooksAttached = false;

function attachQzHooksOnce() {
  if (qzHooksAttached) return;
  qzHooksAttached = true;
  qz.websocket.setClosedCallbacks((evt) => {
    logError('QZ desconectado', evt?.reason || evt);
    if (Date.now() < suppressReconnectUntil) return;
    scheduleReconnect();
  });
  qz.websocket.setErrorCallbacks((evt) => {
    logError('Error websocket QZ', evt);
  });
}

function logInfo(...args) {
  console.info('[QZ]', ...args);
}

function logError(...args) {
  console.error('[QZ]', ...args);
}

/**
 * Certificado + firma de demostración (solo para entornos de prueba / MVP).
 * En producción sustituya por cert propio y endpoint de firma en su API.
 */
export function setupQzDemoSecurity() {
  if (securityConfigured) return;
  qz.security.setCertificatePromise((resolve, reject) => {
    fetch('https://qz.io/assets/signing/digital-certificate.txt', {
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain' },
    })
      .then((r) => r.text())
      .then(resolve)
      .catch(reject);
  });
  qz.security.setSignaturePromise((toSign) =>
    fetch(`https://demo.qz.io/signing/sign-message?request=${encodeURIComponent(toSign)}`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain' },
    }).then((r) => r.text())
  );
  securityConfigured = true;
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  clearReconnect();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectQz({ silent: true }).catch(() => {});
  }, RECONNECT_MS);
}

/** @returns {boolean} */
export function isQzWebsocketActive() {
  try {
    const st = qz.websocket.getConnectionInfo();
    return Boolean(st && st.host);
  } catch {
    return false;
  }
}

/**
 * Conecta al websocket local de QZ Tray (wss/ws localhost).
 * @param {{ silent?: boolean }} opts
 */
export async function connectQz(opts = {}) {
  const { silent = false } = opts;
  setupQzDemoSecurity();
  if (isQzWebsocketActive()) {
    if (!silent) logInfo('Ya conectado a QZ Tray');
    attachQzHooksOnce();
    return;
  }
  try {
    await qz.websocket.connect({ retries: 5, delay: 1 });
    suppressReconnectUntil = 0;
    if (!silent) logInfo('Conectado a QZ Tray');
    attachQzHooksOnce();
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('already exists')) {
      suppressReconnectUntil = 0;
      attachQzHooksOnce();
      if (!silent) logInfo('Sesión QZ Tray ya activa en este equipo');
      return;
    }
    logError('No se pudo conectar a QZ Tray. ¿Está instalado y en ejecución?', e?.message || e);
    throw e;
  }
}

export async function disconnectQz() {
  clearReconnect();
  suppressReconnectUntil = Date.now() + 8000;
  try {
    await qz.websocket.disconnect();
    logInfo('Desconectado de QZ Tray');
  } catch (e) {
    logError('disconnect', e?.message || e);
  }
}

async function ensureQzConnected() {
  if (isQzWebsocketActive()) return;
  await connectQz({ silent: true });
}

/**
 * Imprime bytes ESC/POS en bruto (base64) a la impresora configurada.
 * @param {string|object} printerArg nombre de cola o { host, port }
 * @param {Uint8Array} u8
 * @param {{ copies?: number }} printOpts
 */
export async function printRaw(printerArg, u8, printOpts = {}) {
  await ensureQzConnected();
  const copies = Math.min(5, Math.max(1, Number(printOpts.copies || 1) || 1));
  const config = qz.configs.create(printerArg, { copies });
  const data = [
    {
      type: 'raw',
      format: 'command',
      flavor: 'base64',
      data: uint8ToBase64(u8),
    },
  ];
  try {
    await qz.print(config, data);
    logInfo('Impresión enviada a QZ');
  } catch (e) {
    logError('Error de impresión QZ (impresora apagada, IP incorrecta o QZ cerrado)', e?.message || e);
    throw e;
  }
}

/**
 * @param {{ stationConfig: object, text: string, copies?: number }} p
 */
export async function printEscPosWithQz(p) {
  const { stationConfig, text, copies = 1 } = p;
  const desc = stationConfigToQzPrinter(stationConfig);
  if (!desc) {
    throw new Error('Configure IP de térmica en red o nombre exacto de impresora Windows para QZ.');
  }
  const printerArg = toQzCreateArg(desc);
  const n = Math.min(5, Math.max(1, Number(copies || stationConfig?.copies || 1) || 1));
  const wm = [58, 80].includes(Number(stationConfig?.width_mm)) ? Number(stationConfig.width_mm) : 80;
  const buf = buildEscPosFromPlainText(text, { copies: 1, paperWidthMm: wm });
  await printRaw(printerArg, buf, { copies: n });
}

/** Atajos por área (mismo pipeline; el área ya viene en stationConfig del backend). */
export function printKitchenQz(ctx) {
  return printEscPosWithQz(ctx);
}
export function printBarQz(ctx) {
  return printEscPosWithQz(ctx);
}
export function printTicketQz(ctx) {
  return printEscPosWithQz(ctx);
}

export function isQzTrayEnabled(printAgent) {
  const q = printAgent?.qz_tray;
  return Boolean(q && (Number(q.enabled) === 1 || q.enabled === true));
}

/** Alias por convención camelCase / docs en inglés */
export const connectQZ = connectQz;

export const printKitchen = printKitchenQz;
export const printBar = printBarQz;
export const printTicket = printTicketQz;
