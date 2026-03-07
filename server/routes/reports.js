const express = require('express');
const { queryAll, queryOne } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { FINANCIAL_FILTER_SQL } = require('../businessRules');

const router = express.Router();
const FINANCIAL_FILTER = FINANCIAL_FILTER_SQL;

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
  const todaySales = queryOne(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE DATE(created_at) = ? AND ${FINANCIAL_FILTER}`, [today]);
  const monthSales = queryOne(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') AND ${FINANCIAL_FILTER}`);
  const activeOrders = queryOne("SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'preparing', 'ready')");
  const topProducts = queryAll("SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid' AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now') GROUP BY oi.product_name ORDER BY total_sold DESC LIMIT 10");
  const recentOrders = queryAll('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
  recentOrders.forEach(o => { o.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]); });
  const lowStock = queryAll('SELECT * FROM products WHERE stock <= 10 AND is_active = 1 ORDER BY stock ASC LIMIT 10');
  const paymentMethods = queryAll(`SELECT payment_method, COUNT(*) as count, SUM(total) as total FROM orders WHERE DATE(created_at) = ? AND ${FINANCIAL_FILTER} GROUP BY payment_method`, [today]);

  res.json({ today: todaySales, month: monthSales, activeOrders: activeOrders.count, topProducts, recentOrders, lowStock, paymentMethods });
});

router.get('/daily', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const register = queryOne("SELECT * FROM cash_registers WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1");

  const sales = queryOne(
    `SELECT COUNT(*) as order_count, COALESCE(SUM(total), 0) as total_sales, COALESCE(SUM(subtotal), 0) as subtotal, COALESCE(SUM(tax), 0) as total_tax, COALESCE(SUM(discount), 0) as total_discount FROM orders WHERE DATE(created_at) = ? AND ${FINANCIAL_FILTER}`,
    [today]
  );

  const hourly = queryAll(
    `SELECT strftime('%H', created_at) as hour, COUNT(*) as orders, COALESCE(SUM(total), 0) as total FROM orders WHERE DATE(created_at) = ? AND ${FINANCIAL_FILTER} GROUP BY strftime('%H', created_at) ORDER BY hour`,
    [today]
  );

  const paymentMethods = queryAll(
    `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE DATE(created_at) = ? AND ${FINANCIAL_FILTER} GROUP BY payment_method`,
    [today]
  );

  const orders = queryAll(
    "SELECT * FROM orders WHERE DATE(created_at) = ? ORDER BY created_at DESC",
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
    `SELECT DATE(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total), 0) as total, COALESCE(SUM(tax), 0) as tax FROM orders WHERE ${FINANCIAL_FILTER} AND created_at >= date('now', '-30 days') GROUP BY DATE(created_at) ORDER BY date DESC`
  );

  const monthlySales = queryAll(
    `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as orders, COALESCE(SUM(total), 0) as total, COALESCE(SUM(tax), 0) as tax FROM orders WHERE ${FINANCIAL_FILTER} GROUP BY strftime('%Y-%m', created_at) ORDER BY month DESC LIMIT 12`
  );

  const totalMonth = queryOne(
    `SELECT COUNT(*) as orders, COALESCE(SUM(total), 0) as total, COALESCE(SUM(tax), 0) as tax FROM orders WHERE ${FINANCIAL_FILTER} AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
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
  register.sold_products = queryAll(
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
     ORDER BY total_qty DESC, total_amount DESC, oi.product_name ASC`,
    [register.opened_at, register.closed_at || new Date().toISOString()]
  );
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
  if (period === 'today') dateFilter = "AND DATE(o.created_at) = DATE('now')";
  else if (period === 'week') dateFilter = "AND o.created_at >= date('now', '-6 days')";
  else if (period === 'month') dateFilter = "AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')";

  const ranking = queryAll(
    `SELECT oi.product_name, oi.product_id, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue, COUNT(DISTINCT oi.order_id) as order_count FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid' ${dateFilter} GROUP BY oi.product_id ORDER BY total_sold DESC`
  );

  res.json(ranking);
});

router.get('/sales', authenticateToken, requireRole('admin'), (req, res) => {
  const { period, start_date, end_date } = req.query;
  if (period === 'daily') {
    res.json(queryAll(`SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total) as total, SUM(tax) as tax, SUM(discount) as discounts FROM orders WHERE ${FINANCIAL_FILTER} AND DATE(created_at) BETWEEN COALESCE(?, DATE('now', '-30 days')) AND COALESCE(?, DATE('now')) GROUP BY DATE(created_at) ORDER BY date DESC`, [start_date || null, end_date || null]));
  } else {
    res.json(queryAll(`SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as orders, SUM(total) as total, SUM(tax) as tax, SUM(discount) as discounts FROM orders WHERE ${FINANCIAL_FILTER} GROUP BY strftime('%Y-%m', created_at) ORDER BY month DESC LIMIT 12`));
  }
});

router.get('/products', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  res.json(queryAll("SELECT oi.product_name, oi.product_id, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue, COUNT(DISTINCT oi.order_id) as order_count FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid' GROUP BY oi.product_id ORDER BY total_sold DESC"));
});

router.get('/payment-methods', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { start_date, end_date } = req.query;
  res.json(queryAll(`SELECT payment_method, COUNT(*) as count, SUM(total) as total FROM orders WHERE ${FINANCIAL_FILTER} AND DATE(created_at) BETWEEN COALESCE(?, DATE('now', '-30 days')) AND COALESCE(?, DATE('now')) GROUP BY payment_method ORDER BY total DESC`, [start_date || null, end_date || null]));
});

module.exports = router;
