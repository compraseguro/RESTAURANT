/**
 * Notas de pedido vinculado a reserva (RESERVA_ID + sello Nubefact-style en Reservas.jsx).
 * Cocina/Bar: solo fecha-hora, texto de la reserva (sin "Pedido solicitado") y nombre del cliente.
 */

export function getKitchenReservationFooterLines(order) {
  const notes = String(order?.notes || '').trim();
  if (!notes || !/RESERVA_ID:/i.test(notes)) return null;

  const lines = [];
  const pipeReserva = notes.match(/\|\s*Reserva:\s*([^|]+?)\s*\|/);
  if (pipeReserva) {
    lines.push(`Reserva: ${pipeReserva[1].trim()}`);
  } else {
    const loose = notes.match(/\bReserva:\s*([^|]+)/);
    if (loose) lines.push(`Reserva: ${loose[1].trim()}`);
  }

  const di = notes.search(/\bDetalle reserva:\s*/i);
  if (di >= 0) {
    let body = notes.slice(di).replace(/^\s*Detalle reserva:\s*/i, '');
    body = body.replace(/\s*Pedido solicitado:\s*[\s\S]*$/i, '').trim();
    if (body) lines.push(body);
  }

  const name = String(order?.customer_name || '').trim();
  if (name) lines.push(name);

  return lines.length ? lines : null;
}

export function getKitchenOrderNotesDisplay(order) {
  const raw = String(order?.notes || '').trim();
  if (!raw) return '';
  const formatted = getKitchenReservationFooterLines(order);
  if (formatted) return formatted.join('\n');
  return raw;
}
