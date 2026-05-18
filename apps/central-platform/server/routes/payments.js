const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireBearerApiSecret } = require('../../../../packages/shared-auth');
const { normalizePaymentEstado, PAYMENT_STATUSES } = require('../../../../packages/shared-types');
const { queryOne, runSql } = require('../database');
const { upsertClient } = require('../services/clientRegistry');

const router = express.Router();

router.use(requireBearerApiSecret(() => process.env.API_SECRET_KEY));

/** GET /api/payments/status?clientId=&referencia= — consulta estado para polling del POS */
router.get('/status', (req, res) => {
  const clientId = String(req.query.clientId || req.headers['x-client-id'] || '').trim();
  const referencia = String(req.query.referencia || '').trim();
  if (!clientId) return res.status(400).json({ error: 'clientId es requerido' });

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

/** POST /api/payments — recibe comprobantes y pagos desde web services cliente */
router.post('/', (req, res) => {
  const body = req.body || {};
  const clientId = String(body.clientId || '').trim();
  const webServiceId = String(body.webServiceId || req.headers['x-web-service-id'] || '').trim();
  if (!clientId) return res.status(400).json({ error: 'clientId es requerido' });

  upsertClient({
    clientId,
    restaurantId: body.restaurantId || clientId,
    webServiceId,
    licenseKey: body.licenseKey || req.headers['x-license-key'],
    restaurantName: body.restaurante || body.restaurantName || '',
    sourceWebServiceUrl: body.sourceWebServiceUrl,
    plan: body.plan,
  });

  const referencia = String(body.referencia || body.reference || `pay-${Date.now()}`).trim();
  const existing = queryOne(
    'SELECT id FROM payments WHERE client_id = ? AND referencia = ?',
    [clientId, referencia]
  );

  const fields = {
    restaurante: String(body.restaurante || body.restaurantName || ''),
    plan: String(body.plan || ''),
    monto: body.monto != null ? Number(body.monto) : null,
    fecha: String(body.fecha || new Date().toISOString().slice(0, 10)),
    voucher: String(body.voucher || ''),
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
