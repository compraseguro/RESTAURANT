const express = require('express');
const { requireBearerApiSecret } = require('../../../../packages/shared-auth');
const { upsertClient } = require('../services/clientRegistry');
const { runSql } = require('../database');

const router = express.Router();

router.use(requireBearerApiSecret(() => process.env.API_SECRET_KEY));

/** POST /api/clients/profile — actualiza plan y datos desde el POS (Render). */
router.post('/profile', (req, res) => {
  try {
    const body = req.body || {};
    const clientId = String(body.clientId || req.headers['x-client-id'] || '').trim();
    if (!clientId) return res.status(400).json({ error: 'clientId es requerido' });

    const plan = String(body.plan || '').trim();
    const renderUrl = String(body.renderUrl || '').trim();

    upsertClient({
      clientId,
      restaurantId: body.restaurantId || clientId,
      webServiceId: body.webServiceId || clientId,
      licenseKey: body.apiKey || body.licenseKey || clientId,
      restaurantName: body.restaurantName || body.restaurante || '',
      sourceWebServiceUrl: renderUrl,
      plan: plan || undefined,
    });

    if (body.licenseStatus || body.expirationDate) {
      const status = String(body.licenseStatus || 'activo').toLowerCase();
      const licenseStatus =
        status === 'suspendido' || status === 'suspended' ? 'suspended' : 'active';
      runSql(
        `UPDATE clients SET license_status = ?, updated_at = datetime('now') WHERE client_id = ?`,
        [licenseStatus, clientId],
      );
      if (body.expirationDate) {
        runSql(
          `INSERT INTO licenses (client_id, license_key, plan, status, expires_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(client_id) DO UPDATE SET
             plan = COALESCE(excluded.plan, licenses.plan),
             status = excluded.status,
             expires_at = COALESCE(excluded.expires_at, licenses.expires_at),
             updated_at = datetime('now')`,
          [
            clientId,
            clientId,
            plan || 'plan premium',
            licenseStatus,
            String(body.expirationDate).slice(0, 10),
          ],
        );
      }
    }

    return res.json({ ok: true, clientId, plan: plan || null });
  } catch (err) {
    console.error('[central-clients] profile:', err.message || err);
    return res.status(500).json({ error: err.message || 'Error al actualizar perfil' });
  }
});

module.exports = router;
