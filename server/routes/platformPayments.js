const router = require('express').Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getSyncStatus } = require('../services/centralSyncService');
const { mapCentralSyncError } = require('../services/saasPanelErrors');
const { assertComprobantePagoUsoChangeAllowed } = require('../masterAdminService');
const {
  getPublicPlatformPaymentState,
  pollAndApplyPaymentStatus,
  pushComprobanteToCentral,
  submitComprobanteToPanel,
  readPagoUso,
} = require('../services/platformPaymentService');

router.use(authenticateToken, requireRole('admin', 'master_admin'));

/** GET /api/platform-payments/status — estado local + sincronización con central */
router.get('/status', async (req, res) => {
  try {
    await pollAndApplyPaymentStatus();
    return res.json({
      ...getPublicPlatformPaymentState(),
      central_sync: getSyncStatus(),
    });
  } catch (err) {
    return res.status(200).json({
      ...getPublicPlatformPaymentState(),
      central_sync: getSyncStatus(),
      central_user_message: 'No se pudo consultar el estado del pago. Intente más tarde.',
    });
  }
});

/** POST /api/platform-payments/submit — guarda URL y envía comprobante al panel SaaS */
router.post('/submit', async (req, res) => {
  try {
    const isMaster = String(req.user?.role || '').toLowerCase() === 'master_admin';
    const incomingUrl = String(req.body?.comprobanteUrl || '').trim();
    const pago = readPagoUso();
    const previousUrl = String(pago.comprobante_pago_url || '').trim();
    const nextUrl = incomingUrl || previousUrl;
    if (!nextUrl) {
      return res.status(400).json({
        ok: false,
        central_user_message: 'Cargue un comprobante antes de enviar.',
      });
    }
    assertComprobantePagoUsoChangeAllowed({
      isMaster,
      incomingUrl: nextUrl,
      previousUrl,
    });
    const monto = req.body?.monto != null && Number.isFinite(Number(req.body.monto))
      ? Number(req.body.monto)
      : null;
    const result = await submitComprobanteToPanel({
      comprobanteUrl: nextUrl,
      monto,
    });
    return res.status(result.ok ? 200 : 200).json({
      ok: result.ok,
      payment: result.payment || getPublicPlatformPaymentState(),
      central_sync: getSyncStatus(),
      central_user_message: result.central_user_message
        || (result.ok ? 'Comprobante enviado. Pendiente de aprobación.' : ''),
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      payment: getPublicPlatformPaymentState(),
      central_sync: getSyncStatus(),
      central_user_message: err.message || 'No se pudo enviar el comprobante.',
    });
  }
});

/** POST /api/platform-payments/resync — reenvía comprobante a la plataforma central */
router.post('/resync', async (req, res) => {
  try {
    const result = await pushComprobanteToCentral();
    return res.json({
      sync: result,
      payment: getPublicPlatformPaymentState(),
      central_sync: getSyncStatus(),
      central_user_message: mapCentralSyncError(result),
    });
  } catch (err) {
    return res.status(200).json({
      payment: getPublicPlatformPaymentState(),
      central_sync: getSyncStatus(),
      central_user_message: 'No se pudo conectar. Use «Reintentar envío».',
    });
  }
});

module.exports = router;
