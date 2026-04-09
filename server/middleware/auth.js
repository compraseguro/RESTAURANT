const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { queryOne, runSql } = require('../database');
const { getLockState, getMasterCredentialsPublic } = require('../masterAdminService');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET es obligatorio. Define la variable de entorno antes de iniciar el servidor.');
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === 'master_admin') {
      const masterPub = getMasterCredentialsPublic();
      req.user = {
        id: decoded.id || 'master-admin',
        username: decoded.username || masterPub.username || 'Romero25879',
        role: 'master_admin',
        full_name: decoded.full_name || 'Administrador Maestro',
      };
      return next();
    }
    if (decoded.type === 'customer') {
      const lock = getLockState();
      if (lock.locked) {
        return res.status(423).json({ error: lock.reason || 'Sistema bloqueado por falta de pago' });
      }
      const customer = queryOne('SELECT id, name, email FROM customers WHERE id = ?', [decoded.id]);
      if (!customer) return res.status(401).json({ error: 'Cliente no encontrado o inactivo' });
      req.user = decoded;
      return next();
    }
    const user = queryOne('SELECT id, username, role, full_name, is_active FROM users WHERE id = ?', [decoded.id]);
    if (!user || Number(user.is_active || 0) !== 1) {
      return res.status(401).json({ error: 'Usuario no autorizado' });
    }
    req.user = {
      ...decoded,
      role: user.role,
      username: user.username,
      full_name: user.full_name,
    };
    ensureOpenWorkSession(req.user);
    const lock = getLockState();
    if (lock.locked) {
      return res.status(423).json({ error: lock.reason || 'Sistema bloqueado por falta de pago' });
    }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

function ensureOpenWorkSession(user) {
  const trackableRoles = new Set(['admin', 'cajero', 'mozo', 'cocina', 'bar', 'delivery']);
  if (!user?.id || !trackableRoles.has(user.role)) return;

  try {
    const openSession = queryOne(
      'SELECT id FROM user_work_sessions WHERE user_id = ? AND logout_at IS NULL ORDER BY login_at DESC LIMIT 1',
      [user.id]
    );
    if (openSession?.id) return;

    runSql(
      `INSERT INTO user_work_sessions
       (id, user_id, session_token_id, username, full_name, role, login_at, photo_login, attendance_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), NULL, 'pending', datetime('now'), datetime('now'))`,
      [
        uuidv4(),
        user.id,
        uuidv4(),
        user.username || '',
        user.full_name || '',
        user.role || '',
      ]
    );
  } catch (_) {
    // Best effort: auth should continue even if tracking fails.
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (req.user.role === 'master_admin') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // ignore
    }
  }
  next();
}

module.exports = { authenticateToken, requireRole, optionalAuth, JWT_SECRET };
