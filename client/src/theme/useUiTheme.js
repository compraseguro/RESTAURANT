import { useEffect, useState } from 'react';

/** Lee `data-ui-theme` en `<html>` y se actualiza al cambiar (Configuración → Apariencia). */
export function useUiThemeId() {
  const read = () =>
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-ui-theme') || 'blue'
      : 'blue';

  const [theme, setTheme] = useState(read);

  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setTheme(el.getAttribute('data-ui-theme') || 'blue');
    });
    obs.observe(el, { attributes: true, attributeFilter: ['data-ui-theme'] });
    return () => obs.disconnect();
  }, []);

  return theme;
}

export function useIsUiThemeLight() {
  return useUiThemeId() === 'light';
}
