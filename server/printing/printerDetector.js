let printerLib = null;

try {
  // eslint-disable-next-line global-require
  printerLib = require('printer');
} catch (_) {
  printerLib = null;
}

function getPrinters() {
  if (!printerLib || typeof printerLib.getPrinters !== 'function') {
    return [];
  }
  try {
    return printerLib.getPrinters().map((p) => ({
      name: String(p?.name || '').trim(),
      status: String(p?.status || ''),
      isDefault: Boolean(p?.isDefault),
    })).filter((p) => p.name);
  } catch (err) {
    console.error('[printing] error detectando USB:', err.message);
    return [];
  }
}

module.exports = { getPrinters };
