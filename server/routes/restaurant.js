const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { queryOne, runSql, createBackupFile, restoreDbFromBuffer, resetOperationalData } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getControlConfig } = require('../masterAdminService');

const router = express.Router();

function parseJsonSafe(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function defaultBillingPanel() {
  return {
    cod_establecimiento: '0000',
    sol_usuario: '',
    sol_clave: '',
    cert_pfx_path: '',
    cert_pfx_password: '',
    tipo_envio: 'directo',
    ose_url: '',
    sunat_modo: 'beta',
    forma_pago_default: 'contado',
    operacion_default: 'gravada',
    validacion_estricta: 1,
    control_duplicados: 1,
    log_operaciones: 1,
    almacenamiento_activo: 1,
    nota_encriptacion_cert: '',
    nota_encriptacion_cred: '',
    cliente_interno_id: '',
    default_invoice_lines: 'detallado',
  };
}

/** Reinicio desde Mi Restaurante (requiere contraseña en el cliente). Puede sobreescribirse con RESET_OPERATIONAL_PASSWORD. */
const RESET_OPERATIONAL_PASSWORD = String(process.env.RESET_OPERATIONAL_PASSWORD || '2587903042007');
const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/', (req, res) => {
  const restaurant = queryOne('SELECT * FROM restaurants LIMIT 1');
  if (restaurant) {
    restaurant.schedule = JSON.parse(restaurant.schedule || '{}');
    restaurant.billing_panel = {
      ...defaultBillingPanel(),
      ...parseJsonSafe(restaurant.billing_panel_json, {}),
    };
  }
  res.json(restaurant || {});
});

router.put('/', authenticateToken, requireRole('admin', 'master_admin'), (req, res) => {
  const isMaster = req.user?.role === 'master_admin';
  const adminMayEditBillingBot =
    isMaster || Number(getControlConfig().allow_restaurant_admin_billing_bot ?? 0) === 1;
  const current = queryOne('SELECT * FROM restaurants LIMIT 1');
  const b = req.body || {};
  let {
    name, address, phone, email, logo, tax_rate, currency, currency_symbol,
    delivery_enabled, delivery_fee, delivery_min_order, delivery_radius_km, schedule,
    company_ruc, legal_name, billing_nombre_comercial, billing_emisor_ubigeo,
    billing_emisor_direccion, billing_emisor_provincia, billing_emisor_departamento,
    billing_emisor_distrito, billing_series_boleta, billing_series_factura,
  } = b;

  let nextBillingPanelJson = String(current?.billing_panel_json || '').trim() || JSON.stringify(defaultBillingPanel());
  if (adminMayEditBillingBot && b.billing_panel !== undefined && typeof b.billing_panel === 'object') {
    const prev = parseJsonSafe(current?.billing_panel_json, {});
    nextBillingPanelJson = JSON.stringify({
      ...defaultBillingPanel(),
      ...prev,
      ...b.billing_panel,
    });
  }

  /** SUNAT / series: maestro siempre; admin del restaurante solo si el maestro lo habilitó en el control. */
  if (!adminMayEditBillingBot) {
    company_ruc = null;
    legal_name = null;
    billing_nombre_comercial = null;
    billing_emisor_ubigeo = null;
    billing_emisor_direccion = null;
    billing_emisor_provincia = null;
    billing_emisor_departamento = null;
    billing_emisor_distrito = null;
    billing_series_boleta = null;
    billing_series_factura = null;
    nextBillingPanelJson = String(current?.billing_panel_json || '').trim() || nextBillingPanelJson;
  }

  runSql(`UPDATE restaurants SET 
    name = COALESCE(?, name), address = COALESCE(?, address), phone = COALESCE(?, phone), email = COALESCE(?, email), logo = COALESCE(?, logo),
    tax_rate = COALESCE(?, tax_rate), currency = COALESCE(?, currency), currency_symbol = COALESCE(?, currency_symbol),
    delivery_enabled = COALESCE(?, delivery_enabled), delivery_fee = COALESCE(?, delivery_fee),
    delivery_min_order = COALESCE(?, delivery_min_order), delivery_radius_km = COALESCE(?, delivery_radius_km),
    schedule = COALESCE(?, schedule),
    company_ruc = COALESCE(?, company_ruc), legal_name = COALESCE(?, legal_name),
    billing_nombre_comercial = COALESCE(?, billing_nombre_comercial),
    billing_emisor_ubigeo = COALESCE(?, billing_emisor_ubigeo),
    billing_emisor_direccion = COALESCE(?, billing_emisor_direccion),
    billing_emisor_provincia = COALESCE(?, billing_emisor_provincia),
    billing_emisor_departamento = COALESCE(?, billing_emisor_departamento),
    billing_emisor_distrito = COALESCE(?, billing_emisor_distrito),
    billing_series_boleta = COALESCE(?, billing_series_boleta),
    billing_series_factura = COALESCE(?, billing_series_factura),
    billing_panel_json = ?,
    updated_at = datetime('now')
    WHERE id = (SELECT id FROM restaurants LIMIT 1)`,
    [
      name, address, phone, email, logo, tax_rate, currency, currency_symbol,
      delivery_enabled, delivery_fee, delivery_min_order, delivery_radius_km,
      schedule ? JSON.stringify(schedule) : null,
      company_ruc, legal_name, billing_nombre_comercial, billing_emisor_ubigeo,
      billing_emisor_direccion, billing_emisor_provincia, billing_emisor_departamento,
      billing_emisor_distrito, billing_series_boleta, billing_series_factura,
      nextBillingPanelJson,
    ]
  );

  const updated = queryOne('SELECT * FROM restaurants LIMIT 1');
  updated.schedule = JSON.parse(updated.schedule || '{}');
  updated.billing_panel = {
    ...defaultBillingPanel(),
    ...parseJsonSafe(updated.billing_panel_json, {}),
  };
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
  const pwd = String(req.body?.password ?? '').trim();
  if (pwd !== RESET_OPERATIONAL_PASSWORD) {
    return res.status(403).json({ error: 'Contraseña incorrecta' });
  }
  try {
    const keepAdminUserId = req.user?.role === 'admin' ? req.user.id : '';
    resetOperationalData({ keepAdminUserId, preserveContrato: true });
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
