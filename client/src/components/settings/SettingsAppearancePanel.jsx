import { useMemo } from 'react';
import { MdDarkMode, MdLightMode, MdSettingsBrightness, MdPerson, MdStore } from 'react-icons/md';
import {
  UI_THEME_OPTIONS,
  PREMIUM_THEME_IDS,
  applyUiThemeFromAppSettings,
  getValidUiThemeId,
  readUserUiThemePreference,
  saveUserUiThemePreference,
  UI_THEME_MODE_IDS,
  CUSTOM_THEME_VAR_KEYS,
} from '../../theme/uiTheme';
import { getThemePreset } from '../../theme/themePresets';

function ThemePreviewCard({ opt, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border p-3 text-left transition-all hover:shadow-md ${
        selected
          ? 'border-[var(--ui-accent-muted)] ring-2 ring-[var(--ui-accent-muted)]/40 shadow-rf'
          : 'border-[color:var(--ui-border)] hover:border-[var(--ui-accent-muted)]'
      }`}
    >
      <div
        className="flex gap-2 mb-2 h-10 rounded-lg overflow-hidden border border-[color:var(--ui-border)]"
        style={{ background: opt.bodyBg }}
      >
        <span className="w-1/3 h-full" style={{ background: opt.swatch }} />
        <span className="flex-1 h-full" style={{ background: opt.surface }} />
      </div>
      <p className="font-semibold text-sm text-[var(--ui-body-text)]">{opt.label}</p>
      <p className="text-xs text-[var(--ui-muted)] mt-0.5 line-clamp-2">{opt.description}</p>
      {opt.premium ? (
        <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--ui-accent-muted)]">
          Premium
        </span>
      ) : null}
    </button>
  );
}

export default function SettingsAppearancePanel({
  appSettings,
  setAppSettings,
  currentUserId,
}) {
  const current = getValidUiThemeId(appSettings?.ui_theme);
  const custom = appSettings?.ui_theme_custom && typeof appSettings.ui_theme_custom === 'object'
    ? appSettings.ui_theme_custom
    : {};
  const mode = UI_THEME_MODE_IDS.includes(appSettings?.ui_theme_mode)
    ? appSettings.ui_theme_mode
    : 'light';

  const userPref = useMemo(
    () => (currentUserId ? readUserUiThemePreference(currentUserId) : null),
    [currentUserId, appSettings?.ui_theme, appSettings?.ui_theme_mode]
  );

  const premiumOptions = UI_THEME_OPTIONS.filter((o) => PREMIUM_THEME_IDS.includes(o.id));
  const legacyOptions = UI_THEME_OPTIONS.filter((o) => !PREMIUM_THEME_IDS.includes(o.id));

  const patchAndApply = (patch) => {
    const next = { ...appSettings, ...patch };
    setAppSettings(next);
    applyUiThemeFromAppSettings(next, currentUserId);
  };

  const selectTheme = (themeId) => {
    patchAndApply({ ui_theme: themeId });
  };

  const setMode = (nextMode) => {
    patchAndApply({ ui_theme_mode: nextMode });
  };

  const setCustomVar = (cssKey, value) => {
    const nextCustom = { ...custom, [cssKey]: value };
    patchAndApply({ ui_theme_custom: nextCustom });
  };

  const togglePersonalTheme = (enabled) => {
    if (!currentUserId) return;
    saveUserUiThemePreference(currentUserId, {
      usePersonal: enabled,
      theme: current,
      mode,
      custom,
    });
    applyUiThemeFromAppSettings(appSettings, currentUserId);
  };

  const preset = getThemePreset(current);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="card">
        <h3 className="rf-font-display text-lg font-semibold text-[var(--ui-body-text)] mb-1">
          Temas premium
        </h3>
        <p className="text-sm text-[var(--ui-muted)] mb-4">
          Paletas profesionales aplicadas al instante en sidebar, tablas, formularios, gráficos, modales y todo el panel.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {premiumOptions.map((opt) => (
            <ThemePreviewCard
              key={opt.id}
              opt={opt}
              selected={current === opt.id}
              onSelect={() => selectTheme(opt.id)}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-[var(--ui-body-text)] mb-3">Modo de apariencia</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'light', label: 'Claro', icon: MdLightMode },
            { id: 'dark', label: 'Oscuro', icon: MdDarkMode },
            { id: 'auto', label: 'Automático', icon: MdSettingsBrightness },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                mode === id
                  ? 'border-[var(--ui-accent-muted)] bg-[var(--ui-sidebar-active-bg)] text-[var(--ui-body-text)]'
                  : 'border-[color:var(--ui-border)] text-[var(--ui-muted)] hover:bg-[var(--ui-sidebar-hover)]'
              }`}
            >
              <Icon className="text-lg" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--ui-muted)] mt-3">
          El modo automático sigue la preferencia del sistema operativo (claro/oscuro).
        </p>
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-[var(--ui-body-text)] mb-1">Personalización avanzada</h3>
        <p className="text-sm text-[var(--ui-muted)] mb-4">
          Ajuste fino sobre el tema «{preset.label}». Vista previa en tiempo real.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CUSTOM_THEME_VAR_KEYS.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-[var(--ui-body-text)] mb-1.5 block">{label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={
                    String(custom[key] || preset.vars[key] || '#2563eb').startsWith('#')
                      ? custom[key] || preset.vars[key]
                      : '#2563eb'
                  }
                  onChange={(e) => setCustomVar(key, e.target.value)}
                  className="h-10 w-14 rounded-lg border border-[color:var(--ui-border)] cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={custom[key] || ''}
                  placeholder={preset.vars[key] || ''}
                  onChange={(e) => setCustomVar(key, e.target.value)}
                  className="input-field flex-1 text-sm font-mono"
                />
              </div>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-4 text-sm"
          onClick={() => patchAndApply({ ui_theme_custom: {} })}
        >
          Restaurar colores del tema
        </button>
      </div>

      {currentUserId ? (
        <div className="card">
          <h3 className="text-base font-semibold text-[var(--ui-body-text)] mb-2 flex items-center gap-2">
            <MdPerson /> Preferencia personal
          </h3>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(userPref?.usePersonal)}
              onChange={(e) => togglePersonalTheme(e.target.checked)}
            />
            <span className="text-sm text-[var(--ui-body-text)]">
              Usar mi tema personal en este dispositivo (no afecta al resto del equipo). Si está desactivado, se usa el tema del restaurante{' '}
              <MdStore className="inline align-text-bottom" />.
            </span>
          </label>
        </div>
      ) : null}

      <details className="card">
        <summary className="cursor-pointer font-semibold text-[var(--ui-body-text)]">
          Temas clásicos ({legacyOptions.length})
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {legacyOptions.map((opt) => (
            <ThemePreviewCard
              key={opt.id}
              opt={opt}
              selected={current === opt.id}
              onSelect={() => selectTheme(opt.id)}
            />
          ))}
        </div>
      </details>

      <p className="text-xs text-[var(--ui-muted)]">
        Los cambios de esta sección se sincronizan automáticamente con el servidor. Tema activo:{' '}
        <strong className="text-[var(--ui-body-text)]">{preset.label}</strong>.
      </p>
    </div>
  );
}
