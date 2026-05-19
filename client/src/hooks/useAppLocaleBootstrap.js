import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { applyResolvedAppLocale, getStoredAppLocale, setAppLocale } from '../i18n';

/**
 * Tras iniciar sesión: mantiene idioma en localStorage o carga el del servidor si no hay preferencia local.
 */
export function useAppLocaleBootstrap() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;

    const stored = getStoredAppLocale();
    if (stored) {
      void setAppLocale(stored);
      return;
    }

    let cancelled = false;
    api
      .get('/admin-modules/config/app')
      .then((cfg) => {
        if (cancelled) return;
        const settings = cfg?.settings || cfg || {};
        const lang = String(settings?.regional?.language || '').toLowerCase();
        void applyResolvedAppLocale(lang);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);
}
