import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../i18n/constants';

const activeCodes = new Set(SUPPORTED_LOCALES.map((l) => l.code));

/**
 * @param {string} [serverLanguage] - regional.language del servidor
 * @param {string} [storedLanguage] - resto_locale en localStorage
 */
export function resolveUiLanguage(serverLanguage, storedLanguage) {
  const server = String(serverLanguage || '').toLowerCase().split('-')[0];
  if (activeCodes.has(server)) return server;
  const stored = String(storedLanguage || '').toLowerCase().split('-')[0];
  if (activeCodes.has(stored)) return stored;
  return DEFAULT_LOCALE;
}
