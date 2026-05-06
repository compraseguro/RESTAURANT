const router = require('express').Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { loadConfig, saveConfig, normalizeConfig } = require('../printing/printerConfig');
const { getPrinters } = require('../printing/printerDetector');
const { print } = require('../printing/printerService');

router.use(authenticateToken, requireRole('admin', 'master_admin', 'cajero', 'mozo', 'cocina', 'bar'));

router.get('/config', requireRole('admin', 'master_admin'), (req, res) => {
  res.json(loadConfig());
});

router.put('/config', requireRole('admin', 'master_admin'), (req, res) => {
  try {
    const next = saveConfig(req.body || {});
    res.json(next);
  } catch (err) {
    res.status(400).json({ error: err.message || 'No se pudo guardar configuración de impresión' });
  }
});

router.get('/printers', requireRole('admin', 'master_admin'), (req, res) => {
  res.json({ printers: getPrinters() });
});

router.post('/print/:module', (req, res) => {
  const moduleName = String(req.params.module || '').toLowerCase();
  print(moduleName, req.body || {})
    .then((out) => res.json(out))
    .catch((err) => {
      console.error('[printing] error:', err.message || err);
      res.status(400).json({ error: err.message || 'No se pudo imprimir' });
    });
});

router.get('/normalize-preview', requireRole('admin', 'master_admin'), (req, res) => {
  res.json(normalizeConfig(req.body || {}));
});

module.exports = router;
