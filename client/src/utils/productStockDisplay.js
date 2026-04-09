/**
 * Stock en productos "transformados" (platos elaborados) no es inventario vendible;
 * mostrar "Stock: 0" en pedidos confunde a cliente y mozo.
 */
export function showStockInOrderingUI(product) {
  if (!product) return false;
  return String(product.process_type || 'transformed') === 'non_transformed';
}
