import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, setAppLocale, getAppLocale } from '../i18n';

/**
 * Selector de idioma (ES / EN). Persiste en localStorage (`resto_locale`).
 */
export default function LanguageSwitcher({ className = '', compact = false }) {
  const { t } = useTranslation('common');
  const current = getAppLocale();

  return (
    <label
      className={`inline-flex items-center gap-2 text-sm ${className}`}
      title={t('language.label')}
    >
      {!compact ? (
        <span className="hidden sm:inline text-[var(--ui-muted)]">{t('language.label')}</span>
      ) : null}
      <select
        className="input-field py-1.5 px-2 text-xs sm:text-sm min-w-[7rem] bg-[var(--ui-surface)]"
        value={current}
        onChange={(e) => void setAppLocale(e.target.value)}
        aria-label={t('language.label')}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc.code} value={loc.code}>
            {t(`language.${loc.code}`, { defaultValue: loc.fallbackLabel })}
          </option>
        ))}
      </select>
    </label>
  );
}
