/**
 * Impresión térmica por TCP (9100): si hay IP guardada, se intenta enviar al servidor,
 * que reenvía ESC/POS a la impresora (no usa la IP del navegador).
 */
export function shouldSendToNetworkPrinter(cfg) {
  return String(cfg?.ip_address ?? '').trim().length > 0;
}
