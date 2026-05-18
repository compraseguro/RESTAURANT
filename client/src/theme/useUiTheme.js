import { useEffect, useState } from 'react';

/** Lee `data-ui-theme` en `<html>` y se actualiza al cambiar (Configuración → Apariencia). */
export function useUiTheme() {
  const read = () =>
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-ui-theme') || 'corporate_blue'
      : 'corporate_blue';

  const [theme, setTheme] = useState(read);

  useEffect(() => {
    const el = document.documentElement;
    const onChange = () => setTheme(read());
    const obs = new MutationObserver(onChange);
    obs.observe(el, { attributes: true, attributeFilter: ['data-ui-theme', 'data-ui-theme-mode'] });
    window.addEventListener('ui-theme-change', onChange);
    return () => {
      obs.disconnect();
      window.removeEventListener('ui-theme-change', onChange);
    };
  }, []);

  return theme;
}

export function useIsUiThemeLight() {
  const themeId = useUiTheme();
  const [light, setLight] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.style.colorScheme === 'light';
  });

  useEffect(() => {
    const sync = () => {
      setLight(document.documentElement.style.colorScheme === 'light');
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ui-theme', 'data-ui-theme-mode', 'style'],
    });
    window.addEventListener('ui-theme-change', sync);
    return () => {
      obs.disconnect();
      window.removeEventListener('ui-theme-change', sync);
    };
  }, [themeId]);

  return light;
}
