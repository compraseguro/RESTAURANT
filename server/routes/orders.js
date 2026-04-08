const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql, withTransaction, logAudit } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { assertPaymentMethodAllowed } = require('../businessRules');
const { getOrderWithItems, createOrderInTransaction, actorFromRequest } = require('../orderCreateService');

const router = express.Router();
const ORDER_TRANSITIONS = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

function getChargeBase(order) {
  return Math.max(
    0,
    Number(order?.subtotal || 0) + Number(order?.delivery_fee || 0)
  );
}

function recalculateProductStock(productId) {
  const sum = queryOne(
    'SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_warehouse_stocks WHERE product_id = ?',
    [productId]
  );
  const total = Number(sum?.total || 0);
  runSql('UPDATE products SET stock = ?, updated_at = datetime(\'now\') WHERE id = ?', [total, productId]);
  return total;
}

function ensureWarehouseRowsForProduct(product) {
  const currentRows = queryAll('SELECT * FROM inventory_warehouse_stocks WHERE product_id = ?', [product.id]);
  if (currentRows.length > 0) return currentRows;
  const preferred = queryOne('SELECT id, name FROM warehouse_locations WHERE id = ? AND is_active = 1', [product.stock_warehouse_id]);
  const principal = queryOne('SELECT id, name FROM warehouse_locations WHERE LOWER(name) = LOWER(?) AND is_active = 1', ['Almacen Principal']);
  const target = preferred || principal || queryOne('SELECT id, name FROM warehouse_locations WHERE is_active = 1 ORDER BY name LIMIT 1');
  if (!target) return [];
  runSql(
    'INSERT INTO inventory_warehouse_stocks (id, product_id, warehouse_id, quantity, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
    [uuidv4(), product.id, target.id, Number(product.stock || 0)]
  );
  return queryAll('SELECT * FROM inventory_warehouse_stocks WHERE product_id = ?', [product.id]);
}

function deductFromWarehouses(product, quantityNeeded) {
  const rows = ensureWarehouseRowsForProduct(product);
  if (rows.length === 0) return false;

  const preferredId = product.stock_warehouse_id || '';
  const sortedRows = [...rows].sort((a, b) => {
    if (a.warehouse_id === preferredId) return -1;
    if (b.warehouse_id === preferredId) return 1;
    return Number(b.quantity || 0) - Number(a.quantity || 0);
  });

  let pending = Number(quantityNeeded || 0);
  for (const row of sortedRows) {
    if (pending <= 0) break;
    const available = Number(row.quantity || 0);
    if (available <= 0) continue;
    const consume = Math.min(available, pending);
    runSql(
      'UPDATE inventory_warehouse_stocks SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [available - consume, row.id]
    );
    pending -= consume;
  }

  if (pending > 0) return false;
  recalculateProductStock(product.id);
  return true;
}

function addToWarehouses(product, quantityToAdd) {
  const rows = ensureWarehouseRowsForProduct(product);
  if (rows.length === 0) {
    runSql('UPDATE products SET stock = stock + ?, updated_at = datetime(\'now\') WHERE id = ?', [quantityToAdd, product.id]);
    return;
  }
  const preferredId = product.stock_warehouse_id || rows[0].warehouse_id;
  const target = rows.find(r => r.warehouse_id === preferredId) || rows[0];
  const current = Number(target.quantity || 0);
  runSql(
    'UPDATE inventory_warehouse_stocks SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [current + Number(quantityToAdd || 0), target.id]
  );
  recalculateProductStock(product.id);
}

function isBarText(value = '') {
  const text = String(value || '').toLowerCase();
  return ['bar', 'bebida', 'bebidas', 'trago', 'tragos', 'coctel', 'cocteles', 'cocktail', 'cocktails'].some(token => text.includes(token));
}

function getOrderItemsWithArea(orderId) {
  return queryAll(
    `SELECT oi.*,
            LOWER(COALESCE(c.name, '')) as category_name_lc
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE oi.order_id = ?`,
    [orderId]
  );
}

function isBarOnlyOrder(items = []) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(item => isBarText(item.category_name_lc) || isBarText(item.product_name));
}

router.get('/', authenticateToken, (req, res) => {
  const { status, type, date, limit: lim } = req.query;
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (req.user.type === 'customer') { query += ' AND customer_id = ?'; params.push(req.user.id); }
  if (req.user.role === 'delivery') {
    // Delivery role can only consume active delivery queue (no history).
    query += " AND type = 'delivery' AND status IN ('pending', 'preparing', 'ready')";
  } else {
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (type) { query += ' AND type = ?'; params.push(type); }
    if (date) { query += ' AND DATE(created_at) = ?'; params.push(date); }
  }
  query += ' ORDER BY created_at DESC';
  if (lim) { query += ' LIMIT ?'; params.push(parseInt(lim)); }

  const orders = queryAll(query, params);
  orders.forEach(o => { o.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]); });
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
  orders.forEach(o => { o.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]); });
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

router.get('/print-config', authenticateToken, requireRole('admin', 'cajero', 'mozo', 'cocina', 'bar'), (req, res) => {
  const settingsRow = queryOne('SELECT value FROM app_settings WHERE key = ?', ['settings']);
  let settings = {};
  try {
    settings = settingsRow?.value ? JSON.parse(settingsRow.value) : {};
  } catch (_) {
    settings = {};
  }
  const restaurant = queryOne('SELECT name, address, phone, logo FROM restaurants LIMIT 1') || {};
  const printers = Array.isArray(settings?.impresoras) ? settings.impresoras : [];
  const pickPrinter = (kind) => {
    const byName = printers.find((p) => String(p?.name || '').toLowerCase().includes(kind));
    const byArea = printers.find((p) => String(p?.area || '').toLowerCase().includes(kind));
    const selected = byName || byArea || null;
    return {
      name: selected?.name || (kind === 'bar' ? 'Impresora Bar' : 'Impresora Cocina'),
      area: selected?.area || (kind === 'bar' ? 'Comandas Bar' : 'Comandas'),
      width_mm: Number(selected?.width_mm || 80),
      copies: Number(selected?.copies || 1),
      active: Number(selected?.active ?? 1),
    };
  };
  res.json({
    restaurant,
    printers: {
      cocina: pickPrinter('cocina'),
      bar: pickPrinter('bar'),
    },
  });
});

router.get('/:id', authenticateToken, (req, res) => {
  const order = getOrderWithItems(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (req.user.type === 'customer' && order.customer_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes acceso a este pedido' });
  }
  if (req.user.role === 'delivery') {
    const visibleStatuses = ['pending', 'preparing', 'ready'];
    if (order.type !== 'delivery' || !visibleStatuses.includes(order.status)) {
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
  const { status } = req.body;
  const valid = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Estado inválido' });

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
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
    const items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    items.forEach(item => {
      const product = queryOne('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!product) return;
      if (product.process_type !== 'non_transformed') return;
      addToWarehouses(product, Number(item.quantity || 0));
    });
  }

  runSql("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, req.params.id]);
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
    details: { from: order.status, to: status },
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
