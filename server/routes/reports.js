const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { FINANCIAL_FILTER_SQL } = require('../businessRules');
const { getEffectiveFlat } = require('../services/businessConfigService');

const router = express.Router();
const FINANCIAL_FILTER = FINANCIAL_FILTER_SQL;
const SALES_EVENT_AT_SQL = 'COALESCE(updated_at, created_at)';
const SALES_EVENT_LOCAL_SQL = `datetime(${SALES_EVENT_AT_SQL}, 'localtime')`;
const SALES_EVENT_DATE_SQL = `DATE(${SALES_EVENT_LOCAL_SQL})`;
const SALES_EVENT_MONTH_SQL = `strftime('%Y-%m', ${SALES_EVENT_LOCAL_SQL})`;
const SALES_EVENT_HOUR_SQL = `strftime('%H', ${SALES_EVENT_LOCAL_SQL})`;
const SALES_EVENT_ORDER_LOCAL_SQL = `datetime(COALESCE(o.updated_at, o.created_at), 'localtime')`;
const SALES_EVENT_ORDER_MONTH_SQL = `strftime('%Y-%m', ${SALES_EVENT_ORDER_LOCAL_SQL})`;
const SALES_EVENT_ORDER_DATE_SQL = `DATE(${SALES_EVENT_ORDER_LOCAL_SQL})`;

function parseArqueoData(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

router.get('/dashboard', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const todaySales = queryOne(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE ${SALES_EVENT_DATE_SQL} = ? AND ${FINANCIAL_FILTER}`, [today]);
  const monthSales = queryOne(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE ${SALES_EVENT_MONTH_SQL} = strftime('%Y-%m', 'now', 'localtime') AND ${FINANCIAL_FILTER}`);
  const activeOrders = queryOne("SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'preparing', 'ready')");
  const topProducts = queryAll(`SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid' AND ${SALES_EVENT_ORDER_MONTH_SQL} = strftime('%Y-%m', 'now', 'localtime') GROUP BY oi.product_name ORDER BY total_sold DESC LIMIT 10`);
  const recentOrders = queryAll('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
  recentOrders.forEach(o => { o.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]); });
  const lowStock = queryAll('SELECT * FROM products WHERE stock <= 10 AND is_active = 1 ORDER BY stock ASC LIMIT 10');
  const paymentMethods = queryAll(`SELECT payment_method, COUNT(*) as count, SUM(total) as total FROM orders WHERE ${SALES_EVENT_DATE_SQL} = ? AND ${FINANCIAL_FILTER} GROUP BY payment_method`, [today]);

  res.json({ today: todaySales, month: monthSales, activeOrders: activeOrders.count, topProducts, recentOrders, lowStock, paymentMethods });
});

router.get('/daily', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const register = queryOne("SELECT * FROM cash_registers WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1");

  const sales = queryOne(
    `SELECT COUNT(*) as order_count, COALESCE(SUM(total), 0) as total_sales, COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax), 0) as total_tax, COALESCE(SUM(discount), 0) as total_discount FROM orders WHERE ${SALES_EVENT_DATE_SQL} = ? AND ${FINANCIAL_FILTER}`,
    [today]
  );

  const hourly = queryAll(
    `SELECT ${SALES_EVENT_HOUR_SQL} as hour, COUNT(*) as orders, COALESCE(SUM(total), 0) as total FROM orders WHERE ${SALES_EVENT_DATE_SQL} = ? AND ${FINANCIAL_FILTER} GROUP BY ${SALES_EVENT_HOUR_SQL} ORDER BY hour`,
    [today]
  );

  const paymentMethods = queryAll(
    `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE ${SALES_EVENT_DATE_SQL} = ? AND ${FINANCIAL_FILTER} GROUP BY payment_method`,
    [today]
  );

  const orders = queryAll(
    `SELECT * FROM orders WHERE ${SALES_EVENT_DATE_SQL} = ? ORDER BY ${SALES_EVENT_AT_SQL} DESC`,
    [today]
  );
  orders.forEach(o => { o.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]); });

  res.json({ register_open: !!register, register, sales, hourly, paymentMethods, orders, date: today });
});

