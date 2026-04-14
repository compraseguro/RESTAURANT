const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql } = require('./database');

function recalculateProductStock(productId) {
  const sum = queryOne(
    'SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_warehouse_stocks WHERE product_id = ?',
    [productId]
  );
  const total = Number(sum?.total || 0);
  runSql('UPDATE products SET stock = ?, updated_at = datetime(\'now\') WHERE id = ?', [total, productId]);
  return total;
}

function ensureWarehouseRowsForProduct(product) {
  const currentRows = queryAll('SELECT * FROM inventory_warehouse_stocks WHERE product_id = ?', [product.id]);
  if (currentRows.length > 0) return currentRows;
  const preferred = queryOne('SELECT id, name FROM warehouse_locations WHERE id = ? AND is_active = 1', [product.stock_warehouse_id]);
  const principal = queryOne('SELECT id, name FROM warehouse_locations WHERE LOWER(name) = LOWER(?) AND is_active = 1', ['Almacen Principal']);
  const target = preferred || principal || queryOne('SELECT id, name FROM warehouse_locations WHERE is_active = 1 ORDER BY name LIMIT 1');
  if (!target) return [];
  runSql(
    'INSERT INTO inventory_warehouse_stocks (id, product_id, warehouse_id, quantity, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
    [uuidv4(), product.id, target.id, Number(product.stock || 0)]
  );
  return queryAll('SELECT * FROM inventory_warehouse_stocks WHERE product_id = ?', [product.id]);
}

function addToWarehouses(product, quantityToAdd) {
  const rows = ensureWarehouseRowsForProduct(product);
  if (rows.length === 0) {
    runSql('UPDATE products SET stock = stock + ?, updated_at = datetime(\'now\') WHERE id = ?', [quantityToAdd, product.id]);
    return;
  }
  const preferredId = product.stock_warehouse_id || rows[0].warehouse_id;
  const target = rows.find((r) => r.warehouse_id === preferredId) || rows[0];
  const current = Number(target.quantity || 0);
  runSql(
    'UPDATE inventory_warehouse_stocks SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [current + Number(quantityToAdd || 0), target.id]
  );
  recalculateProductStock(product.id);
}

/** Devuelve stock a almacén al anular un pedido (misma lógica que PUT /orders/:id/status → cancelled). */
function restoreNonTransformedStockForOrder(orderId) {
  const items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  items.forEach((item) => {
    const product = queryOne('SELECT * FROM products WHERE id = ?', [item.product_id]);
    if (!product) return;
    if (product.process_type !== 'non_transformed') return;
    addToWarehouses(product, Number(item.quantity || 0));
  });
}

module.exports = {
  recalculateProductStock,
  ensureWarehouseRowsForProduct,
  addToWarehouses,
  restoreNonTransformedStockForOrder,
};
