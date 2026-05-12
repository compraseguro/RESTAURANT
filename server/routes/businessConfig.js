const router = require('express').Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const businessConfig = require('../services/businessConfigService');

router.use(authenticateToken, requireRole('admin', 'master_admin'));

router.get('/effective', (req, res) => {
  try {
    res.json(businessConfig.getEffectiveDomainsPayload());
  } catch (err) {
    res.status(500).json({ error: err.message || 'No se pudo leer la configuración' });
  }
});

router.put('/values', (req, res) => {
  try {
    const updates = req.body?.updates;
    businessConfig.setValues(updates, {
      actorUserId: req.user?.id || '',
      actorName: req.user?.full_name || req.user?.username || '',
      ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
    });
    res.json(businessConfig.getEffectiveDomainsPayload());
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar' });
  }
});

router.get('/history', (req, res) => {
  try {
    const key = String(req.query.key || '').trim();
    const limit = req.query.limit;
    res.json({ rows: businessConfig.listHistory({ key, limit }) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No se pudo leer el historial' });
  }
});

module.exports = router;
