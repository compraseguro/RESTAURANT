import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { normalizeConfigFromApi } from '../utils/appSettingsNormalize';
import { getStoredAppLocale, syncLocaleFromRegional } from '../i18n';

/**
 * Al iniciar sesión: idioma desde configuración regional del servidor (prioridad sobre caché vieja).
 */
export function useAppLocaleBootstrap() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;

    let cancelled = false;
    api
      .get('/admin-modules/config/app')
      .then((cfg) => {
        if (cancelled) return;
        const normalized = normalizeConfigFromApi(cfg);
        const serverLang = normalized?.regional?.language;
        const stored = getStoredAppLocale();
        if (serverLang === 'es' || serverLang === 'en') {
          void syncLocaleFromRegional(serverLang);
        } else if (stored) {
          void syncLocaleFromRegional(stored);
        }
      })
      .catch(() => {
        const stored = getStoredAppLocale();
        if (stored) void syncLocaleFromRegional(stored);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);
}
