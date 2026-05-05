'use strict';

const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { loadConfig, saveConfig } = require('../printing/configManager');
const { getUSBPrinters, scanNetworkPrinters } = require('../printing/printerDetector');
const { printToStation, STATIONS } = require('../printing/printerService');
const { getOrderWithItems } = require('../orderCreateService');
const { buildKitchenTicketPlainText } = require('../printing/ticketPlainNode');
const { queryOne } = require('../database');

const router = express.Router();

const STAFF_PRINT = ['admin', 'master_admin', 'cajero', 'mozo', 'cocina', 'bar', 'delivery'];

router.get('/config', authenticateToken, requireRole(...STAFF_PRINT), (req, res) => {
  res.json(loadConfig());
});

router.put(
  '/config',
  authenticateToken,
  requireRole('admin', 'master_admin', 'cocina', 'bar', 'cajero', 'delivery'),
  (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const next = saveConfig(body);
    res.json(next);
  } catch (e) {
    res.status(400).json({ error: e.message || 'No se pudo guardar' });
  }
});

router.get('/usb-printers', authenticateToken, requireRole(...STAFF_PRINT), async (req, res) => {
  const r = await getUSBPrinters();
  res.json(r);
});

router.post('/scan-network', authenticateToken, requireRole(...STAFF_PRINT), async (req, res) => {
  try {
    const timeout = req.body?.timeout;
    const ports = req.body?.ports;
    const r = await scanNetworkPrinters({
      timeout: timeout != null ? Number(timeout) : undefined,
      ports: Array.isArray(ports) ? ports : undefined,
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'scan' });
  }
});

/**
 * Cuerpo: { station, text?, orderId?, copies?, openCashDrawer?, widthMm? }
 * Si viene orderId, el servidor arma el texto de comanda (cocina/bar).
 */
router.post('/print', authenticateToken, requireRole(...STAFF_PRINT), async (req, res) => {
  const station = String(req.body?.station || '').toLowerCase();
  if (!STATIONS.has(station)) {
    return res.status(400).json({ ok: false, error: 'station inválida' });
  }
  const orderId = String(req.body?.orderId || '').trim();
  let text = String(req.body?.text || '').trim();
  const copies = req.body?.copies;
  const openCashDrawer = Boolean(req.body?.openCashDrawer);
  const widthMm = req.body?.widthMm;

  if (orderId) {
    const order = getOrderWithItems(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }
    const restaurant =
      queryOne('SELECT name, address, phone FROM restaurants LIMIT 1') || {};
    const title = `Comanda · #${order.order_number}`;
    const wm = [58, 80].includes(Number(widthMm)) ? Number(widthMm) : 80;
    text = buildKitchenTicketPlainText({
      restaurant,
      title,
      orders: [order],
      copies: 1,
      widthMm: wm,
    });
  }

  if (!text) {
    return res.status(400).json({ ok: false, error: 'text u orderId requerido' });
  }

  const r = await printToStation(station, text, { copies, openCashDrawer, widthMm });
  if (!r.ok) {
    return res.status(502).json({ ok: false, error: r.error || 'Impresión fallida' });
  }
  res.json({ ok: true, via: r.via });
});

module.exports = router;
