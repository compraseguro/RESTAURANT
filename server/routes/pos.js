const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql, withTransaction, logAudit } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { assertPaymentMethodAllowed, normalizePaymentMethod } = require('../businessRules');

const router = express.Router();

function getChargeBase(order) {
  return Math.max(
    0,
    Number(order?.subtotal || 0) + Number(order?.delivery_fee || 0)
  );
}

function getOpenRegister(userId) {
  return queryOne('SELECT * FROM cash_registers WHERE user_id = ? AND closed_at IS NULL', [userId]);
}

function getAnyOpenRegister() {
  return queryOne(
    `SELECT cr.*, u.full_name as cajero_name
     FROM cash_registers cr
     JOIN users u ON u.id = cr.user_id
     WHERE cr.closed_at IS NULL
     ORDER BY datetime(cr.opened_at) DESC
     LIMIT 1`
  );
}

/** Cajero: solo su caja abierta. Admin: la propia o puede operar sobre la última sesión abierta (cualquier cajero). */
function getAccessibleOpenRegister(user) {
  const own = getOpenRegister(user?.id);
  if (own) return own;
  if (String(user?.role || '').toLowerCase() === 'admin') return getAnyOpenRegister();
  return null;
}

function getMovementTotals(registerId) {
  return queryOne(
    `SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
     FROM cash_movements
     WHERE register_id = ?`,
    [registerId]
  ) || { total_income: 0, total_expense: 0 };
}
const SALES_EVENT_AT_SQL = 'COALESCE(updated_at, created_at)';
async function sendCashCloseNotification({
  register,
  sales,
  movements,
  expectedCash,
  countedCash,
  difference,
  notes,
  closedByName,
}) {
  const endpoint = String(process.env.CASH_CLOSE_FORM_URL || '').trim();
  if (!endpoint) return;

  const notifyEnabled = String(process.env.CASH_CLOSE_NOTIFY_ENABLED || '1').trim() !== '0';
  if (!notifyEnabled) return;

  const restaurant = queryOne('SELECT name FROM restaurants LIMIT 1');
  const restaurantName = restaurant?.name || 'Resto-FADEY';
  const toEmail = String(process.env.CASH_CLOSE_EMAIL || '').trim();
  const closeDate = new Date().toISOString();
  const subject = `[Caja] Cierre registrado - ${restaurantName}`;
  const messageLines = [
    `Restaurante: ${restaurantName}`,
    `Caja: ${register.id}`,
    `Cajero: ${closedByName || '-'}`,
    `Apertura: ${register.opened_at || '-'}`,
    `Cierre: ${closeDate}`,
    `Ventas: ${Number(sales.total_sales || 0)}`,
    `Efectivo ventas: ${Number(sales.total_cash || 0)}`,
    `Yape: ${Number(sales.total_yape || 0)}`,
    `Plin: ${Number(sales.total_plin || 0)}`,
    `Tarjeta: ${Number(sales.total_card || 0)}`,
    `Ingresos caja: ${Number(movements.total_income || 0)}`,
    `Egresos caja: ${Number(movements.total_expense || 0)}`,
    `Efectivo esperado: ${Number(expectedCash || 0)}`,
    `Efectivo contado: ${Number(countedCash || 0)}`,
    `Diferencia: ${Number(difference || 0)}`,
    `Observaciones: ${notes || '-'}`,
  ];

  const body = {
    subject,
    message: messageLines.join('\n'),
    restaurant_name: restaurantName,
    register_id: register.id,
    opened_at: register.opened_at,
    closed_at: closeDate,
    closed_by: closedByName || '',
    order_count: Number(sales.order_count || 0),
    total_sales: Number(sales.total_sales || 0),
    total_cash: Number(sales.total_cash || 0),
    total_yape: Number(sales.total_yape || 0),
    total_plin: Number(sales.total_plin || 0),
    total_card: Number(sales.total_card || 0),
    total_income: Number(movements.total_income || 0),
    total_expense: Number(movements.total_expense || 0),
    expected_cash: Number(expectedCash || 0),
    counted_cash: Number(countedCash || 0),
    difference: Number(difference || 0),
    notes: notes || '',
    to_email: toEmail,
    _replyto: toEmail,
    _subject: subject,
  };

  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => ctrl?.abort(), 8000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl?.signal,
    });
    if (!response.ok) {
      const payload = await response.text().catch(() => '');
      throw new Error(`No se pudo notificar cierre (${response.status}) ${payload}`.trim());
    }
  } finally {
    clearTimeout(timeout);
  }
}

