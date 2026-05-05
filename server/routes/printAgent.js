const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, requireRole, signPrintAgentToken } = require('../middleware/auth');
const {
  resolveRestaurantId,
  getPrimaryRestaurantId,
  syncPrinterSettingsMirror,
} = require('../printerRoutesService');
const { queryAll, runSql, queryOne } = require('../database');
const { listAgentsForRestaurant } = require('../printAgentRegistry');
const { KNOWN_PRINT_AREAS } = require('../printerStation');

const router = express.Router();

/** Token de emparejamiento para el agente local (admin). */
router.post('/issue-token', authenticateToken, requireRole('admin', 'master_admin'), (req, res) => {
  try {
    const restaurantId =
      req.user.role === 'master_admin' ? getPrimaryRestaurantId() : resolveRestaurantId(req.user);
    if (!restaurantId) {
      return res.status(400).json({ error: 'No hay restaurante configurado' });
    }
    const deviceLabel = String(req.body?.device_label || req.body?.deviceLabel || 'Este equipo').trim().slice(0, 120);
    const deviceId = String(req.body?.device_id || req.body?.deviceId || '').trim() || uuidv4();
    const token = signPrintAgentToken({ restaurantId, deviceId, deviceLabel }, '365d');
    res.json({
      token,
      deviceId,
      deviceLabel,
      restaurantId,
      /** Origen público del API (mismo host que sirve esta petición). */
      apiBase: `${req.protocol}://${req.get('host')}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'No se pudo generar el token' });
  }
});

/** Agentes conectados ahora (memoria). */
router.get('/agents-online', authenticateToken, requireRole('admin', 'cajero', 'master_admin'), (req, res) => {
  try {
    const restaurantId =
      req.user.role === 'master_admin' ? getPrimaryRestaurantId() : resolveRestaurantId(req.user);
    if (!restaurantId) return res.json({ agents: [] });
    res.json({ agents: listAgentsForRestaurant(restaurantId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Marca impresoras cocina/bar para usar Print Agent (connection_type = agent).
 * No desactiva otras; solo actualiza filas existentes o crea desde printer_routes.
 */
router.post('/enable-stations', authenticateToken, requireRole('admin', 'master_admin'), (req, res) => {
  try {
    const restaurantId =
      req.user.role === 'master_admin' ? getPrimaryRestaurantId() : resolveRestaurantId(req.user);
    if (!restaurantId) return res.status(400).json({ error: 'Sin restaurante' });

    const stations = KNOWN_PRINT_AREAS.filter((area) => !!req.body?.[area]);

    for (const area of stations) {
      const settingsRow = queryOne(
        `SELECT * FROM printer_settings WHERE restaurant_id = ? AND sucursal_id = '' AND lower(area) = ?`,
        [restaurantId, area]
      );
      if (settingsRow?.id) {
        runSql(
          `UPDATE printer_settings SET connection_type = 'agent', updated_at = datetime('now') WHERE id = ?`,
          [settingsRow.id]
        );
        continue;
      }
      const routeRow = queryOne(
        `SELECT * FROM printer_routes WHERE restaurant_id = ? AND lower(area) = ?`,
        [restaurantId, area]
      );
      if (routeRow?.id) {
        runSql(
          `UPDATE printer_routes SET printer_type = 'agent', updated_at = datetime('now') WHERE id = ?`,
          [routeRow.id]
        );
        syncPrinterSettingsMirror(restaurantId);
      }
    }

    const routes = queryAll(
      `SELECT area, connection_type, enabled, auto_print FROM printer_settings WHERE restaurant_id = ? AND sucursal_id = ''`,
      [restaurantId]
    );
    res.json({ ok: true, stations, printer_settings: routes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Impresora de prueba hacia agentes conectados. */
router.post('/test-print', authenticateToken, requireRole('admin', 'master_admin'), (req, res) => {
  try {
    const printIo = req.app.get('printIo');
    if (!printIo) return res.status(503).json({ error: 'Print namespace no disponible' });
    const restaurantId =
      req.user.role === 'master_admin' ? getPrimaryRestaurantId() : resolveRestaurantId(req.user);
    if (!restaurantId) return res.status(400).json({ error: 'Sin restaurante' });

    const station = String(req.body?.area || req.body?.station || 'cocina').toLowerCase();
    const safeStation = KNOWN_PRINT_AREAS.includes(station) ? station : 'cocina';
    const jobId = uuidv4();
    const text =
      '================================\n' +
      'PRUEBA PRINT AGENT\n' +
      `Área: ${safeStation}\n` +
      new Date().toLocaleString('es-PE') +
      '\n================================\n';

    printIo.to(`ra-${restaurantId}`).emit('print-job', {
      jobId,
      tipo: 'test',
      area: safeStation,
      pedido_id: '',
      text,
      widthMm: 80,
      copies: 1,
      cut: true,
      openCashDrawer: false,
      createdAt: new Date().toISOString(),
    });

    res.json({ ok: true, jobId, area: safeStation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Impresión bajo demanda (caja, comprobantes, texto libre). Llama desde POS o integraciones.
 */
router.post('/push-job', authenticateToken, requireRole('admin', 'cajero', 'master_admin'), (req, res) => {
  try {
    const printIo = req.app.get('printIo');
    if (!printIo) return res.status(503).json({ error: 'Print namespace no disponible' });
    const restaurantId =
      req.user.role === 'master_admin' ? getPrimaryRestaurantId() : resolveRestaurantId(req.user);
    if (!restaurantId) return res.status(400).json({ error: 'Sin restaurante' });

    const area = String(req.body?.area || 'caja').toLowerCase();
    if (!KNOWN_PRINT_AREAS.includes(area)) {
      return res.status(400).json({ error: `Área inválida (use: ${KNOWN_PRINT_AREAS.join(', ')})` });
    }
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Campo text requerido' });
    if (text.length > 32000) return res.status(400).json({ error: 'Texto demasiado largo' });

    const jobId = uuidv4();
    printIo.to(`ra-${restaurantId}`).emit('print-job', {
      jobId,
      tipo: String(req.body?.tipo || 'custom'),
      area,
      pedido_id: String(req.body?.pedido_id || ''),
      order_number: req.body?.order_number,
      text,
      widthMm: [58, 80].includes(Number(req.body?.widthMm)) ? Number(req.body.widthMm) : 80,
      copies: Math.min(5, Math.max(1, Number(req.body?.copies || 1))),
      cut: req.body?.cut !== false,
      openCashDrawer: !!req.body?.openCashDrawer,
      createdAt: new Date().toISOString(),
    });

    res.json({ ok: true, jobId, area });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