router.get('/monthly', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const closedRegisters = queryAll(
    "SELECT cr.*, u.full_name as user_name FROM cash_registers cr LEFT JOIN users u ON u.id = cr.user_id WHERE cr.closed_at IS NOT NULL ORDER BY cr.closed_at DESC LIMIT 60"
  );
  const closedRegistersWithDetails = closedRegisters.map((r) => ({
    ...r,
    arqueo: parseArqueoData(r.arqueo_data),
  }));

  const dailySales = queryAll(
    `SELECT ${SALES_EVENT_DATE_SQL} as date, COUNT(*) as orders, COALESCE(SUM(total), 0) as total, COALESCE(SUM(tax), 0) as tax FROM orders WHERE ${FINANCIAL_FILTER} AND ${SALES_EVENT_LOCAL_SQL} >= datetime('now', 'localtime', '-30 days') GROUP BY ${SALES_EVENT_DATE_SQL} ORDER BY date DESC`
  );

  const monthlySales = queryAll(
    `SELECT ${SALES_EVENT_MONTH_SQL} as month, COUNT(*) as orders, COALESCE(SUM(total), 0) as total, COALESCE(SUM(tax), 0) as tax FROM orders WHERE ${FINANCIAL_FILTER} GROUP BY ${SALES_EVENT_MONTH_SQL} ORDER BY month DESC LIMIT 12`
  );

  const totalMonth = queryOne(
    `SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as total, COALESCE(SUM(tax), 0) as tax FROM orders WHERE ${FINANCIAL_FILTER} AND ${SALES_EVENT_MONTH_SQL} = strftime('%Y-%m', 'now', 'localtime')`
  );
  const closedRegistersMonth = queryOne(
    "SELECT COUNT(*) as count FROM cash_registers WHERE closed_at IS NOT NULL AND strftime('%Y-%m', closed_at) = strftime('%Y-%m', 'now')"
  );

  res.json({ closedRegisters: closedRegistersWithDetails, closedRegistersMonth: Number(closedRegistersMonth?.count || 0), dailySales, monthlySales, totalMonth });
});

router.get('/closed-registers/:id', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const register = queryOne(
    "SELECT cr.*, u.full_name as user_name FROM cash_registers cr LEFT JOIN users u ON u.id = cr.user_id WHERE cr.id = ? AND cr.closed_at IS NOT NULL",
    [req.params.id]
  );
  if (!register) return res.status(404).json({ error: 'Cierre de caja no encontrado' });
  register.arqueo = parseArqueoData(register.arqueo_data);
  register.movements = queryAll(
    "SELECT cm.*, u.full_name as user_name FROM cash_movements cm LEFT JOIN users u ON u.id = cm.user_id WHERE cm.register_id = ? ORDER BY cm.created_at ASC",
    [register.id]
  );
  register.notes_list = queryAll(
    "SELECT cn.*, u.full_name as user_name FROM cash_notes cn LEFT JOIN users u ON u.id = cn.user_id WHERE cn.register_id = ? ORDER BY cn.created_at ASC",
    [register.id]
  );
  const soldRows = queryAll(
    `SELECT
      oi.product_id,
      oi.product_name,
      COALESCE(SUM(oi.quantity), 0) as total_qty,
      COALESCE(SUM(oi.subtotal), 0) as total_amount,
      COUNT(DISTINCT oi.order_id) as order_count
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status != 'cancelled'
       AND o.payment_status = 'paid'
       AND COALESCE(o.updated_at, o.created_at) >= ?
       AND COALESCE(o.updated_at, o.created_at) <= ?
     GROUP BY oi.product_id, oi.product_name
     ORDER BY oi.product_name ASC, total_amount DESC`,
    [register.opened_at, register.closed_at || new Date().toISOString()]
  );
  register.sold_products = soldRows.map((row) => {
    const qty = Number(row.total_qty) || 0;
    const amt = Number(row.total_amount) || 0;
    return {
      ...row,
      total_qty: qty,
      total_amount: amt,
      unit_price: qty > 0 ? amt / qty : 0,
    };
  });
  register.product_sales_total = register.sold_products.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  register.sales_orders = queryAll(
    `SELECT
      o.id,
      o.order_number,
      o.type,
      o.table_number,
      o.payment_method,
      o.total,
      o.created_at,
      o.updated_at
     FROM orders o
     WHERE o.status != 'cancelled'
       AND o.payment_status = 'paid'
       AND COALESCE(o.updated_at, o.created_at) >= ?
       AND COALESCE(o.updated_at, o.created_at) <= ?
     ORDER BY COALESCE(o.updated_at, o.created_at) ASC`,
    [register.opened_at, register.closed_at || new Date().toISOString()]
  );
  if (register.sales_orders.length > 0) {
    const orderIds = register.sales_orders.map((o) => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const orderItems = queryAll(
      `SELECT order_id, product_name, quantity, unit_price, subtotal
       FROM order_items
       WHERE order_id IN (${placeholders})`,
      orderIds
    );
    const itemsByOrder = orderItems.reduce((acc, item) => {
      if (!acc[item.order_id]) acc[item.order_id] = [];
      acc[item.order_id].push(item);
      return acc;
    }, {});
    register.sales_orders = register.sales_orders.map((order) => ({
      ...order,
      sold_at: order.updated_at || order.created_at,
      items: itemsByOrder[order.id] || [],
    }));
  }
  res.json(register);
});