router.post('/open-register', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { opening_amount } = req.body;
  if (opening_amount === undefined || opening_amount === null || Number.isNaN(Number(opening_amount))) {
    return res.status(400).json({ error: 'Debes ingresar el monto inicial de caja' });
  }
  if (Number(opening_amount) < 0) {
    return res.status(400).json({ error: 'El monto inicial no puede ser negativo' });
  }
  const existing = getOpenRegister(req.user.id);
  if (existing) return res.status(400).json({ error: 'Ya tienes una caja abierta', register: existing });

  const restaurant = queryOne('SELECT id FROM restaurants LIMIT 1');
  const id = uuidv4();
  runSql('INSERT INTO cash_registers (id, user_id, restaurant_id, opening_amount) VALUES (?, ?, ?, ?)', [id, req.user.id, restaurant?.id, Number(opening_amount)]);
  logAudit({
    actorUserId: req.user.id,
    actorName: req.user.full_name || req.user.username || '',
    action: 'cash_register.open',
    resourceType: 'cash_register',
    resourceId: id,
    details: { opening_amount: Number(opening_amount) },
  });
  res.status(201).json(queryOne('SELECT * FROM cash_registers WHERE id = ?', [id]));
});

router.get('/current-register', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.json(null);

  const sales = queryOne(`SELECT COALESCE(SUM(total), 0) as total_sales,
    COALESCE(SUM(CASE WHEN payment_method = 'efectivo' THEN total ELSE 0 END), 0) as total_cash,
    COALESCE(SUM(CASE WHEN payment_method = 'yape' THEN total ELSE 0 END), 0) as total_yape,
    COALESCE(SUM(CASE WHEN payment_method = 'plin' THEN total ELSE 0 END), 0) as total_plin,
    COALESCE(SUM(CASE WHEN payment_method = 'tarjeta' THEN total ELSE 0 END), 0) as total_card,
    COUNT(*) as order_count
    FROM orders WHERE ${SALES_EVENT_AT_SQL} >= ? AND status != 'cancelled' AND payment_status = 'paid'`, [register.opened_at]);

  const movements = getMovementTotals(register.id);
  const expectedCash = Number(register.opening_amount || 0)
    + Number(sales.total_cash || 0)
    + Number(movements.total_income || 0)
    - Number(movements.total_expense || 0);

  res.json({ ...register, ...sales, ...movements, expected_cash: expectedCash });
});

router.post('/close-register', authenticateToken, requireRole('admin', 'cajero'), async (req, res) => {
  const { closing_amount, notes, arqueo } = req.body;
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.status(400).json({ error: 'No tienes una caja abierta' });
  if (closing_amount === undefined || closing_amount === null || Number.isNaN(Number(closing_amount))) {
    return res.status(400).json({ error: 'Debes ingresar el efectivo contado para cerrar caja' });
  }
  if (Number(closing_amount) < 0) {
    return res.status(400).json({ error: 'El efectivo contado no puede ser negativo' });
  }

  const sales = queryOne(`SELECT COALESCE(SUM(total), 0) as total_sales,
    COALESCE(SUM(CASE WHEN payment_method = 'efectivo' THEN total ELSE 0 END), 0) as total_cash,
    COALESCE(SUM(CASE WHEN payment_method = 'yape' THEN total ELSE 0 END), 0) as total_yape,
    COALESCE(SUM(CASE WHEN payment_method = 'plin' THEN total ELSE 0 END), 0) as total_plin,
    COALESCE(SUM(CASE WHEN payment_method = 'tarjeta' THEN total ELSE 0 END), 0) as total_card,
    COUNT(*) as order_count
    FROM orders WHERE ${SALES_EVENT_AT_SQL} >= ? AND status != 'cancelled' AND payment_status = 'paid'`, [register.opened_at]);

  const movements = getMovementTotals(register.id);
  const expectedCash = Number(register.opening_amount || 0)
    + Number(sales.total_cash || 0)
    + Number(movements.total_income || 0)
    - Number(movements.total_expense || 0);
  const countedCash = Number(closing_amount);
  const diff = countedCash - expectedCash;
  const closedAtIso = new Date().toISOString();
  const denominationSummary = arqueo?.denominations || {};
  const arqueoData = JSON.stringify({
    register_id: register.id,
    opened_at: register.opened_at,
    opening_amount: Number(register.opening_amount || 0),
    expected_cash: expectedCash,
    counted_cash: countedCash,
    difference: diff,
    denominations: denominationSummary,
    payment_breakdown: {
      efectivo: Number(sales.total_cash || 0),
      yape: Number(sales.total_yape || 0),
      plin: Number(sales.total_plin || 0),
      tarjeta: Number(sales.total_card || 0),
    },
    cash_movements: {
      income: Number(movements.total_income || 0),
      expense: Number(movements.total_expense || 0),
    },
    total_sales: Number(sales.total_sales || 0),
    order_count: Number(sales.order_count || 0),
    observations: arqueo?.observations || notes || '',
    closed_by: req.user.id,
    closed_by_name: req.user.full_name,
    closed_at: closedAtIso,
  });

  runSql("UPDATE cash_registers SET closed_at = datetime('now'), closing_amount = ?, total_sales = ?, total_cash = ?, total_yape = ?, total_plin = ?, total_card = ?, notes = ?, arqueo_data = ? WHERE id = ?",
    [countedCash, sales.total_sales, sales.total_cash, sales.total_yape, sales.total_plin, sales.total_card, notes || '', arqueoData, register.id]);
  logAudit({
    actorUserId: req.user.id,
    actorName: req.user.full_name || req.user.username || '',
    action: 'cash_register.close',
    resourceType: 'cash_register',
    resourceId: register.id,
    details: { closing_amount: countedCash, expected_cash: expectedCash, difference: diff },
  });

  const closedRegister = queryOne('SELECT * FROM cash_registers WHERE id = ?', [register.id]);
  try {
    await sendCashCloseNotification({
      register: closedRegister || register,
      sales,
      movements,
      expectedCash,
      countedCash,
      difference: diff,
      notes: notes || '',
      closedByName: req.user.full_name || req.user.username || '',
    });
  } catch (notifyErr) {
    console.error('[close-register] aviso externo fallido:', notifyErr.message);
  }

  res.json(closedRegister);
});

