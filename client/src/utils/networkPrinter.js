import { API_BASE } from './api';

/**
 * Impresión térmica por TCP (9100): si hay IP guardada, se intenta enviar al servidor,
 * que reenvía ESC/POS a la impresora (no usa la IP del navegador).
 */
export function shouldSendToNetworkPrinter(cfg) {
  return String(cfg?.ip_address ?? '').trim().length > 0;
}

function apiHostnameLower() {
  const b = String(API_BASE || '').trim();
  if (/^https?:\/\//i.test(b)) {
    try {
      return new URL(b).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
  if (typeof window !== 'undefined') {
    return String(window.location.hostname || '').toLowerCase();
  }
  return '';
}

/**
 * El backend solo puede abrir sockets a impresoras 192.168.x si corre en la misma LAN
 * (o localhost). Con API en Render/Vercel/etc. el intento siempre hace timeout.
 *
 * Opcional: `VITE_PRINT_VIA_API=true` si enruta la API hasta la red local (túnel, VPS en LAN).
 */
export function canApiReachLanPrinters() {
  const flag = String(import.meta.env.VITE_PRINT_VIA_API || '').toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  const host = apiHostnameLower();
  if (!host || host === 'localhost' || host === '127.0.0.1') return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    return false;
  }
  return false;
}

/** Si conviene llamar a POST /orders/print-network (o print-test) en el servidor. */
export function shouldTryServerNetworkPrint(cfg) {
  return shouldSendToNetworkPrinter(cfg) && canApiReachLanPrinters();
}