router.get('/ranking', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { period } = req.query;
  let dateFilter = '';
  if (period === 'today') dateFilter = `AND ${SALES_EVENT_ORDER_DATE_SQL} = DATE('now', 'localtime')`;
  else if (period === 'week') dateFilter = `AND ${SALES_EVENT_ORDER_LOCAL_SQL} >= datetime('now', 'localtime', '-6 days')`;
  else if (period === 'month') dateFilter = `AND ${SALES_EVENT_ORDER_MONTH_SQL} = strftime('%Y-%m', 'now', 'localtime')`;

  const ranking = queryAll(
    `SELECT oi.product_name, oi.product_id, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue, COUNT(DISTINCT oi.order_id) as order_count FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid' ${dateFilter} GROUP BY oi.product_id ORDER BY total_sold DESC`
  );

  res.json(ranking);
});

router.get('/sales', authenticateToken, requireRole('admin'), (req, res) => {
  const { period, start_date, end_date } = req.query;
  if (period === 'daily') {
    res.json(queryAll(`SELECT ${SALES_EVENT_DATE_SQL} as date, COUNT(*) as orders, SUM(total) as total, SUM(tax) as tax, SUM(discount) as discounts FROM orders WHERE ${FINANCIAL_FILTER} AND ${SALES_EVENT_DATE_SQL} BETWEEN COALESCE(?, DATE('now', 'localtime', '-30 days')) AND COALESCE(?, DATE('now', 'localtime')) GROUP BY ${SALES_EVENT_DATE_SQL} ORDER BY date DESC`, [start_date || null, end_date || null]));
  } else {
    res.json(queryAll(`SELECT ${SALES_EVENT_MONTH_SQL} as month, COUNT(*) as orders, SUM(total) as total, SUM(tax) as tax, SUM(discount) as discounts FROM orders WHERE ${FINANCIAL_FILTER} GROUP BY ${SALES_EVENT_MONTH_SQL} ORDER BY month DESC LIMIT 12`));
  }
});

router.get('/products', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  res.json(queryAll("SELECT oi.product_name, oi.product_id, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue, COUNT(DISTINCT oi.order_id) as order_count FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid' GROUP BY oi.product_id ORDER BY total_sold DESC"));
});

router.get('/payment-methods', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { start_date, end_date } = req.query;
  res.json(queryAll(`SELECT payment_method, COUNT(*) as count, SUM(total) as total FROM orders WHERE ${FINANCIAL_FILTER} AND ${SALES_EVENT_DATE_SQL} BETWEEN COALESCE(?, DATE('now', 'localtime', '-30 days')) AND COALESCE(?, DATE('now', 'localtime')) GROUP BY payment_method ORDER BY total DESC`, [start_date || null, end_date || null]));
});

const LOSS_CATEGORIES = new Set(['salida_efectivo', 'gasto_extra', 'merma', 'danio_propiedad', 'reembolso', 'otro']);

