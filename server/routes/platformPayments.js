const router = require('express').Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getSyncStatus } = require('../services/centralSyncService');
const { mapCentralSyncError } = require('../services/saasPanelErrors');
const {
  getPublicPlatformPaymentState,
  pollAndApplyPaymentStatus,
  pushComprobanteToCentral,
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
