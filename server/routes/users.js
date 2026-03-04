const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const VALID_ROLES = new Set(['admin', 'cajero', 'mozo', 'cocina', 'bar', 'delivery']);
const MODULE_IDS = [
  'escritorio', 'ventas', 'caja', 'mesas', 'reservas', 'creditos', 'clientes',
  'productos', 'ofertas', 'descuentos', 'almacen', 'delivery', 'informes',
  'indicadores', 'mi_restaurant', 'configuracion', 'cocina', 'bar', 'tiempo_trabajado',
];
function isPermissionEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function parseDateKey(input) {
  const value = String(input || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function ensureOpenWorkSession(user) {
  const trackableRoles = new Set(['admin', 'cajero', 'mozo', 'cocina', 'bar', 'delivery']);
  if (!user?.id || !trackableRoles.has(user.role)) return;
  const existing = queryOne(
    'SELECT id FROM user_work_sessions WHERE user_id = ? AND logout_at IS NULL ORDER BY login_at DESC LIMIT 1',
    [user.id]
  );
  if (existing?.id) return;
  runSql(
    `INSERT INTO user_work_sessions
      (id, user_id, session_token_id, username, full_name, role, login_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`,
    [uuidv4(), user.id, uuidv4(), user.username || '', user.full_name || '', user.role || '']
  );
}

function createEmptyPermissions() {
  return MODULE_IDS.reduce((acc, id) => {
    acc[id] = false;
    return acc;
  }, {});
}

router.get('/', authenticateToken, requireRole('admin'), (req, res) => {
  res.json(queryAll('SELECT id, username, email, full_name, role, is_active, phone, avatar, created_at FROM users ORDER BY created_at DESC'));
});

router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.full_name || '').trim();
    const role = String(req.body?.role || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const isActive = req.body?.is_active === undefined ? 1 : (Number(req.body.is_active || 0) === 1 ? 1 : 0);
    if (!username || !email || !password || !fullName || !role) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    const existing = queryOne('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) return res.status(400).json({ error: 'El usuario o email ya existe' });

    const restaurant = queryOne('SELECT id FROM restaurants LIMIT 1');
    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    runSql(
      'INSERT INTO users (id, username, email, password_hash, full_name, role, restaurant_id, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, username, email, hash, fullName, role, restaurant?.id, phone, isActive]
    );
    runSql(
      'INSERT INTO user_permissions (id, user_id, permissions) VALUES (?, ?, ?)',
      [uuidv4(), id, JSON.stringify(createEmptyPermissions())]
    );
    return res.status(201).json(
      queryOne('SELECT id, username, email, full_name, role, is_active, phone, created_at FROM users WHERE id = ?', [id])
    );
  } catch (err) {
    return res.status(400).json({ error: err.message || 'No se pudo crear el usuario' });
  }
});

router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const current = queryOne('SELECT id, username, email, full_name, role, phone, is_active FROM users WHERE id = ?', [req.params.id]);
    if (!current?.id) return res.status(404).json({ error: 'Usuario no encontrado' });

    const username = req.body?.username === undefined ? current.username : String(req.body.username || '').trim();
    const email = req.body?.email === undefined ? current.email : String(req.body.email || '').trim();
    const fullName = req.body?.full_name === undefined ? current.full_name : String(req.body.full_name || '').trim();
    const role = req.body?.role === undefined ? current.role : String(req.body.role || '').trim().toLowerCase();
    const phone = req.body?.phone === undefined ? current.phone : String(req.body.phone || '').trim();
    const isActive = req.body?.is_active === undefined ? current.is_active : (Number(req.body.is_active || 0) === 1 ? 1 : 0);
    const password = String(req.body?.password || '').trim();

    if (!username || !email || !fullName || !role) {
      return res.status(400).json({ error: 'Usuario, email, nombre y rol son obligatorios' });
    }
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    const duplicated = queryOne(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ? LIMIT 1',
      [username, email, req.params.id]
    );
    if (duplicated?.id) {
      return res.status(400).json({ error: 'El usuario o email ya está en uso por otro registro' });
    }

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      runSql('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    }

    runSql(
      'UPDATE users SET username = ?, email = ?, full_name = ?, role = ?, phone = ?, is_active = ? WHERE id = ?',
      [username, email, fullName, role, phone, isActive, req.params.id]
    );
    return res.json(
      queryOne('SELECT id, username, email, full_name, role, is_active, phone, created_at FROM users WHERE id = ?', [req.params.id])
    );
  } catch (err) {
    return res.status(400).json({ error: err.message || 'No se pudo actualizar el usuario' });
  }
});

