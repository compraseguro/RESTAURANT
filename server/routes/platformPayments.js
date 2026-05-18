const router = require('express').Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getSyncStatus } = require('../services/centralSyncService');
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
    return res.status(500).json({ error: err.message || 'Error al consultar pago' });
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
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error al reenviar pago' });
  }
});

module.exports = router;
