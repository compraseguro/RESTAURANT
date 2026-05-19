function safeBodyPreview(body, maxLen = 400) {
  if (!body || typeof body !== 'object') return null;
  try {
    const copy = { ...body };
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.slice(0, 8).map((it) => ({
        product_id: it?.product_id,
        quantity: it?.quantity,
      }));
      if (body.items.length > 8) copy.items.push({ _truncated: body.items.length - 8 });
    }
    const s = JSON.stringify(copy);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch (_) {
    return null;
  }
}

function logRouteError(req, err, extra = {}) {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'route_error',
      request_id: req?.requestId,
      method: req?.method,
      path: req?.originalUrl || req?.path,
      user_id: req?.user?.id,
      role: req?.user?.role,
      error: err?.message || String(err),
      stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
      body_preview: safeBodyPreview(req?.body),
      ...extra,
    }),
  );
}

function publicErrorMessage(err, fallback = 'Error interno. Intente nuevamente.') {
  const msg = String(err?.message || err || '').trim();
  if (!msg || msg === 'undefined') return fallback;
  if (/^internal server error$/i.test(msg)) return fallback;
  return msg;
}

function sendRouteError(res, req, err, fallback, statusCode = 500) {
  logRouteError(req, err);
  return res.status(statusCode).json({ error: publicErrorMessage(err, fallback) });
}

/** Envuelve handlers async/sync para capturar excepciones no controladas. */
function asyncRoute(handler, fallbackMessage) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch((err) => {
        if (res.headersSent) return next(err);
        sendRouteError(res, req, err, fallbackMessage);
      });
  };
}

module.exports = {
  logRouteError,
  publicErrorMessage,
  sendRouteError,
  asyncRoute,
  safeBodyPreview,
};
