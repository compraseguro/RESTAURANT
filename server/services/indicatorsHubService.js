/**
 * Centro de indicadores (módulo Indicadores) — agrega datos reales de todos los módulos operativos.
 */

const { queryAll, queryOne } = require('../database');
const { FINANCIAL_FILTER_SQL } = require('../businessRules');
const { buildRankings, buildProductivityByUser } = require('./workProductivityService');

const FIN = FINANCIAL_FILTER_SQL;
const SALES_AT = 'COALESCE(updated_at, created_at)';
const SALES_LOCAL = `datetime(${SALES_AT}, 'localtime')`;
const SALES_DATE = `DATE(${SALES_LOCAL})`;
const SALES_MONTH = `strftime('%Y-%m', ${SALES_LOCAL})`;
const SALES_HOUR = `strftime('%H', ${SALES_LOCAL})`;

function parseDateKey(input) {
  const v = String(input || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

function orderDateFilter(from, to, params) {
  const parts = [];
  if (from) {
    parts.push(`${SALES_DATE} >= date(?)`);
    params.push(from);
  }
  if (to) {
    parts.push(`${SALES_DATE} <= date(?)`);
    params.push(to);
  }
  return parts.length ? parts.join(' AND ') : '1=1';
}

function getReportsHelpers() {
  return require('../routes/reports');
}

function buildGeneralKpis() {
  const today = new Date().toISOString().split('T')[0];
  const todayRow = queryOne(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales FROM orders WHERE ${SALES_DATE} = date('now', 'localtime') AND ${FIN}`
  );
  const weekRow = queryOne(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales FROM orders
     WHERE ${FIN} AND ${SALES_DATE} >= date('now', 'localtime', '-6 days')`
  );
  const monthRow = queryOne(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales FROM orders
     WHERE ${FIN} AND ${SALES_MONTH} = strftime('%Y-%m', 'now', 'localtime')`
  );
  const prevMonthRow = queryOne(
    `SELECT COALESCE(SUM(total), 0) AS sales FROM orders
     WHERE ${FIN} AND ${SALES_MONTH} = strftime('%Y-%m', date('now', 'localtime', '-1 month'))`
  );
  const activeOrders = queryOne("SELECT COUNT(*) AS c FROM orders WHERE status IN ('pending','preparing','ready')");
  const paidToday = Number(todayRow?.orders || 0);
  const salesToday = Number(todayRow?.sales || 0);
  const salesMonth = Number(monthRow?.sales || 0);
  const salesPrevMonth = Number(prevMonthRow?.sales || 0);
  const growthPct = salesPrevMonth > 0 ? ((salesMonth - salesPrevMonth) / salesPrevMonth) * 100 : 0;

  const reports = getReportsHelpers();
  const financeMonth = reports.financeMonthToDateSnapshot?.() || {};
  const op = reports.buildOperationalIntelligence?.({ role: 'admin' }) || {};

  const customersServed = queryOne(
    `SELECT COUNT(DISTINCT COALESCE(NULLIF(trim(customer_id), ''), customer_name)) AS c
     FROM orders WHERE ${FIN} AND ${SALES_DATE} = date('now', 'localtime')`
  );
  const productsSold = queryOne(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS qty FROM order_items oi
     JOIN orders o ON o.id = oi.order_id WHERE ${FIN} AND ${SALES_DATE} = date('now', 'localtime')`
  );
  const reservationsActive = queryOne(
    `SELECT COUNT(*) AS c FROM reservations
     WHERE status IN ('confirmed','pending') AND date >= date('now', 'localtime')`
  );

  return {
    sales_today: salesToday,
    orders_today: paidToday,
    sales_week: Number(weekRow?.sales || 0),
    orders_week: Number(weekRow?.orders || 0),
    sales_month: salesMonth,
    orders_month: Number(monthRow?.orders || 0),
    net_profit_approx: Number(financeMonth.approx_profit || 0),
    gross_margin_approx: Number(financeMonth.approx_gross_margin || 0),
    operating_expenses: Number(financeMonth.losses_combined_total || 0) + Number(financeMonth.purchases_total || 0),
    total_revenue_month: salesMonth,
    avg_ticket: paidToday > 0 ? salesToday / paidToday : 0,
    active_orders: Number(activeOrders?.c || 0),
    tables_occupied: Number(op.summary?.tablesWithActiveOrders || 0),
    delivery_active: Number(op.summary?.deliveryActiveCount || 0),
    kitchen_preparing: Number(op.summary?.inKitchenCount || 0),
    reservations_active: Number(reservationsActive?.c || 0),
    customers_served_today: Number(customersServed?.c || 0),
    products_sold_today: Number(productsSold?.qty || 0),
    out_of_stock: Number(op.summary?.outOfStockCount || 0),
    critical_stock: Number(op.summary?.lowStockCount || 0),
    growth_month_pct: Math.round(growthPct * 10) / 10,
    register_open: Boolean(op.summary?.registerOpen),
  };
}

function buildFinancialSection(from, to) {
  const params = [from, to];
  const dateF = `${SALES_DATE} BETWEEN date(?) AND date(?)`;
  const salesRow = queryOne(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(subtotal), 0) AS subtotal
     FROM orders WHERE ${FIN} AND ${dateF}`,
    params
  );
  const purchases = queryOne(
    `SELECT COALESCE(SUM(total_cost), 0) AS total FROM inventory_expenses
     WHERE date(datetime(created_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    params
  );
  const cashExp = queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements
     WHERE type = 'expense' AND date(datetime(created_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    params
  );
  const losses = queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM finance_loss_events
     WHERE date(datetime(occurred_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    params
  );
  const totalSales = Number(salesRow?.total || 0);
  const totalPurchases = Number(purchases?.total || 0);
  const totalExpenses = Number(cashExp?.total || 0) + Number(losses?.total || 0);
  const gross = totalSales - totalPurchases;
  const net = gross - totalExpenses;

  const paymentMethods = queryAll(
    `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
     FROM orders WHERE ${FIN} AND ${dateF} GROUP BY payment_method ORDER BY total DESC`,
    params
  );

  const dailyTrend = queryAll(
    `SELECT ${SALES_DATE} AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales
     FROM orders WHERE ${FIN} AND ${dateF} GROUP BY ${SALES_DATE} ORDER BY day`,
    params
  );

  const cashFlow = queryOne(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM cash_movements WHERE date(datetime(created_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    params
  );

  return {
    total_sales: totalSales,
    orders_count: Number(salesRow?.orders || 0),
    gross_profit_approx: gross,
    net_profit_approx: net,
    margin_pct: totalSales > 0 ? Math.round((net / totalSales) * 1000) / 10 : 0,
    purchases_total: totalPurchases,
    operating_expenses: totalExpenses,
    cash_flow_in: Number(cashFlow?.income || 0),
    cash_flow_out: Number(cashFlow?.expense || 0),
    payment_methods: paymentMethods || [],
    daily_trend: dailyTrend || [],
    sales_efectivo: paymentMethods?.find((p) => p.payment_method === 'efectivo')?.total || 0,
    sales_yape: paymentMethods?.find((p) => p.payment_method === 'yape')?.total || 0,
    sales_tarjeta: paymentMethods?.find((p) => p.payment_method === 'tarjeta')?.total || 0,
  };
}

function buildOperationalSection() {
  const reports = getReportsHelpers();
  const op = reports.buildOperationalIntelligence?.({ role: 'admin' }) || {};
  const kitchenAvg = queryOne(
    `SELECT AVG((julianday(COALESCE(updated_at, created_at)) - julianday(created_at)) * 24 * 60) AS avg_min
     FROM orders WHERE status = 'delivered' AND type != 'delivery'
       AND date(datetime(created_at, 'localtime')) >= date('now', 'localtime', '-7 days')`
  );
  const deliveryAvg = queryOne(
    `SELECT AVG((julianday(delivered_at) - julianday(assigned_at)) * 24 * 60) AS avg_min
     FROM delivery_assignments WHERE status = 'delivered' AND delivered_at IS NOT NULL
       AND date(datetime(assigned_at, 'localtime')) >= date('now', 'localtime', '-7 days')`
  );
  const delayedKitchen = queryOne(
    `SELECT COUNT(*) AS c FROM orders WHERE status IN ('pending','preparing')
     AND (julianday('now') - julianday(created_at)) * 24 * 60 > 28`
  );
  const delayedDelivery = queryOne(
    `SELECT COUNT(*) AS c FROM delivery_assignments WHERE status != 'delivered'
     AND (julianday('now') - julianday(assigned_at)) * 24 * 60 > 35`
  );
  const deliveredToday = queryOne(
    `SELECT COUNT(*) AS c FROM orders WHERE status = 'delivered' AND ${SALES_DATE} = date('now', 'localtime')`
  );

  return {
    summary: op.summary || {},
    alerts: op.operationalAlerts || [],
    insight_today: op.insightToday || '',
    avg_kitchen_minutes: Math.round(Number(kitchenAvg?.avg_min || 0)),
    avg_delivery_minutes: Math.round(Number(deliveryAvg?.avg_min || 0)),
    orders_delayed_kitchen: Number(delayedKitchen?.c || 0),
    orders_delayed_delivery: Number(delayedDelivery?.c || 0),
    orders_delivered_today: Number(deliveredToday?.c || 0),
    low_stock: op.lowStock || [],
  };
}

function buildInventorySection() {
  const critical = queryAll(
    `SELECT id, name, stock, price FROM products
     WHERE is_active = 1 AND stock <= 10 AND IFNULL(process_type, 'non_transformed') = 'non_transformed'
     ORDER BY stock ASC LIMIT 15`
  );
  const oos = queryAll(
    `SELECT id, name, stock FROM products
     WHERE is_active = 1 AND IFNULL(stock, 0) <= 0 AND IFNULL(process_type, 'non_transformed') = 'non_transformed'
     LIMIT 15`
  );
  const valuation = queryOne(
    `SELECT COALESCE(SUM(stock * COALESCE(price, 0)), 0) AS value FROM products WHERE is_active = 1`
  );
  const consumption = queryOne(
    `SELECT COALESCE(SUM(ABS(quantity)), 0) AS qty FROM inventory_logs
     WHERE date(datetime(created_at, 'localtime')) = date('now', 'localtime') AND quantity < 0`
  );
  return {
    critical_stock: critical || [],
    out_of_stock: oos || [],
    inventory_value: Number(valuation?.value || 0),
    daily_consumption_units: Number(consumption?.qty || 0),
    critical_count: critical?.length || 0,
    oos_count: oos?.length || 0,
  };
}

function buildCustomersSection(from, to) {
  const params = [];
  const od = orderDateFilter(from, to, params);
  const totalCustomers = queryOne('SELECT COUNT(*) AS c FROM customers');
  const newCustomers = queryOne(
    `SELECT COUNT(*) AS c FROM customers
     WHERE date(datetime(created_at, 'localtime')) BETWEEN date(?) AND date(?)`,
    [from, to]
  );
  const frequent = queryAll(
    `SELECT COALESCE(NULLIF(trim(o.customer_name), ''), 'Sin nombre') AS name,
            COUNT(*) AS orders,
            COALESCE(SUM(o.total), 0) AS spent,
            COALESCE(AVG(o.total), 0) AS avg_ticket
     FROM orders o WHERE ${FIN} AND ${od} AND trim(coalesce(o.customer_name, '')) != ''
     GROUP BY o.customer_name ORDER BY orders DESC LIMIT 8`,
    params
  );
  return {
    total_registered: Number(totalCustomers?.c || 0),
    new_in_period: Number(newCustomers?.c || 0),
    frequent_buyers: frequent || [],
  };
}

function buildProductsSection(from, to) {
  const params = [];
  const od = orderDateFilter(from, to, params);
  const top = queryAll(
    `SELECT oi.product_name, SUM(oi.quantity) AS qty, SUM(oi.subtotal) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${FIN} AND ${od} GROUP BY oi.product_name ORDER BY qty DESC LIMIT 10`,
    params
  );
  const bottom = queryAll(
    `SELECT oi.product_name, SUM(oi.quantity) AS qty
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${FIN} AND ${od} GROUP BY oi.product_name HAVING qty > 0 ORDER BY qty ASC LIMIT 8`,
    params
  );
  const profitable = queryAll(
    `SELECT p.name, p.price,
            COALESCE(SUM(oi.subtotal), 0) AS revenue,
            COALESCE(SUM(oi.quantity), 0) AS qty
     FROM products p
     LEFT JOIN order_items oi ON oi.product_id = p.id
     LEFT JOIN orders o ON o.id = oi.order_id AND ${FIN} AND ${od}
     WHERE p.is_active = 1
     GROUP BY p.id ORDER BY revenue DESC LIMIT 8`,
    params
  );
  return { top_sellers: top || [], slow_movers: bottom || [], most_profitable: profitable || [] };
}

function buildCharts(from, to) {
  const params = [];
  const od = orderDateFilter(from, to, params);
  const byHour = queryAll(
    `SELECT ${SALES_HOUR} AS hour, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales
     FROM orders WHERE ${FIN} AND ${od} GROUP BY ${SALES_HOUR} ORDER BY hour`,
    params
  );
  const byDay = queryAll(
    `SELECT ${SALES_DATE} AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales
     FROM orders WHERE ${FIN} AND ${od} GROUP BY ${SALES_DATE} ORDER BY day`,
    params
  );
  const byChannel = queryAll(
    `SELECT type, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
     FROM orders WHERE ${FIN} AND ${od} GROUP BY type`,
    params
  );
  return {
    sales_by_hour: (byHour || []).map((r) => ({ name: `${r.hour}:00`, ventas: r.sales, pedidos: r.orders })),
    sales_by_day: (byDay || []).map((r) => ({ name: r.day, ventas: r.sales, pedidos: r.orders })),
    sales_by_channel: (byChannel || []).map((r) => ({
      name: r.type === 'dine_in' ? 'Salón' : r.type === 'delivery' ? 'Delivery' : 'Llevar',
      value: r.count,
      total: r.total,
    })),
  };
}

function buildInsights(data) {
  const insights = [];
  const g = data.general || {};
  const f = data.financial || {};
  const o = data.operational || {};
  const p = data.products?.top_sellers?.[0];

  if (g.growth_month_pct > 5) {
    insights.push({ priority: 'info', message: `Las ventas del mes crecieron ~${g.growth_month_pct}% respecto al mes anterior.` });
  } else if (g.growth_month_pct < -5) {
    insights.push({ priority: 'medium', message: `Las ventas del mes bajaron ~${Math.abs(g.growth_month_pct)}% vs el mes anterior.` });
  }
  if (p?.product_name) {
    insights.push({ priority: 'info', message: `El producto más vendido en el período es «${p.product_name}» (${p.qty} unidades).` });
  }
  if (o.insight_today) insights.push({ priority: 'info', message: o.insight_today });
  if (g.delivery_active > g.tables_occupied && g.sales_today > 0) {
    insights.push({ priority: 'medium', message: 'Delivery tiene más pedidos activos que mesas ocupadas; revise personal de reparto en horas punta.' });
  }
  if (f.margin_pct > 0 && f.margin_pct < 8) {
    insights.push({ priority: 'medium', message: `Margen neto aproximado ${f.margin_pct}% — revise gastos operativos y costos de compra.` });
  }
  const peak = data.charts?.sales_by_hour?.slice().sort((a, b) => b.ventas - a.ventas)[0];
  if (peak?.name) {
    insights.push({ priority: 'info', message: `Hora pico de ventas en el período: ${peak.name} (S/ ${Number(peak.ventas).toFixed(0)}).` });
  }
  if (data.inventory?.critical_count >= 3) {
    insights.push({ priority: 'high', message: `${data.inventory.critical_count} producto(s) con stock crítico — reponer antes del siguiente servicio.` });
  }
  const rank = data.productivity?.rankings?.best_seller;
  if (rank?.full_name) {
    insights.push({ priority: 'info', message: `${rank.full_name} lidera ventas en el equipo (${rank.label}).` });
  }
  return insights.slice(0, 10);
}

function buildIndicatorsHub(query = {}, opts = {}) {
  const def = defaultRange();
  const from = parseDateKey(query.from) || def.from;
  const to = parseDateKey(query.to) || def.to;

  const general = buildGeneralKpis();
  const financial = buildFinancialSection(from, to);
  const operational = buildOperationalSection();
  const inventory = buildInventorySection();
  const customers = buildCustomersSection(from, to);
  const products = buildProductsSection(from, to);
  const charts = buildCharts(from, to);
  const productivity = {
    by_user: buildProductivityByUser(from, to, 'all'),
    rankings: buildRankings(from, to),
  };

  const payload = {
    filters: { from, to },
    generated_at: new Date().toISOString(),
    general,
    financial,
    operational,
    inventory,
    customers,
    products,
    charts,
    productivity,
    alerts: operational.alerts || [],
    insights: [],
  };
  payload.insights = buildInsights(payload);
  return payload;
}

module.exports = { buildIndicatorsHub, buildGeneralKpis };
