const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql } = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

function ensureWarehouseInfrastructure() {
  runSql(`
    CREATE TABLE IF NOT EXISTS warehouse_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  runSql(`
    CREATE TABLE IF NOT EXISTS inventory_warehouse_stocks (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(product_id, warehouse_id)
    )
  `);
}

function ensureDefaultWarehouses() {
  ensureWarehouseInfrastructure();
  const total = queryOne('SELECT COUNT(*) as c FROM warehouse_locations WHERE is_active = 1');
  if (Number(total?.c || 0) > 0) return;
  runSql(
    'INSERT INTO warehouse_locations (id, name, description, is_active) VALUES (?, ?, ?, 1)',
    [uuidv4(), 'Almacen Principal', 'Almacén principal para productos no transformados']
  );
  runSql(
    'INSERT INTO warehouse_locations (id, name, description, is_active) VALUES (?, ?, ?, 1)',
    [uuidv4(), 'Almacen Cocina', 'Almacén de cocina para insumos y procesos']
  );
}

function resolveWarehouseId(preferredWarehouseId) {
  ensureDefaultWarehouses();
  if (preferredWarehouseId) {
    const preferred = queryOne(
      'SELECT id FROM warehouse_locations WHERE id = ? AND is_active = 1',
      [preferredWarehouseId]
    );
    if (preferred?.id) return preferred.id;
  }
  const principal = queryOne(
    'SELECT id FROM warehouse_locations WHERE LOWER(name) = LOWER(?) AND is_active = 1',
    ['Almacen Principal']
  );
  if (principal?.id) return principal.id;
  const fallback = queryOne('SELECT id FROM warehouse_locations WHERE is_active = 1 ORDER BY name LIMIT 1');
  return fallback?.id || '';
}

function upsertWarehouseStock(productId, warehouseId, quantity) {
  if (!warehouseId) return false;
  ensureWarehouseInfrastructure();
  const existing = queryOne(
    'SELECT id FROM inventory_warehouse_stocks WHERE product_id = ? AND warehouse_id = ?',
    [productId, warehouseId]
  );
  if (existing) {
    runSql(
      'UPDATE inventory_warehouse_stocks SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [Math.max(0, Number(quantity || 0)), existing.id]
    );
    return true;
  }
  runSql(
    'INSERT INTO inventory_warehouse_stocks (id, product_id, warehouse_id, quantity, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
    [uuidv4(), productId, warehouseId, Math.max(0, Number(quantity || 0))]
  );
  return true;
}

/** Respuesta API: filas antiguas pueden tener process_type NULL → tratarlas como transformado en el cliente. */
function normalizeProductForClient(p) {
  if (!p || typeof p !== 'object') return p;
  const pt = String(p.process_type ?? '').trim();
  if (!pt) p.process_type = 'transformed';
  return p;
}

router.get('/', (req, res) => {
  const { category_id, active_only, search } = req.query;
  let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE 1=1';
  const params = [];

  if (category_id) { query += ' AND p.category_id = ?'; params.push(category_id); }
  if (active_only === 'true') {
    query += ' AND p.is_active = 1';
    // Productos sin categoría quedan solo para gestión de almacén.
    query += " AND COALESCE(TRIM(p.category_id), '') <> ''";
  }
  if (search) { query += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY c.sort_order, p.name';

  const products = queryAll(query, params);
  const variants = queryAll('SELECT * FROM product_variants WHERE is_active = 1');
  const variantMap = {};
  variants.forEach(v => { if (!variantMap[v.product_id]) variantMap[v.product_id] = []; variantMap[v.product_id].push(v); });
  products.forEach((p) => {
    normalizeProductForClient(p);
    p.variants = variantMap[p.id] || [];
  });
  res.json(products);
});

router.get('/:id', (req, res) => {
  const product = queryOne('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  normalizeProductForClient(product);
  product.variants = queryAll('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1', [req.params.id]);
  res.json(product);
});

router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  const {
    name,
    description,
    price,
    image,
    category_id,
    stock,
    variants,
    process_type,
    stock_warehouse_id,
    production_area,
    tax_type,
    modifier_id,
    note_required,
  } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Nombre y precio son requeridos' });

  const restaurant = queryOne('SELECT id FROM restaurants LIMIT 1');
  const id = uuidv4();
  const safeProcessType = process_type === 'non_transformed' ? 'non_transformed' : 'transformed';
  const safeStock = safeProcessType === 'transformed' ? 0 : Math.max(0, Number(stock || 0));
  const safeWarehouseId = safeProcessType === 'transformed' ? '' : resolveWarehouseId(stock_warehouse_id);
  const safeProductionArea = production_area === 'bar' ? 'bar' : 'cocina';
  const safeTaxType = ['igv', 'exonerado', 'inafecto'].includes(String(tax_type || '').toLowerCase())
    ? String(tax_type).toLowerCase()
    : 'igv';
  const safeModifierId = String(modifier_id || '').trim();
  const safeNoteRequired = Number(note_required) === 1 ? 1 : 0;
  runSql(
    `INSERT INTO products (
      id, name, description, price, image, category_id, restaurant_id, stock,
      process_type, stock_warehouse_id, production_area, tax_type, modifier_id, note_required
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      description || '',
      price,
      image || '',
      category_id || null,
      restaurant?.id,
      safeStock,
      safeProcessType,
      safeWarehouseId,
      safeProductionArea,
      safeTaxType,
      safeModifierId,
      safeNoteRequired,
    ]
  );
  if (safeProcessType === 'non_transformed') {
    upsertWarehouseStock(id, safeWarehouseId, safeStock);
  }

  if (variants && variants.length > 0) {
    variants.forEach(v => runSql('INSERT INTO product_variants (id, product_id, name, price_modifier) VALUES (?, ?, ?, ?)', [uuidv4(), id, v.name, v.price_modifier || 0]));
  }

  const product = queryOne('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', [id]);
  product.variants = queryAll('SELECT * FROM product_variants WHERE product_id = ?', [id]);
  res.status(201).json(product);
});

