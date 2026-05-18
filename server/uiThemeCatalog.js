/** IDs válidos de tema UI (sincronizado con client/src/theme/themePresets.js). */
const UI_THEME_IDS = new Set([
  'corporate_blue',
  'dark_elegance',
  'gold_premium',
  'minimal_white',
  'emerald_business',
  'sunset_modern',
  'blue',
  'light',
  'dark',
  'gray',
  'purple',
  'green',
]);

function getValidUiThemeId(raw) {
  const t = String(raw || '').trim();
  return UI_THEME_IDS.has(t) ? t : 'corporate_blue';
}

module.exports = { UI_THEME_IDS, getValidUiThemeId };
