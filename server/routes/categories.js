const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(queryAll(`SELECT c.*, COUNT(p.id) as product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1 GROUP BY c.id ORDER BY c.sort_order ASC`));
});

router.get('/active', (req, res) => {
  res.json(queryAll(`SELECT c.*, COUNT(p.id) as product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1 WHERE c.is_active = 1 GROUP BY c.id ORDER BY c.sort_order ASC`));
});

router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, description, image } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre es requerido' });

  const maxSort = queryOne('SELECT MAX(sort_order) as m FROM categories');
  const restaurant = queryOne('SELECT id FROM restaurants LIMIT 1');
  const id = uuidv4();
  runSql('INSERT INTO categories (id, name, description, image, restaurant_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)', [id, name, description || '', image || '', restaurant?.id, (maxSort?.m || 0) + 1]);
  res.status(201).json(queryOne('SELECT * FROM categories WHERE id = ?', [id]));
});

router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { name, description, image, is_active, sort_order } = req.body;
  runSql('UPDATE categories SET name = COALESCE(?, name), description = COALESCE(?, description), image = COALESCE(?, image), is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order) WHERE id = ?', [name, description, image, is_active, sort_order, req.params.id]);
  res.json(queryOne('SELECT * FROM categories WHERE id = ?', [req.params.id]));
});

router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  runSql('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
