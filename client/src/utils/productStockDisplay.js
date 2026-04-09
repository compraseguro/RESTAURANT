/**
 * En pedidos solo mostramos stock cuando el producto es inventario vendible:
 * - Debe ser explícitamente `non_transformed`.
 * - Si tiene stock 0 y no tiene almacén asignado, se trata como plato / dato incompleto → no mostrar
 *   (evita "Stock: 0" en platos transformados mal clasificados).
 * - Con almacén y stock 0 sí se muestra (agotado).
 */
export function showStockInOrderingUI(product) {
  if (!product) return false;
  const pt = String(product.process_type ?? '').trim().toLowerCase();
  if (pt !== 'non_transformed') return false;
  const stock = Number(product.stock);
  const warehouseId = String(product.stock_warehouse_id ?? '').trim();
  if (stock <= 0 && !warehouseId) return false;
  return true;
}
