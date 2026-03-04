const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { queryOne, runSql, createBackupFile, restoreDbFromBuffer, resetOperationalData } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/', (req, res) => {
  const restaurant = queryOne('SELECT * FROM restaurants LIMIT 1');
  if (restaurant) restaurant.schedule = JSON.parse(restaurant.schedule || '{}');
  res.json(restaurant || {});
});

router.put('/', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, address, phone, email, logo, tax_rate, currency, currency_symbol, delivery_enabled, delivery_fee, delivery_min_order, delivery_radius_km, schedule } = req.body;

  runSql(`UPDATE restaurants SET 
    name = COALESCE(?, name), address = COALESCE(?, address), phone = COALESCE(?, phone), email = COALESCE(?, email), logo = COALESCE(?, logo),
    tax_rate = COALESCE(?, tax_rate), currency = COALESCE(?, currency), currency_symbol = COALESCE(?, currency_symbol),
    delivery_enabled = COALESCE(?, delivery_enabled), delivery_fee = COALESCE(?, delivery_fee),
    delivery_min_order = COALESCE(?, delivery_min_order), delivery_radius_km = COALESCE(?, delivery_radius_km),
    schedule = COALESCE(?, schedule), updated_at = datetime('now')
    WHERE id = (SELECT id FROM restaurants LIMIT 1)`,
    [name, address, phone, email, logo, tax_rate, currency, currency_symbol, delivery_enabled, delivery_fee, delivery_min_order, delivery_radius_km, schedule ? JSON.stringify(schedule) : null]
  );

  const updated = queryOne('SELECT * FROM restaurants LIMIT 1');
  updated.schedule = JSON.parse(updated.schedule || '{}');
  res.json(updated);
});

router.get('/backup', authenticateToken, requireRole('admin', 'master_admin'), (req, res) => {
  const backupPath = createBackupFile();
  const fileName = path.basename(backupPath);
  if (!fs.existsSync(backupPath)) return res.status(500).json({ error: 'No se pudo generar el backup' });
  return res.download(backupPath, fileName);
});

router.post('/restore', authenticateToken, requireRole('admin', 'master_admin'), restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Debes subir un archivo de backup' });
  try {
    await restoreDbFromBuffer(req.file.buffer);
    return res.json({ success: true, message: 'Información restaurada correctamente' });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'No se pudo restaurar el backup' });
  }
});

router.post('/reset-operational', authenticateToken, requireRole('admin', 'master_admin'), (req, res) => {
  try {
    const keepAdminUserId = req.user?.role === 'admin' ? req.user.id : '';
    resetOperationalData({ keepAdminUserId });
    return res.json({
      success: true,
      message: 'Datos operativos reiniciados para modo de pruebas',
      kept_user_id: keepAdminUserId || null,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'No se pudo reiniciar la información operativa' });
  }
});

module.exports = router;
