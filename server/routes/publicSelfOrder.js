const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, withTransaction } = require('../database');
const { assertPaymentMethodAllowed } = require('../businessRules');
const { createOrderInTransaction, getOrderWithItems } = require('../orderCreateService');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const selfOrderPostLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
});

function parseAppSettingsObject() {
  const row = queryOne('SELECT value FROM app_settings WHERE key = ?', ['settings']);
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

function getAutoPedidoCartas() {
  const s = parseAppSettingsObject();
  const raw = s.auto_pedido_cartas;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c, i) => ({
      id: String(c.id || `carta-${i}`),
      name: String(c.name || `Carta ${i + 1}`),
      url: String(c.url || '').trim(),
      sort: Number(c.sort ?? i),
    }))
    .filter((c) => c.url)
    .sort((a, b) => a.sort - b.sort);
}

function findTableByMesa(mesaRaw) {
  const mesa = String(mesaRaw ?? '').trim();
  if (!mesa) return null;
  return queryOne('SELECT * FROM tables WHERE TRIM(CAST(number AS TEXT)) = ?', [mesa]);
}

function loadProductsMenu() {
  const query =
    'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.is_active = 1 AND COALESCE(TRIM(p.category_id), \'\') <> \'\' ORDER BY c.sort_order, p.name';
  const products = queryAll(query);
  const variants = queryAll('SELECT * FROM product_variants WHERE is_active = 1');
  const variantMap = {};
  variants.forEach((v) => {
    if (!variantMap[v.product_id]) variantMap[v.product_id] = [];
    variantMap[v.product_id].push(v);
  });
  products.forEach((p) => {
    p.variants = variantMap[p.id] || [];
  });
  return products;
}

function loadCategoriesActive() {
  return queryAll(
    `SELECT c.*, COUNT(p.id) as product_count FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
     WHERE c.is_active = 1 GROUP BY c.id ORDER BY c.sort_order ASC`
  );
}

function loadModifiersPublic() {
  const modifiers = queryAll(
    "SELECT * FROM modifiers WHERE COALESCE(active, 1) = 1 ORDER BY created_at DESC"
  );
  modifiers.forEach((m) => {
    m.options = queryAll('SELECT option_name FROM modifier_options WHERE modifier_id = ?', [m.id]).map(
      (o) => o.option_name
    );
  });
  return modifiers;
}

function activeOrdersForTableNumber(tableNumber) {
  const key = String(tableNumber);
  const orders = queryAll(
    "SELECT * FROM orders WHERE table_number = ? AND status IN ('pending','preparing','ready') ORDER BY created_at DESC",
    [key]
  );
  orders.forEach((o) => {
    o.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
  });
  return orders;
}

router.get('/bootstrap', (req, res) => {
  try {
    const mesa = String(req.query.mesa || '').trim();
    if (!mesa) {
      return res.status(400).json({ error: 'Parámetro mesa requerido' });
    }
    const table = findTableByMesa(mesa);
    if (!table) {
      return res.status(404).json({ error: 'Mesa no encontrada' });
    }
    res.json({
      table: { id: table.id, number: table.number, name: table.name, zone: table.zone },
      products: loadProductsMenu(),
      categories: loadCategoriesActive(),
      modifiers: loadModifiersPublic(),
      cartas: getAutoPedidoCartas(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al cargar datos' });
  }
});

router.get('/orders', (req, res) => {
  try {
    const mesa = String(req.query.mesa || '').trim();
    if (!mesa) return res.status(400).json({ error: 'Parámetro mesa requerido' });
    const table = findTableByMesa(mesa);
    if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });
    res.json(activeOrdersForTableNumber(table.number));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al listar pedidos' });
  }
});

router.post('/orders', selfOrderPostLimiter, (req, res) => {
  const mesa = String(req.body?.mesa || req.body?.table_number || '').trim();
  const { items, payment_method, notes, customer_name } = req.body || {};

  if (!mesa) return res.status(400).json({ error: 'Número de mesa requerido' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un producto' });
  }

  const table = findTableByMesa(mesa);
  if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });

  if (String(req.body?.table_number || '').trim() && String(req.body.table_number).trim() !== String(table.number)) {
    return res.status(400).json({ error: 'Datos de mesa inconsistentes' });
  }

  const requestedPaymentMethod = String(payment_method || '').trim().toLowerCase();
  if (requestedPaymentMethod) {
    try {
      assertPaymentMethodAllowed(requestedPaymentMethod, { allowOnline: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const orderId = uuidv4();
  const body = {
    items,
    type: 'dine_in',
    table_number: String(table.number),
    delivery_address: '',
    notes: notes || '',
    payment_method: payment_method || 'efectivo',
    customer_name: String(customer_name || '').trim() || `Mesa ${table.number}`,
    discount: 0,
    customer_id: null,
  };

  try {
    const result = withTransaction((tx) => createOrderInTransaction(tx, orderId, body, { kind: 'public_qr' }));
    const order = getOrderWithItems(result.orderId);
    const io = req.app.get('io');
    if (io) {
      io.emit('new-order', order);
      io.emit('order-update', order);
      io.emit('table-update', table);
    }
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo crear el pedido' });
  }
});

module.exports = router;
