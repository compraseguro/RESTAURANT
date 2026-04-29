/**
 * No forzar orientación en JS (lock bloquearía o ignoraría el ajuste del usuario).
 * Si algo dejó un lock activo, lo liberamos para que mande el SO (bloqueo de giro on/off).
 */
export function initOrientationRespect() {
  if (typeof window === 'undefined') return;
  try {
    const o = window.screen?.orientation;
    if (o && typeof o.unlock === 'function') {
      o.unlock();
    }
  } catch {
    /* noop: permisos / contexto no seguro */
  }
}
