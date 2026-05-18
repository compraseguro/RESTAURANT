const router = require('express').Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getPublicPlatformPaymentState,
  pollAndApplyPaymentStatus,
} = require('../services/platformPaymentService');

router.use(authenticateToken, requireRole('admin', 'master_admin'));

/** GET /api/platform-payments/status — estado local + sincronización con central */
router.get('/status', async (req, res) => {
  try {
    await pollAndApplyPaymentStatus();
    return res.json(getPublicPlatformPaymentState());
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error al consultar pago' });
  }
});

module.exports = router;
