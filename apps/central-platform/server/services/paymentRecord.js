const { v4: uuidv4 } = require('uuid');
const { normalizePaymentEstado, PAYMENT_STATUSES } = require('../../../../packages/shared-types');
const { queryOne, runSql } = require('../database');

/**
 * Inserta/actualiza pago con columnas explícitas (evita desajuste values/columns).
 */
function upsertPaymentRecord({
  clientId,
  restaurantId,
  webServiceId,
  referencia,
  restaurante = '',
  plan = '',
  monto = null,
  fecha = '',
  voucher = '',
  estado = PAYMENT_STATUSES.PENDING,
  periodoFacturacion = 'mensual',
  fechaProximaFacturacion = '',
  adminName = '',
  adminEmail = '',
}) {
  const ref = String(referencia || '').trim();
  if (!ref) throw new Error('referencia es requerida');

  const fields = {
    restaurante: String(restaurante || '').trim(),
    plan: String(plan || '').trim(),
    monto: monto != null && Number.isFinite(Number(monto)) ? Number(monto) : null,
    fecha: String(fecha || new Date().toISOString().slice(0, 10)).trim(),
    voucher: String(voucher || '').trim(),
    estado: normalizePaymentEstado(estado) || PAYMENT_STATUSES.PENDING,
    periodo_facturacion: String(periodoFacturacion || 'mensual').trim(),
    fecha_proxima_facturacion: String(fechaProximaFacturacion || '').trim(),
    admin_name: String(adminName || '').trim(),
    admin_email: String(adminEmail || '').trim(),
  };

  const existing = queryOne(
    'SELECT id FROM payments WHERE client_id = ? AND referencia = ?',
    [clientId, ref],
  );

  if (existing?.id) {
    runSql(
      `UPDATE payments SET
         restaurante = ?, plan = ?, monto = ?, fecha = ?, voucher = ?, estado = ?,
         periodo_facturacion = ?, fecha_proxima_facturacion = ?,
         admin_name = ?, admin_email = ?,
         updated_at = datetime('now')
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
        fields.admin_name,
        fields.admin_email,
        existing.id,
      ],
    );
    return { paymentId: existing.id, updated: true };
  }

  const id = uuidv4();
  runSql(
    `INSERT INTO payments (
       id, client_id, restaurant_id, web_service_id, restaurante, plan,
       monto, fecha, voucher, referencia, estado,
       periodo_facturacion, fecha_proxima_facturacion, admin_name, admin_email
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      clientId,
      restaurantId || clientId,
      webServiceId || clientId,
      fields.restaurante,
      fields.plan,
      fields.monto,
      fields.fecha,
      fields.voucher,
      ref,
      fields.estado,
      fields.periodo_facturacion,
      fields.fecha_proxima_facturacion,
      fields.admin_name,
      fields.admin_email,
    ],
  );
  return { paymentId: id, created: true };
}

module.exports = { upsertPaymentRecord };
