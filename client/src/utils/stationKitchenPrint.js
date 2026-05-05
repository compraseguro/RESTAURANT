/**
 * La impresión automática al crear/actualizar pedidos la ejecuta el servidor
 * (`server/printing/orderPrintHooks.js`). Este módulo se mantiene por compatibilidad
 * con imports existentes; ya no dispara impresión desde el navegador.
 */
export async function silentPrintOrderToStations() {
  /* no-op: evita doble impresión con el Print Bridge del servidor */
}
