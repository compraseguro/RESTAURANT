const { v4: uuidv4 } = require('uuid');
const { queryAll } = require('./database');
const { getPrimaryRestaurantId } = require('./printerRoutesService');
const { buildSimpleComandaPlainText } = require('./printTicketTextNode');
const { countAgentsForRestaurant } = require('./printAgentRegistry');

function isBarText(value = '') {
  const text = String(value || '').toLowerCase();
  return ['bar', 'bebida', 'bebidas', 'trago', 'tragos', 'coctel', 'cocteles', 'cocktail', 'cocktails'].some(
    (token) => text.includes(token)
  );
}

function isBarItemRow(item) {
  if (String(item?.production_area || '').toLowerCase() === 'bar') return true;
  return isBarText(item?.product_name);
}

function isBarOnlyOrder(items = []) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(isBarItemRow);
}

/**
 * Devuelve copia del pedido solo con ítems que aplican a la estación (cocina vs bar).
 */
function filterOrderForStation(order, station) {
  const items = order?.items || [];
  if (!items.length) return null;
  if (station === 'bar') {
    if (!isBarOnlyOrder(items)) return null;
    return { ...order, items };
  }
  if (isBarOnlyOrder(items)) return null;
  const filtered = items.filter((i) => !isBarItemRow(i));
  if (!filtered.length) return null;
  return { ...order, items: filtered };
}

function loadAgentPrinterRows(restaurantId) {
  const rid = String(restaurantId || '').trim();
  if (!rid) return [];
  /** Caja usa /print-agent/push-job (POS); aquí solo auto comanda cocina/bar/delivery/parrilla. */
  return queryAll(
    `SELECT * FROM printer_settings
     WHERE restaurant_id = ? AND sucursal_id = ''
       AND enabled = 1 AND auto_print = 1
       AND lower(connection_type) = 'agent'
       AND lower(area) IN ('cocina', 'bar', 'delivery', 'parrilla')`,
    [rid]
  );
}

/**
 * Emite trabajos de impresión silenciosa a agentes conectados.
 */
function dispatchPrintAgentKitchenJobs(app, order, reason = '') {
  try {
    const printIo = app.get('printIo');
    if (!printIo || !order?.id) return;

    const restaurantId = getPrimaryRestaurantId();
    if (!restaurantId) return;

    if (countAgentsForRestaurant(restaurantId) <= 0) return;

    const rows = loadAgentPrinterRows(restaurantId);
    if (!rows.length) return;

    for (const row of rows) {
      const station = String(row.area || '').toLowerCase();
      let filtered = null;

      if (station === 'delivery') {
        if (order.type !== 'delivery') continue;
        filtered = order;
      } else if (station === 'bar') {
        filtered = filterOrderForStation(order, 'bar');
      } else if (station === 'cocina' || station === 'parrilla') {
        filtered = filterOrderForStation(order, 'cocina');
      } else {
        continue;
      }

      if (!filtered) continue;

      const widthMm = [58, 80].includes(Number(row.paper_width)) ? Number(row.paper_width) : 80;
      const copies = Math.min(5, Math.max(1, Number(row.copies || 1)));
      const text = buildSimpleComandaPlainText(filtered, new Date(), widthMm);
      const jobId = uuidv4();

      printIo.to(`ra-${restaurantId}`).emit('print-job', {
        jobId,
        tipo: 'comanda',
        area: station,
        pedido_id: order.id,
        order_number: order.order_number,
        reason,
        text,
        widthMm,
        copies,
        cut: true,
        openCashDrawer: false,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('[print-agent-dispatch]', e.message || e);
  }
}

module.exports = { dispatchPrintAgentKitchenJobs, filterOrderForStation };
