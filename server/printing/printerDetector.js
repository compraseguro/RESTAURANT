let printerLib = null;

try {
  // eslint-disable-next-line global-require
  printerLib = require('printer');
} catch (_) {
  printerLib = null;
}

function getPrinters() {
  if (!printerLib || typeof printerLib.getPrinters !== 'function') {
    console.warn('[printing] módulo npm "printer" no disponible: lista USB vacía (use Node local en Windows).');
    return [];
  }
  try {
    const list = printerLib.getPrinters().map((p) => ({
      name: String(p?.name || '').trim(),
      status: String(p?.status || ''),
      isDefault: Boolean(p?.isDefault),
    })).filter((p) => p.name);
    console.log(`[printing] impresoras detectadas (Windows): ${list.length}`);
    return list;
  } catch (err) {
    console.error('[printing] error detectando USB:', err.message);
    return [];
  }
}

module.exports = { getPrinters };
