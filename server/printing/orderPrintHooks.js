'use strict';

/**
 * Impresión automática cocina/bar en el mismo proceso Node que la API (sin microservicio).
 * Activar en Windows por defecto; desactivar con SERVER_AUTO_PRINT=0.
 */
const { queryOne } = require('../database');
const { getStationConfig, isStationReady } = require('./configManager');
const { printToStation } = require('./printerService');
const { buildKitchenTicketPlainText } = require('./ticketPlainNode');
const { orderAppliesToStation } = require('./stationRouting');
const { logPrintEvent, logPrintError } = require('./printLogger');

function shouldRunServerAutoPrint() {
  if (process.env.SERVER_AUTO_PRINT === '0') return false;
  if (process.env.SERVER_AUTO_PRINT === '1') return true;
  return process.platform === 'win32';
}

/**
 * @param {object} order resultado de getOrderWithItems
 */
function scheduleKitchenBarAutoPrint(order, labelPrefix = 'Automático') {
  if (!shouldRunServerAutoPrint()) return;
  if (!order?.items?.length) return;

  void (async () => {
    const restaurant =
      queryOne('SELECT name, address, phone FROM restaurants LIMIT 1') || {
        name: 'Resto-FADEY',
        address: '',
        phone: '',
      };

    for (const station of ['cocina', 'bar']) {
      if (!orderAppliesToStation(order, station)) continue;
      const cfg = getStationConfig(station);
      if (!cfg.autoPrint) continue;
      if (!isStationReady(cfg)) {
        logPrintEvent({ hook: 'auto_print', station, estado: 'omitido_sin_config' });
        continue;
      }
      const titleBase = station === 'bar' ? 'Comandas de Bar' : 'Comandas de Cocina';
      const title = `${titleBase} · ${labelPrefix} · #${order.order_number}`;
      const widthMm = [58, 80].includes(Number(cfg.widthMm)) ? Number(cfg.widthMm) : 80;
      const copies = Math.min(5, Math.max(1, Number(cfg.copies || 1)));
      let plain;
      try {
        plain = buildKitchenTicketPlainText({
          restaurant,
          title,
          orders: [order],
          copies: 1,
          widthMm,
        });
      } catch (e) {
        logPrintError({ hook: 'auto_print', station, error: e.message });
        continue;
      }
      const r = await printToStation(station, plain, { copies, widthMm });
      if (!r.ok) {
        logPrintError({ hook: 'auto_print', station, error: r.error });
      }
    }
  })();
}

module.exports = { scheduleKitchenBarAutoPrint, shouldRunServerAutoPrint };
