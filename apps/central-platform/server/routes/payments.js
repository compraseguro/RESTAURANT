const express = require('express');
const { requireBearerApiSecret } = require('../../../../packages/shared-auth');
const { normalizePaymentEstado, PAYMENT_STATUSES } = require('../../../../packages/shared-types');
const { queryOne } = require('../database');
const { upsertClient } = require('../services/clientRegistry');
const { upsertPaymentRecord } = require('../services/paymentRecord');

const router = express.Router();

router.use(requireBearerApiSecret(() => process.env.API_SECRET_KEY));

function assertClientAccess(req, clientId) {
  const hdr = String(req.headers['x-client-id'] || '').trim();
  if (hdr && hdr !== clientId) {
    return { ok: false, status: 403, error: 'Acceso denegado para este cliente' };
  }
  return { ok: true };
}

/** GET /api/payments/status?clientId=&referencia= — consulta estado para polling del POS */
router.get('/status', (req, res) => {
  const clientId = String(req.query.clientId || req.headers['x-client-id'] || '').trim();
  const referencia = String(req.query.referencia || '').trim();
  if (!clientId) return res.status(400).json({ error: 'clientId es requerido' });
  const access = assertClientAccess(req, clientId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  let row;
  if (referencia) {
    row = queryOne(
      'SELECT * FROM payments WHERE client_id = ? AND referencia = ? ORDER BY created_at DESC LIMIT 1',
      [clientId, referencia],
    );
  } else {
    row = queryOne(
      `SELECT * FROM payments WHERE client_id = ?
       ORDER BY CASE WHEN estado IN ('pendiente','pending') THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`,
      [clientId],
    );
  }

  if (!row) {
    return res.json({ ok: true, estado: null, payment: null });
  }

  const estado = normalizePaymentEstado(row.estado) || PAYMENT_STATUSES.PENDING;
  return res.json({
    ok: true,
    estado,
    paymentId: row.id,
    referencia: row.referencia,
    payment: {
      id: row.id,
      client_id: row.client_id,
      referencia: row.referencia,
      estado,
      monto: row.monto,
      voucher: row.voucher,
      fecha: row.fecha,
      updated_at: row.updated_at,
      created_at: row.created_at,
    },
  });
});

/** POST /api/payments — recibe comprobantes (payload mínimo o legacy) */
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    const clientId = String(body.clientId || '').trim();
    const webServiceId = String(
      body.webServiceId || req.headers['x-web-service-id'] || clientId,
    ).trim();
    if (!clientId) return res.status(400).json({ error: 'clientId es requerido' });
    const access = assertClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const restaurantName = String(body.restaurantName || body.restaurante || '').trim();
    const voucher = String(body.voucherUrl || body.voucher || '').trim();
    const referencia = String(
      body.operationNumber || body.referencia || body.reference || `pay-${Date.now()}`,
    ).trim();
    const fecha = String(
      body.paymentDate || body.fecha || new Date().toISOString().slice(0, 10),
    ).trim();

    upsertClient({
      clientId,
      restaurantId: body.restaurantId || clientId,
      webServiceId,
      licenseKey: body.licenseKey || req.headers['x-license-key'] || clientId,
      restaurantName,
      sourceWebServiceUrl: body.sourceWebServiceUrl,
      plan: body.plan,
    });

    const result = upsertPaymentRecord({
      clientId,
      restaurantId: body.restaurantId || clientId,
      webServiceId,
      referencia,
      restaurante: restaurantName,
      plan: body.plan,
      monto: body.amount != null ? body.amount : body.monto,
      fecha,
      voucher,
      estado: body.estado || body.status,
      periodoFacturacion: body.periodoFacturacion || body.periodo_facturacion,
      fechaProximaFacturacion: body.fechaProximaFacturacion || body.fecha_proxima_facturacion,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
    });

    const status = result.updated ? 200 : 201;
    return res.status(status).json({ ok: true, paymentId: result.paymentId, ...result });
  } catch (err) {
    console.error('[central-payments] POST error:', err.message || err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Error al registrar pago',
    });
  }
});

module.exports = router;
