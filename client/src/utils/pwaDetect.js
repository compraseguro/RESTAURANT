/** PWA abierta como ventana propia (Instalar aplicación). */
export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* */
  }
  return window.navigator.standalone === true;
}
