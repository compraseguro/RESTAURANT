const express = require('express');
const { requireBearerApiSecret } = require('../../../../packages/shared-auth');
const { normalizePaymentEstado, PAYMENT_STATUSES } = require('../../../../packages/shared-types');
const { queryOne } = require('../database');

const router = express.Router();

router.use(requireBearerApiSecret(() => process.env.API_SECRET_KEY));

function assertClientAccess(req, clientId) {
  const hdr = String(req.headers['x-client-id'] || '').trim();
  if (hdr && hdr !== clientId) {
    return { ok: false, status: 403, error: 'Acceso denegado para este cliente' };
  }
  return { ok: true };
}

/** GET /api/license-status/:clientId — estado de licencia y último pago (polling POS) */
router.get('/:clientId', (req, res) => {
  const clientId = String(req.params.clientId || '').trim();
  if (!clientId) return res.status(400).json({ error: 'clientId es requerido' });

  const access = assertClientAccess(req, clientId);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const client = queryOne('SELECT * FROM clients WHERE client_id = ?', [clientId]);
  const license = queryOne('SELECT * FROM licenses WHERE client_id = ?', [clientId]);
  const payment = queryOne(
    `SELECT * FROM payments WHERE client_id = ?
     ORDER BY CASE WHEN estado IN ('pendiente','pending') THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [clientId],
  );

  const paymentStatus = payment
    ? normalizePaymentEstado(payment.estado) || PAYMENT_STATUSES.PENDING
    : null;
  const licenseStatus = String(
    license?.status || client?.license_status || 'active',
  ).trim();

  return res.json({
    ok: true,
    clientId,
    paymentStatus,
    licenseStatus,
    plan: client?.plan || payment?.plan || '',
    licenseUpdated: Boolean(license?.updated_at || client?.updated_at),
    payment: payment
      ? {
          id: payment.id,
          referencia: payment.referencia,
          estado: paymentStatus,
          monto: payment.monto,
          voucher: payment.voucher,
          fecha: payment.fecha,
          updated_at: payment.updated_at,
        }
      : null,
  });
});

module.exports = router;
