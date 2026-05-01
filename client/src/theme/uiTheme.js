/** Temas de interfaz (panel staff). Sincronizado con `settings.ui_theme` y `data-ui-theme` en <html>. */

export const UI_THEME_OPTIONS = [
  { id: 'light', label: 'Claro (blanco)', description: 'Fondo claro, texto oscuro' },
  { id: 'dark', label: 'Oscuro (negro)', description: 'Alto contraste' },
  { id: 'blue', label: 'Azul', description: 'Tema por defecto del sistema' },
  { id: 'gray', label: 'Gris', description: 'Intermedio neutro' },
  { id: 'purple', label: 'Morado oscuro', description: 'Acentos violeta' },
  { id: 'green', label: 'Verde esmeralda', description: 'Fondos oscuros y acentos verde' },
];

export const UI_THEME_IDS = UI_THEME_OPTIONS.map((t) => t.id);

export const DEFAULT_UI_THEME = 'blue';

export const UI_THEME_STORAGE_KEY = 'resto-ui-theme';

export function getValidUiThemeId(raw) {
  const t = String(raw || '').trim();
  return UI_THEME_IDS.includes(t) ? t : DEFAULT_UI_THEME;
}

/** Aplica tema en DOM y guarda en localStorage (arranque rápido). */
export function applyUiTheme(id) {
  const t = getValidUiThemeId(id);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-ui-theme', t);
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, t);
    } catch (_) {
      /* ignore */
    }
  }
  return t;
}

export function readStoredUiTheme() {
  try {
    return getValidUiThemeId(localStorage.getItem(UI_THEME_STORAGE_KEY));
  } catch (_) {
    return DEFAULT_UI_THEME;
  }
}
