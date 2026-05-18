import { useEffect, useState } from 'react';
import { getChartColorsForTheme, readStoredUiTheme } from './uiTheme';

/** Colores Recharts sincronizados con el tema activo. */
export function useChartTheme() {
  const [colors, setColors] = useState(() => getChartColorsForTheme(readStoredUiTheme()));

  useEffect(() => {
    const sync = () => {
      const id =
        document.documentElement.getAttribute('data-ui-theme') || readStoredUiTheme();
      setColors(getChartColorsForTheme(id));
    };
    sync();
    window.addEventListener('ui-theme-change', sync);
    return () => window.removeEventListener('ui-theme-change', sync);
  }, []);

  return colors;
}

export const DEFAULT_CHART_COLORS = getChartColorsForTheme('corporate_blue');