function parseYmd(input) {
  const v = String(input || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function defaultFinanceRange() {
  const today = new Date();
  const to = today.toISOString().split('T')[0];
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().split('T')[0], to };
}

router.get('/finance-overview', authenticateToken, requireRole('admin'), (req, res) => {
  const def = defaultFinanceRange();
  const from = parseYmd(req.query.from) || def.from;
  const to = parseYmd(req.query.to) || def.to;
  const dateSales = SALES_EVENT_DATE_SQL;
  const salesRow = queryOne(
    `SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as total_sales FROM orders WHERE ${FINANCIAL_FILTER} AND ${dateSales} BETWEEN date(?) AND date(?)`,
    [from, to]
  );
  const investmentRow = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM investment_movements
     WHERE date(datetime(created_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    [from, to]
  );
  const purchasesRow = queryOne(
    `SELECT COALESCE(SUM(total_cost), 0) as total FROM inventory_expenses
     WHERE date(datetime(created_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    [from, to]
  );
  const cashExpensesRow = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements
     WHERE type = 'expense'
       AND date(datetime(created_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    [from, to]
  );
  const lossEventsRow = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as n FROM finance_loss_events
     WHERE date(datetime(occurred_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    [from, to]
  );
  const lossByCat = queryAll(
    `SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as event_count FROM finance_loss_events
     WHERE date(datetime(occurred_at, 'localtime')) BETWEEN date(?) AND date(?)
     GROUP BY category ORDER BY total DESC`,
    [from, to]
  );
  const totalSales = Number(salesRow?.total_sales || 0);
  const totalInvestment = Number(investmentRow?.total || 0);
  const totalPurchases = Number(purchasesRow?.total || 0);
  const cashExpenses = Number(cashExpensesRow?.total || 0);
  const lossEventsTotal = Number(lossEventsRow?.total || 0);
  const lossesCombined = lossEventsTotal + cashExpenses;
  const approxGross = totalSales - totalPurchases;
  const approxProfit = totalSales - totalPurchases - lossEventsTotal - cashExpenses;

  let business_intel = null;
  try {
    business_intel = getEffectiveFlat();
  } catch (_) {
    business_intel = null;
  }

  res.json({
    filters: { from, to },
    sales: { total: totalSales, orders: Number(salesRow?.orders || 0) },
    investment: { total: totalInvestment },
    purchases: { total: totalPurchases },
    cash_expenses: { total: cashExpenses },
    loss_events: { total: lossEventsTotal, count: Number(lossEventsRow?.n || 0) },
    loss_by_category: lossByCat.map((r) => ({
      category: r.category,
      total: Number(r.total || 0),
      event_count: Number(r.event_count || 0),
    })),
    losses_combined_total: lossesCombined,
    approx_gross_margin: approxGross,
    approx_profit: approxProfit,
    business_intel,
  });
});

router.get('/finance-loss-events', authenticateToken, requireRole('admin'), (req, res) => {
  const def = defaultFinanceRange();
  const from = parseYmd(req.query.from) || def.from;
  const to = parseYmd(req.query.to) || def.to;
  const category = String(req.query.category || '').trim();
  const clauses = ["date(datetime(occurred_at, 'localtime')) BETWEEN date(?) AND date(?)"];
  const params = [from, to];
  if (category && LOSS_CATEGORIES.has(category)) {
    clauses.push('category = ?');
    params.push(category);
  }
  const whereSql = clauses.join(' AND ');
  const rows = queryAll(
    `SELECT * FROM finance_loss_events WHERE ${whereSql} ORDER BY datetime(occurred_at) DESC LIMIT 500`,
    params
  );
  const parsed = rows.map((row) => {
    let items = null;
    if (row.items_json) {
      try {
        items = JSON.parse(row.items_json);
      } catch (_) {
        items = row.items_json;
      }
    }
    return { ...row, items_json_parsed: items };
  });
  const totalRow = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM finance_loss_events WHERE ${whereSql}`,
    params
  );
  res.json({
    filters: { from, to, category: category || 'all' },
    events: parsed,
    loss_events_total: Number(totalRow?.total || 0),
  });
});

router.post('/finance-loss-events', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const category = String(req.body?.category || '').trim();
    if (!LOSS_CATEGORIES.has(category)) return res.status(400).json({ error: 'Categoría de pérdida inválida' });
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    const concept = String(req.body?.concept || '').trim();
    const orderId = String(req.body?.order_id || '').trim();
    let itemsJson = '';
    if (req.body?.items != null) {
      itemsJson = typeof req.body.items === 'string' ? req.body.items : JSON.stringify(req.body.items);
    }
    let occurredAt = String(req.body?.occurred_at || '').trim();
    if (occurredAt && !/^\d{4}-\d{2}-\d{2}/.test(occurredAt)) {
      return res.status(400).json({ error: 'Fecha occurred_at inválida' });
    }
    if (!occurredAt) occurredAt = new Date().toISOString();
    const id = uuidv4();
    runSql(
      `INSERT INTO finance_loss_events (id, category, amount, concept, order_id, items_json, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, category, amount, concept, orderId || null, itemsJson || '', occurredAt]
    );
    const created = queryOne('SELECT * FROM finance_loss_events WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo registrar la pérdida' });
  }
});

module.exports = router;