router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const {
    name,
    description,
    price,
    image,
    category_id,
    stock,
    is_active,
    variants,
    process_type,
    stock_warehouse_id,
    production_area,
    tax_type,
    modifier_id,
    note_required,
  } = req.body;
  const current = queryOne('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!current) return res.status(404).json({ error: 'Producto no encontrado' });
  const safeProcessType = process_type === 'non_transformed' ? 'non_transformed' : (process_type === 'transformed' ? 'transformed' : null);
  const finalProcessType = safeProcessType || current.process_type || 'transformed';
  const forceZeroStock = finalProcessType === 'transformed';
  const nextStock = forceZeroStock ? 0 : stock;
  const nextWarehouseId = forceZeroStock ? '' : resolveWarehouseId(stock_warehouse_id || current.stock_warehouse_id || '');
  const safeProductionArea = production_area === undefined
    ? null
    : (production_area === 'bar' ? 'bar' : 'cocina');
  const safeTaxType = tax_type === undefined
    ? null
    : (['igv', 'exonerado', 'inafecto'].includes(String(tax_type || '').toLowerCase())
      ? String(tax_type).toLowerCase()
      : 'igv');
  const safeModifierId = modifier_id === undefined ? null : String(modifier_id || '').trim();
  const safeNoteRequired = note_required === undefined ? null : (Number(note_required) === 1 ? 1 : 0);
  const safeName = name === undefined ? null : name;
  const safeDescription = description === undefined ? null : description;
  const safePrice = price === undefined ? null : price;
  const safeImage = image === undefined ? null : image;
  const safeCategoryId = category_id === undefined ? null : category_id;
  const safeIsActive = is_active === undefined ? null : is_active;
  runSql(
    `UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price = COALESCE(?, price),
      image = COALESCE(?, image),
      category_id = COALESCE(?, category_id),
      stock = COALESCE(?, stock),
      is_active = COALESCE(?, is_active),
      process_type = COALESCE(?, process_type),
      stock_warehouse_id = COALESCE(?, stock_warehouse_id),
      production_area = COALESCE(?, production_area),
      tax_type = COALESCE(?, tax_type),
      modifier_id = COALESCE(?, modifier_id),
      note_required = COALESCE(?, note_required),
      updated_at = datetime('now')
    WHERE id = ?`,
    [
      safeName,
      safeDescription,
      safePrice,
      safeImage,
      safeCategoryId,
      nextStock,
      safeIsActive,
      safeProcessType,
      nextWarehouseId,
      safeProductionArea,
      safeTaxType,
      safeModifierId,
      safeNoteRequired,
      req.params.id,
    ]
  );

  if (forceZeroStock) {
    runSql('DELETE FROM inventory_warehouse_stocks WHERE product_id = ?', [req.params.id]);
  } else if (finalProcessType === 'non_transformed') {
    upsertWarehouseStock(req.params.id, nextWarehouseId || '', Math.max(0, Number(nextStock || 0)));
  }

  if (variants !== undefined) {
    runSql('DELETE FROM product_variants WHERE product_id = ?', [req.params.id]);
    variants.forEach(v => runSql('INSERT INTO product_variants (id, product_id, name, price_modifier) VALUES (?, ?, ?, ?)', [uuidv4(), req.params.id, v.name, v.price_modifier || 0]));
  }

  const product = queryOne('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', [req.params.id]);
  product.variants = queryAll('SELECT * FROM product_variants WHERE product_id = ?', [req.params.id]);
  res.json(product);
});

router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  runSql('DELETE FROM inventory_warehouse_stocks WHERE product_id = ?', [req.params.id]);
  runSql('DELETE FROM inventory_logs WHERE product_id = ?', [req.params.id]);
  runSql('DELETE FROM product_variants WHERE product_id = ?', [req.params.id]);
  runSql('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