router.post('/send-close-email', authenticateToken, requireRole('admin', 'cajero'), async (req, res) => {
  const { closing_amount, notes, arqueo } = req.body || {};
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.status(400).json({ error: 'No tienes una caja abierta' });
  if (closing_amount === undefined || closing_amount === null || Number.isNaN(Number(closing_amount))) {
    return res.status(400).json({ error: 'Debes ingresar el efectivo contado para enviar el reporte' });
  }
  if (Number(closing_amount) < 0) {
    return res.status(400).json({ error: 'El efectivo contado no puede ser negativo' });
  }

  const sales = queryOne(`SELECT COALESCE(SUM(total), 0) as total_sales,
    COALESCE(SUM(CASE WHEN payment_method = 'efectivo' THEN total ELSE 0 END), 0) as total_cash,
    COALESCE(SUM(CASE WHEN payment_method = 'yape' THEN total ELSE 0 END), 0) as total_yape,
    COALESCE(SUM(CASE WHEN payment_method = 'plin' THEN total ELSE 0 END), 0) as total_plin,
    COALESCE(SUM(CASE WHEN payment_method = 'tarjeta' THEN total ELSE 0 END), 0) as total_card,
    COUNT(*) as order_count
    FROM orders WHERE ${SALES_EVENT_AT_SQL} >= ? AND status != 'cancelled' AND payment_status = 'paid'`, [register.opened_at]);
  const movements = getMovementTotals(register.id);
  const expectedCash = Number(register.opening_amount || 0)
    + Number(sales.total_cash || 0)
    + Number(movements.total_income || 0)
    - Number(movements.total_expense || 0);
  const countedCash = Number(closing_amount);
  const diff = countedCash - expectedCash;

  try {
    await sendCashCloseNotification({
      register,
      sales,
      movements,
      expectedCash,
      countedCash,
      difference: diff,
      notes: String(arqueo?.observations || notes || '').trim(),
      closedByName: req.user.full_name || req.user.username || '',
    });
    return res.json({ success: true, message: 'Reporte enviado al correo configurado' });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'No se pudo enviar el reporte por correo' });
  }
});

