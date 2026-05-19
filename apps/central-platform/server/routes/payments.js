const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireBearerApiSecret } = require('../../../../packages/shared-auth');
const { normalizePaymentEstado, PAYMENT_STATUSES } = require('../../../../packages/shared-types');
const { queryOne, runSql } = require('../database');
const { upsertClient } = require('../services/clientRegistry');

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

  const existing = queryOne(
    'SELECT id FROM payments WHERE client_id = ? AND referencia = ?',
    [clientId, referencia]
  );

  const fields = {
    restaurante: restaurantName,
    plan: String(body.plan || ''),
    monto: body.amount != null ? Number(body.amount) : body.monto != null ? Number(body.monto) : null,
    fecha,
    voucher,
    estado: normalizePaymentEstado(body.estado || body.status) || PAYMENT_STATUSES.PENDING,
    periodo_facturacion: String(body.periodoFacturacion || body.periodo_facturacion || 'mensual'),
    fecha_proxima_facturacion: String(body.fechaProximaFacturacion || body.fecha_proxima_facturacion || ''),
  };

  if (existing?.id) {
    runSql(
      `UPDATE payments SET
         restaurante = ?, plan = ?, monto = ?, fecha = ?, voucher = ?, estado = ?,
         periodo_facturacion = ?, fecha_proxima_facturacion = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        fields.restaurante,
        fields.plan,
        fields.monto,
        fields.fecha,
        fields.voucher,
        fields.estado,
        fields.periodo_facturacion,
        fields.fecha_proxima_facturacion,
        existing.id,
      ]
    );
    return res.json({ ok: true, paymentId: existing.id, updated: true });
  }

  const id = uuidv4();
  runSql(
    `INSERT INTO payments (
       id, client_id, restaurant_id, web_service_id, restaurante, plan,
       monto, fecha, voucher, referencia, estado, periodo_facturacion, fecha_proxima_facturacion
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      clientId,
      body.restaurantId || clientId,
      webServiceId,
      fields.restaurante,
      fields.plan,
      fields.monto,
      fields.fecha,
      fields.voucher,
      referencia,
      fields.estado,
      fields.periodo_facturacion,
      fields.fecha_proxima_facturacion,
    ]
  );
  return res.status(201).json({ ok: true, paymentId: id, created: true });
});

module.exports = router;
