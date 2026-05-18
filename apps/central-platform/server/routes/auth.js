const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne, runSql } = require('../database');

const router = express.Router();
const JWT_SECRET = () => process.env.JWT_SECRET;

/** Login compartido: mismo email/contraseña que en el POS (espejado vía sync). */
router.post('/login', (req, res) => {
  const email = String(req.body?.email || req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const user = queryOne(
    `SELECT * FROM central_users WHERE email = ? AND is_active = 1`,
    [email]
  );
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  runSql(`UPDATE central_users SET last_login_at = datetime('now') WHERE id = ?`, [user.id]);

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      clientId: user.client_id,
    },
    JWT_SECRET(),
    { expiresIn: '24h' }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      client_id: user.client_id,
    },
  });
});

module.exports = router;