router.post('/checkout-table', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { order_ids: orderIdsRaw, payment_method: paymentMethodRaw, discount_reason: discountReason = '', discounts_by_order: discountsByOrder = {} } = req.body || {};
  const orderIds = Array.isArray(orderIdsRaw) ? orderIdsRaw.filter(Boolean) : [];
  if (!orderIds.length) return res.status(400).json({ error: 'Debes enviar al menos un pedido para cobrar' });
  const paymentMethod = normalizePaymentMethod(paymentMethodRaw, { allowOnline: true, fallback: 'efectivo' });
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.status(400).json({ error: 'No tienes una caja abierta para cobrar' });
  try {
    assertPaymentMethodAllowed(paymentMethod, { allowOnline: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const result = withTransaction((tx) => {
      const updated = [];
      orderIds.forEach((orderId) => {
        const order = tx.queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) throw new Error(`Pedido no encontrado: ${orderId}`);
        if (order.status === 'cancelled') throw new Error(`No puedes cobrar un pedido anulado: ${order.order_number}`);
        if (order.status === 'delivered' && order.payment_status === 'paid') {
          updated.push(order.id);
          return;
        }
        const extraDiscount = Math.max(0, Number(discountsByOrder[orderId] || 0));
        if (extraDiscount > 0) {
          const baseTotal = getChargeBase(order);
          const nextDiscount = Math.max(0, Math.min(baseTotal, Number(order.discount || 0) + extraDiscount));
          const nextTotal = Math.max(0, baseTotal - nextDiscount);
          const note = discountReason ? ` [DESCUENTO: ${discountReason}]` : '';
          tx.run(
            "UPDATE orders SET discount = ?, total = ?, notes = COALESCE(notes, '') || ?, updated_at = datetime('now') WHERE id = ?",
            [nextDiscount, nextTotal, note, order.id]
          );
        }
        tx.run(
          "UPDATE orders SET payment_method = ?, payment_status = 'paid', status = 'delivered', updated_at = datetime('now') WHERE id = ?",
          [paymentMethod, order.id]
        );
        tx.run(
          "UPDATE electronic_documents SET payment_method = ?, updated_at = datetime('now') WHERE order_id = ?",
          [paymentMethod, order.id]
        );
        updated.push(order.id);
      });
      return updated;
    });

    /** Demo/pruebas: si ya no queda ningún pedido sin cobrar, el siguiente pedido vuelve a numerarse desde #1. */
    const unpaidRow = queryOne(
      "SELECT COUNT(*) as c FROM orders WHERE status != 'cancelled' AND IFNULL(payment_status, '') != 'paid'"
    );
    if (Number(unpaidRow?.c || 0) === 0) {
      runSql('UPDATE order_sequence SET current_number = 0 WHERE id = 1');
    }

    const paidOrders = result.map((id) => queryOne('SELECT * FROM orders WHERE id = ?', [id])).filter(Boolean);
    logAudit({
      actorUserId: req.user.id,
      actorName: req.user.full_name || req.user.username || '',
      action: 'table.checkout',
      resourceType: 'order_batch',
      resourceId: paidOrders.map(o => o.id).join(','),
      details: { order_count: paidOrders.length, payment_method: paymentMethod },
    });
    res.json({ success: true, orders: paidOrders });
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo cobrar la mesa' });
  }
});

router.get('/register-status', authenticateToken, requireRole('admin', 'cajero', 'mozo'), (req, res) => {
  const openCount = queryOne('SELECT COUNT(*) as c FROM cash_registers WHERE closed_at IS NULL');
  const openRegister = queryOne(
    `SELECT cr.id, cr.user_id, cr.opened_at, u.full_name as cajero_name
     FROM cash_registers cr
     JOIN users u ON u.id = cr.user_id
     WHERE cr.closed_at IS NULL
     ORDER BY datetime(cr.opened_at) DESC
     LIMIT 1`
  );
  res.json({
    is_open: Number(openCount?.c || 0) > 0,
    register: openRegister || null,
    open_count: Number(openCount?.c || 0),
  });
});

router.get('/history', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  res.json(queryAll('SELECT cr.*, u.full_name as user_name FROM cash_registers cr JOIN users u ON u.id = cr.user_id ORDER BY cr.opened_at DESC LIMIT 30'));
});

router.post('/movements', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { type, amount, concept } = req.body;
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Tipo de movimiento inválido' });
  if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Monto inválido' });
  }
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.status(400).json({ error: 'No tienes una caja abierta' });
  const id = uuidv4();
  runSql(
    'INSERT INTO cash_movements (id, register_id, user_id, type, amount, concept) VALUES (?, ?, ?, ?, ?, ?)',
    [id, register.id, req.user.id, type, Number(amount), concept || '']
  );
  res.status(201).json(queryOne('SELECT * FROM cash_movements WHERE id = ?', [id]));
});