router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  runSql('DELETE FROM user_permissions WHERE user_id = ?', [req.params.id]);
  runSql('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

router.get('/work-sessions', authenticateToken, requireRole('admin'), (req, res) => {
  ensureOpenWorkSession(req.user);
  const from = parseDateKey(req.query?.from);
  const to = parseDateKey(req.query?.to);
  const userId = String(req.query?.user_id || '').trim();
  const where = [];
  const params = [];

  if (from) {
    where.push("date(datetime(s.login_at, 'localtime')) >= date(?)");
    params.push(from);
  }
  if (to) {
    where.push("date(datetime(s.login_at, 'localtime')) <= date(?)");
    params.push(to);
  }
  if (userId && userId !== 'all') {
    where.push('s.user_id = ?');
    params.push(userId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const minutesExpr = `
    CASE
      WHEN s.logout_at IS NULL THEN CAST((julianday('now') - julianday(s.login_at)) * 24 * 60 AS INTEGER)
      ELSE COALESCE(s.worked_minutes, CAST((julianday(s.logout_at) - julianday(s.login_at)) * 24 * 60 AS INTEGER), 0)
    END
  `;

  const sessions = queryAll(
    `SELECT
      s.id,
      s.user_id,
      COALESCE(NULLIF(u.full_name, ''), s.full_name) AS full_name,
      COALESCE(NULLIF(u.username, ''), s.username) AS username,
      COALESCE(NULLIF(u.role, ''), s.role) AS role,
      s.login_at,
      s.logout_at,
      ${minutesExpr} AS worked_minutes
     FROM user_work_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     ${whereSql}
     ORDER BY s.login_at DESC
     LIMIT 300`,
    params
  );

  const summary = queryAll(
    `SELECT
      s.user_id,
      COALESCE(NULLIF(u.full_name, ''), s.full_name) AS full_name,
      COALESCE(NULLIF(u.username, ''), s.username) AS username,
      COALESCE(NULLIF(u.role, ''), s.role) AS role,
      COUNT(*) AS sessions_count,
      SUM(${minutesExpr}) AS total_minutes
     FROM user_work_sessions s
     LEFT JOIN users u ON u.id = s.user_id
     ${whereSql}
     GROUP BY
      s.user_id,
      COALESCE(NULLIF(u.full_name, ''), s.full_name),
      COALESCE(NULLIF(u.username, ''), s.username),
      COALESCE(NULLIF(u.role, ''), s.role)
     ORDER BY total_minutes DESC`,
    params
  );

  res.json({
    filters: { from, to, user_id: userId || 'all' },
    sessions,
    summary,
  });
});

router.get('/:id/permissions', authenticateToken, requireRole('admin'), (req, res) => {
  const row = queryOne('SELECT permissions FROM user_permissions WHERE user_id = ?', [req.params.id]);
  const parsed = row ? JSON.parse(row.permissions || '{}') : {};
  const permissions = MODULE_IDS.reduce((acc, id) => {
    acc[id] = isPermissionEnabled(parsed[id]);
    return acc;
  }, {});
  res.json(permissions);
});

router.put('/:id/permissions', authenticateToken, requireRole('admin'), (req, res) => {
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') return res.status(400).json({ error: 'Permisos inválidos' });
  const normalized = MODULE_IDS.reduce((acc, id) => {
    acc[id] = isPermissionEnabled(permissions[id]);
    return acc;
  }, {});
  const existing = queryOne('SELECT id FROM user_permissions WHERE user_id = ?', [req.params.id]);
  const json = JSON.stringify(normalized);
  if (existing) {
    runSql("UPDATE user_permissions SET permissions = ?, updated_at = datetime('now') WHERE user_id = ?", [json, req.params.id]);
  } else {
    runSql('INSERT INTO user_permissions (id, user_id, permissions) VALUES (?, ?, ?)', [uuidv4(), req.params.id, json]);
  }
  res.json({ success: true, permissions: normalized });
});

module.exports = router;
