const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql, withTransaction, logAudit } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { assertPaymentMethodAllowed } = require('../businessRules');
const { getOrderWithItems, createOrderInTransaction, replaceOrderLinesInTransaction, actorFromRequest } = require('../orderCreateService');
const { restoreNonTransformedStockForOrder } = require('../warehouseStock');
const { resolveRestaurantId, listPrinterRoutes } = require('../printerRoutesService');

const router = express.Router();
const ORDER_TRANSITIONS = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  /** Anulación administrativa desde Ventas (venta cerrada / entregada); solo admin/cajero (validación abajo). */
  delivered: ['cancelled'],
  cancelled: [],
};

function getChargeBase(order) {
  return Math.max(
    0,
    Number(order?.subtotal || 0) + Number(order?.delivery_fee || 0)
  );
}

function isBarText(value = '') {
  const text = String(value || '').toLowerCase();
  return ['bar', 'bebida', 'bebidas', 'trago', 'tragos', 'coctel', 'cocteles', 'cocktail', 'cocktails'].some(token => text.includes(token));
}

function getOrderItemsWithArea(orderId) {
  return queryAll(
    `SELECT oi.*,
            p.production_area,
            LOWER(COALESCE(c.name, '')) as category_name_lc
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE oi.order_id = ?`,
    [orderId]
  );
}

function isBarItemRow(item) {
  if (String(item?.production_area || '').toLowerCase() === 'bar') return true;
  return isBarText(item?.category_name_lc) || isBarText(item?.product_name);
}

function isBarOnlyOrder(items = []) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(isBarItemRow);
}

/** Ítems con production_area (Escritorio, listados, etc.) */
function attachOrderItemsWithProductArea(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return;
  const placeholders = orders.map(() => '?').join(',');
  const ids = orders.map((o) => o.id);
  const allItems = queryAll(
    `SELECT oi.*, p.production_area
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id IN (${placeholders})`,
    ids
  );
  const byOrder = new Map();
  allItems.forEach((row) => {
    if (!byOrder.has(row.order_id)) byOrder.set(row.order_id, []);
    byOrder.get(row.order_id).push(row);
  });
  orders.forEach((o) => { o.items = byOrder.get(o.id) || []; });
}

router.get('/', authenticateToken, (req, res) => {
  if (req.user.role === 'mozo') {
    return res.json([]);
  }
  const { status, type, date, limit: lim } = req.query;
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (req.user.type === 'customer') { query += ' AND customer_id = ?'; params.push(req.user.id); }
  if (req.user.role === 'delivery') {
    const uid = req.user.id;
    query += ` AND type = 'delivery' AND status != 'cancelled' AND (
      (
        COALESCE(payment_status, '') != 'paid'
        AND (delivery_driver_completed_at IS NULL OR delivery_driver_completed_at = '')
        AND (
          delivery_driver_started_at IS NULL OR delivery_driver_started_at = ''
          OR delivery_route_driver_id = ?
        )
      )
      OR (
        delivery_route_driver_id = ?
        AND delivery_driver_completed_at IS NOT NULL AND TRIM(delivery_driver_completed_at) != ''
        AND date(delivery_driver_completed_at) = date('now')
      )
    )`;
    params.push(uid, uid);
  } else {
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (type) { query += ' AND type = ?'; params.push(type); }
    if (date) { query += ' AND DATE(created_at) = ?'; params.push(date); }
  }
  query += ' ORDER BY created_at DESC';
  if (lim) { query += ' LIMIT ?'; params.push(parseInt(lim)); }

  const orders = queryAll(query, params);
  attachOrderItemsWithProductArea(orders);
  res.json(orders);
});

