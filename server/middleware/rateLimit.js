function createRateLimiter({ windowMs = 60000, max = 60 } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || now > current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfterSec = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.' });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
