import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  NAMESPACES,
  SUPPORTED_LOCALES,
} from './constants';
import { resolveUiLanguage } from '../utils/resolveUiLanguage';

import esCommon from '../../locales/es/common.json';
import esAuth from '../../locales/es/auth.json';
import esDashboard from '../../locales/es/dashboard.json';
import esKitchen from '../../locales/es/kitchen.json';
import esInventory from '../../locales/es/inventory.json';
import esReports from '../../locales/es/reports.json';
import esSettings from '../../locales/es/settings.json';
import esPos from '../../locales/es/pos.json';
import esDelivery from '../../locales/es/delivery.json';
import esErrors from '../../locales/es/errors.json';
import esSales from '../../locales/es/sales.json';

import enCommon from '../../locales/en/common.json';
import enAuth from '../../locales/en/auth.json';
import enDashboard from '../../locales/en/dashboard.json';
import enKitchen from '../../locales/en/kitchen.json';
import enInventory from '../../locales/en/inventory.json';
import enReports from '../../locales/en/reports.json';
import enSettings from '../../locales/en/settings.json';
import enPos from '../../locales/en/pos.json';
import enDelivery from '../../locales/en/delivery.json';
import enErrors from '../../locales/en/errors.json';
import enSales from '../../locales/en/sales.json';

const resources = {
  es: {
    common: esCommon,
    auth: esAuth,
    dashboard: esDashboard,
    kitchen: esKitchen,
    inventory: esInventory,
    reports: esReports,
    settings: esSettings,
    pos: esPos,
    delivery: esDelivery,
    errors: esErrors,
    sales: esSales,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    kitchen: enKitchen,
    inventory: enInventory,
    reports: enReports,
    settings: enSettings,
    pos: enPos,
    delivery: enDelivery,
    errors: enErrors,
    sales: enSales,
  },
};

function applyDocumentLang(lng) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng || DEFAULT_LOCALE;
  }
}

const activeCodes = new Set(SUPPORTED_LOCALES.map((l) => l.code));

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: [...activeCodes],
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'common',
    ns: NAMESPACES,
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false,
      bindI18n: 'languageChanged',
      bindI18nStore: 'added removed',
    },
  });

i18n.on('languageChanged', applyDocumentLang);
applyDocumentLang(i18n.language);

/**
 * Cambia idioma y persiste en localStorage.
 * @param {string} code - es | en
 */
export async function setAppLocale(code) {
  const next = activeCodes.has(code) ? code : DEFAULT_LOCALE;
  await i18n.changeLanguage(next);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch (_) {
    /* noop */
  }
  applyDocumentLang(next);
  return next;
}

/** Preferencia guardada en este navegador. */
export function getStoredAppLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && activeCodes.has(stored)) return stored;
  } catch (_) {
    /* noop */
  }
  return null;
}

/**
 * Aplica idioma desde configuración regional del servidor (fuente de verdad tras guardar).
 * @param {string} [serverLanguage] - regional.language
 */
export async function syncLocaleFromRegional(serverLanguage) {
  const stored = getStoredAppLocale();
  const code = resolveUiLanguage(serverLanguage, stored);
  const applied = await setAppLocale(code);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('resto-locale-changed', { detail: { locale: applied } }));
  }
  return applied;
}

/** @deprecated Usar syncLocaleFromRegional */
export async function applyResolvedAppLocale(serverLanguage) {
  return syncLocaleFromRegional(serverLanguage);
}

export function getAppLocale() {
  const lng = i18n.language || DEFAULT_LOCALE;
  return String(lng).split('-')[0];
}

export { i18n, SUPPORTED_LOCALES };
export default i18n;
