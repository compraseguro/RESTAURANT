const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireBearerApiSecret } = require('../../../../packages/shared-auth');
const { queryOne, runSql } = require('../database');
const { upsertClient } = require('../services/clientRegistry');

const router = express.Router();

router.use(requireBearerApiSecret(() => process.env.API_SECRET_KEY));

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
    estado: String(body.estado || body.status || 'pending'),
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
