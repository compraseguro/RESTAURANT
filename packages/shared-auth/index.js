const jwt = require('jsonwebtoken');

function signServiceToken(payload, secret, expiresIn = '1h') {
  if (!secret) throw new Error('JWT_SECRET o API_SECRET_KEY requerido');
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyServiceToken(token, secret) {
  return jwt.verify(token, secret);
}

/** Middleware Express: Authorization Bearer con API_SECRET_KEY compartido. */
function requireBearerApiSecret(apiSecretKeyOrGetter) {
  const resolveExpected = typeof apiSecretKeyOrGetter === 'function'
    ? apiSecretKeyOrGetter
    : () => apiSecretKeyOrGetter;
  return (req, res, next) => {
    const expected = String(resolveExpected() || '').trim();
    if (!expected) {
      return res.status(503).json({ error: 'API_SECRET_KEY no configurado en el servidor central' });
    }
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || token !== expected) {
      return res.status(401).json({ error: 'Token de servicio inválido' });
    }
    req.serviceAuth = { type: 'bearer', clientId: req.body?.clientId || req.headers['x-client-id'] || '' };
    return next();
  };
}

/** Valida JWT firmado por web service cliente (payload incluye clientId, webServiceId). */
function requireServiceJwt(jwtSecret) {
  const secret = String(jwtSecret || '').trim();
  return (req, res, next) => {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Bearer token requerido' });
    try {
      const decoded = verifyServiceToken(token, secret);
      req.serviceAuth = decoded;
      return next();
    } catch (_) {
      return res.status(401).json({ error: 'JWT de servicio inválido o expirado' });
    }
  };
}

module.exports = {
  signServiceToken,
  verifyServiceToken,
  requireBearerApiSecret,
  requireServiceJwt,
};
