const router = require('express').Router();
const { getSystemHealthPayload, touchSaasLastActivity } = require('../services/posSaasIdentityService');

/** GET /api/system/health — disponibilidad del POS (sin secretos) */
router.get('/health', (req, res) => {
  touchSaasLastActivity();
  return res.json(getSystemHealthPayload());
});

module.exports = router;