router.get('/active', authenticateToken, (req, res) => {
  if (req.user.type === 'customer') {
    return res.status(403).json({ error: 'No tienes permisos para ver pedidos activos globales' });
  }
  if (!['admin', 'cajero', 'mozo', 'cocina', 'bar'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No tienes permisos para esta acción' });
  }
  const orders = queryAll(`SELECT * FROM orders WHERE status IN ('pending', 'preparing', 'ready') ORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 END, created_at ASC`);
  attachOrderItemsWithProductArea(orders);
  res.json(orders);
});

router.get('/kitchen', authenticateToken, (req, res) => {
  if (req.user.type === 'customer') {
    return res.status(403).json({ error: 'No tienes permisos para cocina' });
  }
  if (!['admin', 'cocina', 'bar'].includes(req.user.role)) {
    return res.status(403).json({ error: 'No tienes permisos para cocina' });
  }
  const { type, station } = req.query;
  const stationRequested = req.user.role === 'bar'
    ? 'bar'
    : req.user.role === 'cocina'
      ? 'cocina'
      : (station === 'bar' ? 'bar' : 'cocina');
  let query = "SELECT * FROM orders WHERE status IN ('pending', 'preparing')";
  const params = [];
  if (type === 'delivery') query += " AND type = 'delivery'";
  else if (type === 'dine_in') query += " AND type = 'dine_in'";
  else if (type === 'salon') query += " AND type IN ('dine_in', 'pickup')";
  query += ' ORDER BY created_at ASC';

  const orders = queryAll(query, params);
  const filtered = [];
  orders.forEach(o => {
    const areaItems = getOrderItemsWithArea(o.id);
    const barOnly = isBarOnlyOrder(areaItems);
    if (stationRequested === 'bar' && !barOnly) return;
    if (stationRequested === 'cocina' && barOnly) return;
    o.items = areaItems.map(({ category_name_lc, ...item }) => item);
    filtered.push(o);
  });
  res.json(filtered);
});

/** Datos del restaurante para tickets y vistas de impresión del navegador. */
router.get('/print-config', authenticateToken, requireRole('admin', 'cajero', 'mozo', 'cocina', 'bar', 'delivery'), (req, res) => {
  const restaurant = queryOne('SELECT name, address, phone, logo FROM restaurants LIMIT 1') || {};
  const restaurantId = resolveRestaurantId(req.user);
  const printerStub = () => ({
    connection: 'local',
    ip_address: '',
    port: 9100,
    width_mm: 80,
    copies: 1,
    auto_print: 1,
    active: 1,
    printer_type: 'lan',
  });
  res.json({
    restaurant,
    printers: {
      cocina: printerStub(),
      bar: printerStub(),
      caja: printerStub(),
      delivery: printerStub(),
      parrilla: printerStub(),
    },
    printer_routes: listPrinterRoutes(restaurantId),
    print_agent: {
      enabled: false,
      base_url: '',
      agent_token: '',
      qz_tray: { enabled: false },
    },
  });
});

router.post('/:id/delivery-driver-action', authenticateToken, requireRole('delivery'), (req, res) => {
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!['start', 'complete'].includes(action)) {
    return res.status(400).json({ error: 'Acción inválida (use start o complete)' });
  }
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.type !== 'delivery') return res.status(400).json({ error: 'Solo aplica a pedidos delivery' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'Pedido anulado' });

  if (action === 'start') {
    if (String(order.delivery_driver_started_at || '').trim()) {
      return res.status(400).json({ error: 'Este pedido ya fue iniciado por reparto' });
    }
    if (String(order.delivery_driver_completed_at || '').trim()) {
      return res.status(400).json({ error: 'Este pedido ya figura como completado en ruta' });
    }
    runSql(
      "UPDATE orders SET delivery_driver_started_at = datetime('now'), delivery_route_driver_id = ?, updated_at = datetime('now') WHERE id = ?",
      [req.user.id, req.params.id]
    );
  } else {
    if (String(order.delivery_route_driver_id || '') !== String(req.user.id)) {
      return res.status(403).json({ error: 'Solo quien inició la ruta puede marcarlo como listo' });
    }
    if (!String(order.delivery_driver_started_at || '').trim()) {
      return res.status(400).json({ error: 'Debe iniciar la entrega antes de marcar listo' });
    }
    if (String(order.delivery_driver_completed_at || '').trim()) {
      return res.status(400).json({ error: 'Ya consta como completado en su ruta' });
    }
    runSql(
      "UPDATE orders SET delivery_driver_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      [req.params.id]
    );
  }

  const updated = getOrderWithItems(req.params.id);
  const io = req.app.get('io');
  if (io) io.emit('order-update', updated);
  res.json(updated);
});

