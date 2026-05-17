/**
 * Formato regional para tickets, reportes y UI (sincronizado con app_settings.regional / settings.regional).
 */

const DEFAULT_REGIONAL = {
  country: 'Peru',
  timezone: 'America/Lima',
  language: 'es',
  date_format: 'DD/MM/YYYY',
  time_format: '24h',
  currency_code: 'PEN',
  currency_symbol: 'S/',
  decimal_separator: '.',
  thousands_separator: ',',
  ticket_language: 'es',
  number_decimals: 2,
  rounding_mode: 'standard',
};

function mergeRegional(raw) {
  return { ...DEFAULT_REGIONAL, ...(raw && typeof raw === 'object' ? raw : {}) };
}

function formatNumber(value, regional) {
  const r = mergeRegional(regional);
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const dec = Math.max(0, Math.min(4, Number(r.number_decimals) || 2));
  const parts = n.toFixed(dec).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, r.thousands_separator || ',');
  if (dec === 0) return intPart;
  return `${intPart}${r.decimal_separator || '.'}${parts[1]}`;
}

function formatCurrency(value, regional) {
  const r = mergeRegional(regional);
  return `${r.currency_symbol || 'S/'} ${formatNumber(value, r)}`;
}

function formatDateSample(regional) {
  const r = mergeRegional(regional);
  const d = new Date();
  try {
    const opts = { timeZone: r.timezone || 'America/Lima' };
    if (r.date_format === 'MM/DD/YYYY') {
      return d.toLocaleDateString('en-US', opts);
    }
    if (r.date_format === 'YYYY-MM-DD') {
      return d.toLocaleDateString('sv-SE', opts);
    }
    return d.toLocaleDateString('es-PE', opts);
  } catch (_) {
    return d.toISOString().split('T')[0];
  }
}

function formatTimeSample(regional) {
  const r = mergeRegional(regional);
  const d = new Date();
  try {
    const opts = {
      timeZone: r.timezone || 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: r.time_format === '12h',
    };
    return d.toLocaleTimeString(r.language === 'en' ? 'en-US' : 'es-PE', opts);
  } catch (_) {
    return '14:30';
  }
}

function buildPreview(regional) {
  const r = mergeRegional(regional);
  return {
    regional: r,
    samples: {
      date: formatDateSample(r),
      time: formatTimeSample(r),
      currency: formatCurrency(1234.56, r),
      number: formatNumber(9876543.21, r),
      ticket_line: `${formatDateSample(r)} ${formatTimeSample(r)} · ${formatCurrency(45.9, r)}`,
    },
  };
}

module.exports = {
  DEFAULT_REGIONAL,
  mergeRegional,
  formatNumber,
  formatCurrency,
  formatDateSample,
  formatTimeSample,
  buildPreview,
};
