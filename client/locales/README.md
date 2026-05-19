# Traducciones Resto Fadey POS

Estructura por idioma y namespace (i18next).

## Idiomas activos

- `es` — Español (predeterminado)
- `en` — English

## Añadir portugués / italiano / francés

1. Copiar carpeta `es/` → `pt/`, `it/` o `fr/`.
2. Traducir JSON.
3. Registrar recursos en `src/i18n/index.js`.
4. Añadir entrada en `SUPPORTED_LOCALES` (`src/i18n/constants.js`).

## Uso en componentes

```jsx
import { useTranslation } from 'react-i18next';

function MiPantalla() {
  const { t } = useTranslation('kitchen');
  return <h1>{t('panel.kitchenTitle')}</h1>;
}
```

Claves con namespace explícito: `t('common:actions.save')`.

## Persistencia

`localStorage` clave `resto_locale`.