router.put('/:id/lines', authenticateToken, requireRole('admin', 'cajero', 'mozo'), (req, res) => {
  const { items } = req.body || {};
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un producto' });
  }
  try {
    const actor = actorFromRequest(req);
    withTransaction((tx) => replaceOrderLinesInTransaction(tx, req.params.id, items, actor));
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {
      runSql('UPDATE orders SET notes = ?, updated_at = datetime(\'now\') WHERE id = ?', [
        String(req.body.notes ?? '').trim(),
        req.params.id,
      ]);
    }
    const order = getOrderWithItems(req.params.id);
    const io = req.app.get('io');
    if (io) {
      io.emit('order-update', order);
      /** Cocina/bar: mismo efecto que pedido nuevo para impresión automática (ítems añadidos a mesa existente). */
      io.emit('order-lines-updated', order);
    }
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo actualizar el pedido' });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  const order = getOrderWithItems(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (req.user.type === 'customer' && order.customer_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes acceso a este pedido' });
  }
  if (req.user.role === 'delivery') {
    if (order.type !== 'delivery') {
      return res.status(403).json({ error: 'No tienes acceso a este pedido' });
    }
    const mine = String(order.delivery_route_driver_id || '') === String(req.user.id);
    const visibleStatuses = ['pending', 'preparing', 'ready'];
    let allow = visibleStatuses.includes(order.status);
    if (!allow && mine && String(order.delivery_driver_completed_at || '').trim()) {
      const raw = String(order.delivery_driver_completed_at).replace(' ', 'T');
      const d = new Date(raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);
      const t = new Date();
      allow =
        Number.isFinite(d.getTime()) &&
        d.getFullYear() === t.getFullYear() &&
        d.getMonth() === t.getMonth() &&
        d.getDate() === t.getDate();
    }
    if (!allow) {
      return res.status(403).json({ error: 'No tienes acceso a este pedido' });
    }
  }
  res.json(order);
});

