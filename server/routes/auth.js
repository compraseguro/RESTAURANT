const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { queryOne, runSql } = require('../database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { getLockState, verifyMasterCredentials, getMasterCredentialsPublic } = require('../masterAdminService');

const router = express.Router();
const MODULE_IDS = [
  'escritorio', 'ventas', 'caja', 'mesas', 'reservas', 'creditos', 'clientes',
  'productos', 'ofertas', 'descuentos', 'almacen', 'delivery', 'informes',
  'indicadores', 'mi_restaurant', 'configuracion', 'cocina', 'bar', 'tiempo_trabajado',
];
function isPermissionEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function getEmptyPermissions() {
  return MODULE_IDS.reduce((acc, id) => {
    acc[id] = false;
    return acc;
  }, {});
}

function getUserPermissions(userId) {
  const row = queryOne('SELECT permissions FROM user_permissions WHERE user_id = ?', [userId]);
  if (!row?.permissions) return getEmptyPermissions();
  let parsed = {};
  try {
    parsed = JSON.parse(row.permissions || '{}');
  } catch {
    parsed = {};
  }
  return MODULE_IDS.reduce((acc, id) => {
    acc[id] = isPermissionEnabled(parsed[id]);
    return acc;
  }, {});
}

function startWorkSession(user) {
  if (!user?.id) return '';
  const sessionTokenId = uuidv4();
  runSql(
    `UPDATE user_work_sessions
     SET logout_at = datetime('now'),
         worked_minutes = CAST((julianday('now') - julianday(login_at)) * 24 * 60 AS INTEGER),
         close_reason = 'auto_login',
         updated_at = datetime('now')
     WHERE user_id = ? AND logout_at IS NULL`,
    [user.id]
  );
  runSql(
    `INSERT INTO user_work_sessions
      (id, user_id, session_token_id, username, full_name, role, login_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`,
    [uuidv4(), user.id, sessionTokenId, user.username, user.full_name, user.role]
  );
  return sessionTokenId;
}

function closeWorkSession(userId, sessionTokenId = '', closeReason = 'logout') {
  const uid = String(userId || '').trim();
  const sid = String(sessionTokenId || '').trim();
  if (!uid) return false;
  const active = sid
    ? queryOne('SELECT id FROM user_work_sessions WHERE user_id = ? AND session_token_id = ? AND logout_at IS NULL LIMIT 1', [uid, sid])
    : queryOne('SELECT id FROM user_work_sessions WHERE user_id = ? AND logout_at IS NULL ORDER BY login_at DESC LIMIT 1', [uid]);
  if (!active?.id) return false;
  runSql(
    `UPDATE user_work_sessions
     SET logout_at = datetime('now'),
         worked_minutes = CAST((julianday('now') - julianday(login_at)) * 24 * 60 AS INTEGER),
         close_reason = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [closeReason, active.id]
  );
  return true;
}

function ensureOpenWorkSession(user) {
  if (!user?.id) return '';
  const existing = queryOne(
    'SELECT id, session_token_id FROM user_work_sessions WHERE user_id = ? AND logout_at IS NULL ORDER BY login_at DESC LIMIT 1',
    [user.id]
  );
  if (existing?.id) return String(existing.session_token_id || '');
  const sessionTokenId = uuidv4();
  runSql(
    `INSERT INTO user_work_sessions
      (id, user_id, session_token_id, username, full_name, role, login_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`,
    [uuidv4(), user.id, sessionTokenId, user.username, user.full_name, user.role]
  );
  return sessionTokenId;
}

function buildMasterToken() {
  const master = getMasterCredentialsPublic();
  return jwt.sign(
    {
      id: 'master-admin',
      username: master.username,
      role: 'master_admin',
      full_name: 'Administrador Maestro',
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });

  if (verifyMasterCredentials(username, password)) {
    const master = getMasterCredentialsPublic();
    const token = buildMasterToken();
    return res.json({
      token,
      user: {
        id: 'master-admin',
        username: master.username,
        email: '',
        full_name: 'Administrador Maestro',
        role: 'master_admin',
        avatar: '',
      },
    });
  }

  const lock = getLockState();
  if (lock.locked) {
    return res.status(423).json({ error: lock.reason || 'Sistema bloqueado por falta de pago' });
  }

  const user = queryOne('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const sessionTokenId = startWorkSession(user);

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      restaurant_id: user.restaurant_id,
      full_name: user.full_name,
      session_id: sessionTokenId,
    },
    JWT_SECRET, { expiresIn: '24h' }
  );

  const permissions = getUserPermissions(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      avatar: user.avatar,
      permissions,
    },
  });
});

router.post('/logout', authenticateToken, (req, res) => {
  if (req.user?.type === 'customer' || req.user?.role === 'master_admin') {
    return res.json({ success: true, closed: false });
  }
  const closed = closeWorkSession(req.user?.id, req.user?.session_id, 'logout');
  return res.json({ success: true, closed });
});

router.post('/customer/register', (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  const lock = getLockState();
  if (lock.locked) {
    return res.status(423).json({ error: lock.reason || 'Sistema bloqueado por falta de pago' });
  }

  const existing = queryOne('SELECT id FROM customers WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'El email ya está registrado' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  runSql('INSERT INTO customers (id, name, email, password_hash, phone, address) VALUES (?, ?, ?, ?, ?, ?)', [id, name, email, hash, phone || '', address || '']);

  const token = jwt.sign({ id, email, name, type: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, customer: { id, name, email, phone, address } });
});

router.post('/customer/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  const lock = getLockState();
  if (lock.locked) {
    return res.status(423).json({ error: lock.reason || 'Sistema bloqueado por falta de pago' });
  }

  const customer = queryOne('SELECT * FROM customers WHERE email = ?', [email]);
  if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign({ id: customer.id, email: customer.email, name: customer.name, type: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, address: customer.address } });
});

router.get('/me', authenticateToken, (req, res) => {
  if (req.user.role === 'master_admin') {
    const master = getMasterCredentialsPublic();
    return res.json({
      id: 'master-admin',
      username: master.username,
      full_name: 'Administrador Maestro',
      role: 'master_admin',
      type: 'staff',
    });
  }
  if (req.user.type === 'customer') {
    const customer = queryOne('SELECT id, name, email, phone, address FROM customers WHERE id = ?', [req.user.id]);
    return res.json({ ...customer, type: 'customer' });
  }
  ensureOpenWorkSession(req.user);
  const user = queryOne('SELECT id, username, email, full_name, role, avatar, phone FROM users WHERE id = ?', [req.user.id]);
  const permissions = getUserPermissions(req.user.id);
  res.json({ ...user, permissions, type: 'staff' });
});

module.exports = router;
