const router = require('express').Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getSyncStatus } = require('../services/centralSyncService');

router.get('/status', authenticateToken, requireRole('admin', 'master_admin'), (req, res) => {
  res.json(getSyncStatus());
});

module.exports = router;
