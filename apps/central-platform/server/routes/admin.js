const express = require('express');
const jwt = require('jsonwebtoken');
const { queryAll, queryOne, runSql } = require('../database');

const router = express.Router();
const JWT_SECRET = () => process.env.JWT_SECRET;

function authenticateAdmin(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET());
    if (!['saas_admin', 'client_admin'].includes(decoded.role)) {
      return res.status(403).json({ error: 'Sin permisos de administración' });
    }
    req.adminUser = decoded;
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

router.use(authenticateAdmin);

router.get('/dashboard/financial', (req, res) => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthlyRevenue = queryOne(
    `SELECT COALESCE(SUM(monto), 0) as total
     FROM payments
     WHERE estado = 'approved' AND strftime('%Y-%m', fecha) = ?`,
    [monthKey]
  );

  const recentPayments = queryAll(
    `SELECT p.*, c.restaurant_name
     FROM payments p
     LEFT JOIN clients c ON c.client_id = p.client_id
     ORDER BY p.created_at DESC
     LIMIT 20`
  );

  const premiumClients = queryAll(
    `SELECT client_id, restaurant_name, plan, license_status, last_sync_at
     FROM clients
     WHERE plan IN ('intermedio', 'profesional')
     ORDER BY last_sync_at DESC
     LIMIT 50`
  );

  const activeLicenses = queryOne(
    `SELECT COUNT(*) as count FROM licenses WHERE status = 'active'`
  );

  const expiringSoon = queryAll(
    `SELECT client_id, plan, status, expires_at
     FROM licenses
     WHERE expires_at IS NOT NULL AND expires_at <= date('now', '+30 days')
     ORDER BY expires_at ASC
     LIMIT 30`
  );

  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  const prevRevenue = queryOne(
    `SELECT COALESCE(SUM(monto), 0) as total FROM payments
     WHERE estado = 'approved' AND strftime('%Y-%m', fecha) = ?`,
    [prevMonthKey]
  );
  const current = Number(monthlyRevenue?.total || 0);
  const previous = Number(prevRevenue?.total || 0);
  const growthPct = previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;

  return res.json({
    ingresos_mensuales: current,
    pagos_recientes: recentPayments,
    clientes_premium: premiumClients,
    licencias_activas: Number(activeLicenses?.count || 0),
    vencimientos_proximos: expiringSoon,
    crecimiento_mensual_pct: growthPct,
  });
});

router.get('/payments', (req, res) => {
  const estado = String(req.query.estado || '').trim();
  let sql = `SELECT p.*, c.restaurant_name FROM payments p
             LEFT JOIN clients c ON c.client_id = p.client_id`;
  const params = [];
  if (estado) {
    sql += ' WHERE p.estado = ?';
    params.push(estado);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT 200';
  return res.json(queryAll(sql, params));
});

router.patch('/payments/:id', (req, res) => {
  const estado = String(req.body?.estado || '').trim();
  if (!['pending', 'approved', 'rejected'].includes(estado)) {
    return res.status(400).json({ error: 'estado inválido' });
  }
  const row = queryOne('SELECT id FROM payments WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Pago no encontrado' });
  runSql(
    `UPDATE payments SET estado = ?, updated_at = datetime('now') WHERE id = ?`,
    [estado, req.params.id]
  );
  return res.json({ ok: true, id: req.params.id, estado });
});

router.get('/clients', (req, res) => {
  return res.json(
    queryAll(
      `SELECT client_id, restaurant_id, web_service_id, restaurant_name, plan,
              license_status, source_web_service_url, last_sync_at, created_at
       FROM clients ORDER BY restaurant_name ASC`
    )
  );
});

router.get('/licenses', (req, res) => {
  return res.json(
    queryAll(
      `SELECT l.*, c.restaurant_name FROM licenses l
       LEFT JOIN clients c ON c.client_id = l.client_id
       ORDER BY l.updated_at DESC`
    )
  );
});

router.get('/metrics/saas', (req, res) => {
  const totalClients = queryOne('SELECT COUNT(*) as c FROM clients');
  const activeUsers = queryOne(
    `SELECT COUNT(*) as c FROM central_users WHERE is_active = 1`
  );
  const pendingPayments = queryOne(
    `SELECT COUNT(*) as c FROM payments WHERE estado = 'pending'`
  );
  const eventsToday = queryOne(
    `SELECT COUNT(*) as c FROM sync_events WHERE date(created_at) = date('now')`
  );
  return res.json({
    total_clients: Number(totalClients?.c || 0),
    active_users: Number(activeUsers?.c || 0),
    pending_payments: Number(pendingPayments?.c || 0),
    sync_events_today: Number(eventsToday?.c || 0),
  });
});

module.exports = router;
