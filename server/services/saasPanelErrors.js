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
  if (result.status === 401 || result.status === 403 || raw.includes('token') || raw.includes('inválido')) {
    return 'La clave API_SECRET_KEY no coincide entre el POS (Render) y el panel central. Deben ser idénticas.';
  }
  if (result.status === 404 || raw.includes('404') || raw.includes('not found')) {
    return 'El panel no tiene el servicio de pagos en esa URL. Revise CENTRAL_API_URL (debe ser el API, p. ej. https://restofadey.pe con POST /api/payments activo).';
  }
  if (result.skipped || raw.includes('faltan variables')) {
    return 'Sincronización con el panel no disponible en este entorno.';
  }
  if (raw.includes('next_public_api') || raw.includes('url pública')) {
    return 'Configure NEXT_PUBLIC_API_URL en Render con la URL pública de este POS (sin / al final).';
  }
  if (raw.includes('amount debe') || raw.includes('amount') && raw.includes('mayor')) {
    return 'Indique el monto pagado (S/) mayor a cero en «Pago por uso del sistema» y vuelva a enviar el comprobante.';
  }
  if (raw.includes('26 values for 25 columns') || raw.includes('values for') && raw.includes('columns')) {
    return 'Error en el servidor del panel al guardar el pago (columnas SQL incorrectas). Redespliegue la plataforma central o corrija la API de pagos en Vercel/Supabase.';
  }
  if (raw) {
    return `No se pudo enviar el comprobante (${String(result.error || result.last_central_sync_error).slice(0, 120)}). Revise variables en Render o contacte soporte.`;
  }
  return 'No se pudo enviar el comprobante. Use «Reintentar envío» o intente más tarde.';
}

module.exports = { mapCentralSyncError };