router.get('/movements', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { type } = req.query;
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.json([]);
  let sql = `SELECT cm.*, u.full_name as user_name
             FROM cash_movements cm
             LEFT JOIN users u ON u.id = cm.user_id
             WHERE cm.register_id = ?`;
  const params = [register.id];
  if (type && ['income', 'expense'].includes(type)) {
    sql += ' AND cm.type = ?';
    params.push(type);
  }
  sql += ' ORDER BY cm.created_at DESC LIMIT 100';
  res.json(queryAll(sql, params));
});

router.post('/notes', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { note_type, amount, reason } = req.body;
  if (!['credit', 'debit'].includes(note_type)) return res.status(400).json({ error: 'Tipo de nota inválido' });
  if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Monto inválido' });
  }
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.status(400).json({ error: 'No tienes una caja abierta' });
  const id = uuidv4();
  runSql(
    'INSERT INTO cash_notes (id, register_id, user_id, note_type, amount, reason) VALUES (?, ?, ?, ?, ?, ?)',
    [id, register.id, req.user.id, note_type, Number(amount), reason || '']
  );
  res.status(201).json(queryOne('SELECT * FROM cash_notes WHERE id = ?', [id]));
});

router.get('/notes', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { note_type } = req.query;
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.json([]);
  let sql = `SELECT cn.*, u.full_name as user_name
             FROM cash_notes cn
             LEFT JOIN users u ON u.id = cn.user_id
             WHERE cn.register_id = ?`;
  const params = [register.id];
  if (note_type && ['credit', 'debit'].includes(note_type)) {
    sql += ' AND cn.note_type = ?';
    params.push(note_type);
  }
  sql += ' ORDER BY cn.created_at DESC LIMIT 100';
  res.json(queryAll(sql, params));
});

router.get('/sales-monitor', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const register = getAccessibleOpenRegister(req.user);
  if (!register) return res.json({ hourly: [], by_payment: [], order_count: 0, total_sales: 0 });
  const hourly = queryAll(
    `SELECT strftime('%H', created_at) as hour,
            COUNT(*) as orders,
            COALESCE(SUM(total), 0) as total
     FROM orders
     WHERE ${SALES_EVENT_AT_SQL} >= ? AND status != 'cancelled' AND payment_status = 'paid'
     GROUP BY strftime('%H', created_at)
     ORDER BY hour`,
    [register.opened_at]
  );
  const byPayment = queryAll(
    `SELECT payment_method,
            COUNT(*) as count,
            COALESCE(SUM(total), 0) as total
     FROM orders
     WHERE ${SALES_EVENT_AT_SQL} >= ? AND status != 'cancelled' AND payment_status = 'paid'
     GROUP BY payment_method
     ORDER BY total DESC`,
    [register.opened_at]
  );
  const summary = queryOne(
    `SELECT COUNT(*) as order_count, COALESCE(SUM(total), 0) as total_sales
     FROM orders
     WHERE ${SALES_EVENT_AT_SQL} >= ? AND status != 'cancelled' AND payment_status = 'paid'`,
    [register.opened_at]
  );
  res.json({ hourly, by_payment: byPayment, ...summary });
});

router.get('/price-lookup', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { q } = req.query;
  let sql = `SELECT p.id, p.name, p.price, p.stock, c.name as category_name
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.is_active = 1`;
  const params = [];
  if (q) {
    sql += ' AND (p.name LIKE ? OR c.name LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY p.name ASC LIMIT 100';
  res.json(queryAll(sql, params));
});

router.get('/z-report', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const register = queryOne(
    `SELECT cr.*, u.full_name as user_name
     FROM cash_registers cr
     LEFT JOIN users u ON u.id = cr.user_id
     WHERE cr.closed_at IS NOT NULL
     ORDER BY cr.closed_at DESC
     LIMIT 1`
  );
  if (!register) return res.status(404).json({ error: 'No hay cierre Z disponible' });
  let arqueo = {};
  try { arqueo = JSON.parse(register.arqueo_data || '{}'); } catch (_) { arqueo = {}; }
  const movements = queryAll(
    'SELECT * FROM cash_movements WHERE register_id = ? ORDER BY created_at ASC',
    [register.id]
  );
  const notes = queryAll(
    'SELECT * FROM cash_notes WHERE register_id = ? ORDER BY created_at ASC',
    [register.id]
  );
  res.json({ ...register, arqueo, movements, notes });
});

module.exports = router;
