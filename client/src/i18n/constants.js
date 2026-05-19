/** Clave localStorage para idioma del POS staff. */
export const LOCALE_STORAGE_KEY = 'resto_locale';

/** Idiomas activos. Añadir pt/it/fr cuando existan archivos en /locales. */
export const SUPPORTED_LOCALES = [
  { code: 'es', labelKey: 'common:language.es', fallbackLabel: 'Español' },
  { code: 'en', labelKey: 'common:language.en', fallbackLabel: 'English' },
];

export const DEFAULT_LOCALE = 'es';

/** Preparado para futuro (sin archivos aún). */
export const FUTURE_LOCALES = ['pt', 'it', 'fr'];

export const NAMESPACES = [
  'common',
  'auth',
  'dashboard',
  'kitchen',
  'inventory',
  'reports',
  'settings',
  'pos',
  'delivery',
  'errors',
  'sales',
];