router.post('/', authenticateToken, (req, res) => {
  const { items, payment_method } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'El pedido debe tener al menos un producto' });
  const requestedPaymentMethod = String(payment_method || '').trim().toLowerCase();
  if (requestedPaymentMethod) {
    try {
      assertPaymentMethodAllowed(requestedPaymentMethod, { allowOnline: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  try {
    const orderId = uuidv4();
    const actor = actorFromRequest(req);
    const result = withTransaction((tx) =>
      createOrderInTransaction(tx, orderId, req.body, actor)
    );

    const order = getOrderWithItems(result.orderId);
    const io = req.app.get('io');
    if (io) { io.emit('new-order', order); io.emit('order-update', order); }
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo crear el pedido' });
  }
});

router.put('/:id/status', authenticateToken, requireRole('admin', 'cajero', 'mozo', 'cocina', 'bar', 'delivery'), (req, res) => {
  const { status, cancellation_reason: cancellationReasonRaw } = req.body;
  const valid = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Estado inválido' });

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

  if (req.user.role === 'mozo' && order.type === 'delivery') {
    return res.status(403).json({ error: 'Los mozos solo pueden crear pedidos de delivery; no gestionar su estado.' });
  }

  /** Delivery: pendiente → preparación → listo solo cocina/bar (o admin); no cajero/mozo/delivery. */
  if (order.type === 'delivery' && (status === 'preparing' || status === 'ready')) {
    if (!['admin', 'cocina', 'bar'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Solo cocina, bar o administración pueden actualizar la preparación de pedidos delivery' });
    }
    if (req.user.role === 'cocina' || req.user.role === 'bar') {
      const areaItems = getOrderItemsWithArea(order.id);
      const barOnly = isBarOnlyOrder(areaItems);
      if (req.user.role === 'cocina' && barOnly) {
        return res.status(403).json({ error: 'Este pedido corresponde al panel de bar' });
      }
      if (req.user.role === 'bar' && !barOnly) {
        return res.status(403).json({ error: 'Este pedido corresponde al panel de cocina' });
      }
    }
  }

  if (req.user.role === 'delivery') {
    if (order.type !== 'delivery') {
      return res.status(403).json({ error: 'El rol delivery solo puede actualizar pedidos delivery' });
    }
    if (status !== 'delivered' || order.status !== 'ready') {
      return res.status(403).json({ error: 'El rol delivery solo puede marcar como entregado un pedido listo' });
    }
    if (status === 'cancelled') {
      return res.status(403).json({ error: 'El rol delivery no puede cancelar pedidos' });
    }
    const activeAssignment = queryOne(
      "SELECT id, driver_id FROM delivery_assignments WHERE order_id = ? AND status != 'delivered' ORDER BY assigned_at DESC LIMIT 1",
      [order.id]
    );
    if (activeAssignment && activeAssignment.driver_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido está asignado a otro repartidor' });
    }
  }
  if (status === 'cancelled' && order.status === 'delivered') {
    if (!['admin', 'cajero'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Solo administración o caja pueden anular una venta ya entregada.' });
    }
  }

  if (req.user.role === 'bar' || req.user.role === 'cocina') {
    if (!['preparing', 'ready'].includes(status)) {
      return res.status(403).json({ error: 'Cocina/Bar solo pueden mover pedidos a preparación o listo' });
    }
    const areaItems = getOrderItemsWithArea(order.id);
    const barOnly = isBarOnlyOrder(areaItems);
    if (req.user.role === 'bar' && !barOnly) {
      return res.status(403).json({ error: 'El rol bar solo puede actualizar pedidos de barra' });
    }
    if (req.user.role === 'cocina' && barOnly) {
      return res.status(403).json({ error: 'El rol cocina no puede actualizar pedidos exclusivos de barra' });
    }
  }
  const allowedNext = ORDER_TRANSITIONS[order.status] || [];
  if (!allowedNext.includes(status)) {
    return res.status(400).json({ error: `Transición inválida: ${order.status} -> ${status}` });
  }

  if (status === 'cancelled' && order.status !== 'cancelled') {
    const reason = String(cancellationReasonRaw || '').trim();
    const mustReason =
      order.status === 'delivered' || String(order.payment_status || '') === 'paid';
    if (mustReason && reason.length < 3) {
      return res.status(400).json({ error: 'Indique el motivo de anulación (mínimo 3 caracteres).' });
    }
    restoreNonTransformedStockForOrder(order.id);
    runSql(
      "UPDATE orders SET status = 'cancelled', cancellation_reason = ?, updated_at = datetime('now') WHERE id = ?",
      [reason, req.params.id]
    );
  } else {
    runSql("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, req.params.id]);
  }
  if (order.type === 'delivery' && status === 'delivered') {
    runSql(
      "UPDATE delivery_assignments SET status = 'delivered', delivered_at = datetime('now') WHERE order_id = ? AND status != 'delivered'",
      [order.id]
    );
  }
  logAudit({
    actorUserId: req.user.id,
    actorName: req.user.full_name || req.user.username || '',
    action: 'order.status.update',
    resourceType: 'order',
    resourceId: req.params.id,
    details: {
      from: order.status,
      to: status,
      ...(status === 'cancelled'
        ? { cancellation_reason: String(cancellationReasonRaw || '').trim() || undefined }
        : {}),
    },
  });

  const updated = getOrderWithItems(req.params.id);
  const io = req.app.get('io');
  if (io) { io.emit('order-update', updated); if (status === 'ready') io.emit('order-ready', updated); }
  res.json(updated);
});

router.put('/:id/payment', authenticateToken, requireRole('admin', 'cajero', 'mozo'), (req, res) => {
  const { payment_method, payment_status } = req.body;
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  const nextPaymentMethod = payment_method ? normalizePaymentMethod(payment_method, { allowOnline: true, fallback: order.payment_method || 'efectivo' }) : null;
  if (payment_method) {
    try {
      assertPaymentMethodAllowed(nextPaymentMethod, { allowOnline: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  if (payment_status && !['pending', 'paid', 'refunded'].includes(String(payment_status))) {
    return res.status(400).json({ error: 'Estado de pago inválido' });
  }
  runSql("UPDATE orders SET payment_method = COALESCE(?, payment_method), payment_status = COALESCE(?, payment_status), updated_at = datetime('now') WHERE id = ?", [nextPaymentMethod, payment_status, req.params.id]);
  if (payment_method) {
    runSql(
      "UPDATE electronic_documents SET payment_method = ?, updated_at = datetime('now') WHERE order_id = ?",
      [nextPaymentMethod, req.params.id]
    );
  }
  res.json(getOrderWithItems(req.params.id));
});

router.put('/:id/discount', authenticateToken, requireRole('admin', 'cajero', 'mozo'), (req, res) => {
  const { discount, reason } = req.body;
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (discount === undefined || discount === null || Number.isNaN(Number(discount))) {
    return res.status(400).json({ error: 'Descuento inválido' });
  }

  const baseTotal = getChargeBase(order);
  const safeDiscount = Math.max(0, Math.min(Number(discount), baseTotal));
  const newTotal = Math.max(0, baseTotal - safeDiscount);
  const discountNote = reason ? ` [DESCUENTO: ${reason}]` : '';

  runSql(
    "UPDATE orders SET discount = ?, total = ?, notes = COALESCE(notes, '') || ?, updated_at = datetime('now') WHERE id = ?",
    [safeDiscount, newTotal, discountNote, req.params.id]
  );
  logAudit({
    actorUserId: req.user.id,
    actorName: req.user.full_name || req.user.username || '',
    action: 'order.discount.update',
    resourceType: 'order',
    resourceId: req.params.id,
    details: { discount: safeDiscount, reason: reason || '' },
  });

  res.json(getOrderWithItems(req.params.id));
});

module.exports = router;
