/**
 * Mensajes amigables para el panel de pago (sin detalles técnicos en UI).
 */
function mapCentralSyncError(result) {
  if (!result) return '';
  if (result.skipped) {
    return 'La conexión con el panel central no está configurada en este servidor.';
  }
  const raw = String(
    result.error
    || result.data?.error
    || result.last_central_sync_error
    || '',
  ).toLowerCase();

  if (!raw && result.ok) return '';

  if (
    raw.includes('fetch')
    || raw.includes('econnrefused')
    || raw.includes('enotfound')
    || raw.includes('network')
    || raw.includes('timeout')
  ) {
    return 'No se pudo conectar con el servidor central. Verifique su conexión e intente de nuevo.';
  }
  if (result.status === 503 || raw.includes('ocupado') || result.status >= 500) {
    return 'Servidor central temporalmente ocupado. Intente reenviar el comprobante en unos minutos.';
  }
  if (result.status === 401 || result.status === 403) {
    return 'No se pudo validar la conexión con el panel. Contacte a soporte Resto Fadey.';
  }
  if (result.skipped || raw.includes('faltan variables')) {
    return 'Sincronización con el panel no disponible en este entorno.';
  }
  return 'No se pudo enviar el comprobante. Use «Reintentar envío» o intente más tarde.';
}

module.exports = { mapCentralSyncError };
