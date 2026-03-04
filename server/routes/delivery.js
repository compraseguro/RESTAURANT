const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const DELIVERY_TRANSITIONS = {
  assigned: ['picking_up'],
  picking_up: ['on_the_way'],
  on_the_way: ['delivered'],
  delivered: [],
};

router.get('/drivers', authenticateToken, requireRole('admin'), (req, res) => {
  const drivers = queryAll("SELECT id, username, full_name, phone, is_active FROM users WHERE role = 'delivery'");
  drivers.forEach(d => {
    d.current_delivery = queryOne("SELECT da.*, o.order_number, o.delivery_address, o.customer_name FROM delivery_assignments da JOIN orders o ON o.id = da.order_id WHERE da.driver_id = ? AND da.status != 'delivered'", [d.id]) || null;
  });
  res.json(drivers);
});

router.post('/assign', authenticateToken, requireRole('admin', 'cajero'), (req, res) => {
  const { order_id, driver_id } = req.body;
  if (!order_id || !driver_id) return res.status(400).json({ error: 'Pedido y repartidor son requeridos' });

  const order = queryOne('SELECT id, type, status FROM orders WHERE id = ?', [order_id]);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (order.type !== 'delivery') return res.status(400).json({ error: 'Solo se pueden asignar pedidos de delivery' });
  if (!['ready', 'preparing'].includes(order.status)) return res.status(400).json({ error: 'El pedido no está listo para asignar delivery' });

  const driver = queryOne("SELECT id, role, is_active FROM users WHERE id = ?", [driver_id]);
  if (!driver || driver.role !== 'delivery') return res.status(400).json({ error: 'Repartidor inválido' });
  if (Number(driver.is_active || 0) !== 1) return res.status(400).json({ error: 'El repartidor está inactivo' });

  const existing = queryOne("SELECT id FROM delivery_assignments WHERE order_id = ? AND status != 'delivered'", [order_id]);
  if (existing) return res.status(400).json({ error: 'Este pedido ya tiene un repartidor asignado' });

  const id = uuidv4();
  runSql('INSERT INTO delivery_assignments (id, order_id, driver_id) VALUES (?, ?, ?)', [id, order_id, driver_id]);

  const assignment = queryOne('SELECT da.*, o.order_number, o.delivery_address, o.customer_name, u.full_name as driver_name FROM delivery_assignments da JOIN orders o ON o.id = da.order_id JOIN users u ON u.id = da.driver_id WHERE da.id = ?', [id]);
  const io = req.app.get('io');
  if (io) {
    io.to(`delivery-${driver_id}`).emit('delivery-assigned', assignment);
    io.emit('delivery-update', assignment);
  }
  res.status(201).json(assignment);
});

router.get('/my-deliveries', authenticateToken, requireRole('delivery'), (req, res) => {
  const deliveries = queryAll(
    `SELECT da.*, o.order_number, o.delivery_address, o.customer_name, o.total, o.notes
     FROM delivery_assignments da
     JOIN orders o ON o.id = da.order_id
     WHERE da.driver_id = ? AND da.status != 'delivered'
     ORDER BY da.assigned_at DESC`,
    [req.user.id]
  );
  deliveries.forEach(d => { d.items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [d.order_id]); });
  res.json(deliveries);
});

router.put('/:id/status', authenticateToken, requireRole('admin', 'cajero', 'delivery'), (req, res) => {
  const { status } = req.body;
  const valid = ['assigned', 'picking_up', 'on_the_way', 'delivered'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  const assignment = queryOne('SELECT * FROM delivery_assignments WHERE id = ?', [req.params.id]);
  if (!assignment) return res.status(404).json({ error: 'Asignación no encontrada' });
  if (req.user.role === 'delivery' && assignment.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'No puedes actualizar entregas de otro repartidor' });
  }
  const allowedNext = DELIVERY_TRANSITIONS[assignment.status] || [];
  if (!allowedNext.includes(status)) {
    return res.status(400).json({ error: `Transición inválida: ${assignment.status} -> ${status}` });
  }

  let extra = '';
  if (status === 'picking_up') extra = ", picked_up_at = datetime('now')";
  else if (status === 'delivered') extra = ", delivered_at = datetime('now')";

  runSql(`UPDATE delivery_assignments SET status = ?${extra} WHERE id = ?`, [status, req.params.id]);

  if (status === 'delivered') {
    runSql("UPDATE orders SET status = 'delivered', updated_at = datetime('now') WHERE id = ?", [assignment.order_id]);
  }

  const updated = queryOne('SELECT da.*, o.order_number, o.delivery_address, o.customer_name, u.full_name as driver_name FROM delivery_assignments da JOIN orders o ON o.id = da.order_id JOIN users u ON u.id = da.driver_id WHERE da.id = ?', [req.params.id]);
  const io = req.app.get('io');
  if (io) {
    io.to(`delivery-${updated.driver_id}`).emit('delivery-update', updated);
    io.emit('delivery-update', updated);
  }
  res.json(updated);
});

router.put('/:id/rate', authenticateToken, requireRole('admin', 'cajero', 'delivery'), (req, res) => {
  const { rating } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Calificación debe ser entre 1 y 5' });
  runSql('UPDATE delivery_assignments SET rating = ? WHERE id = ?', [rating, req.params.id]);
  res.json({ success: true });
});

module.exports = router;
