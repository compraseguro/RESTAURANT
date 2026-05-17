const SECTION_HINTS = {
  regional: (i) => i?.synced && 'Formato sincronizado con tickets, caja y reportes',
  locales: (i) => {
    if (!i) return null;
    const st = i.open_status?.reason;
    return `${i.count} local(es) · ${i.active} activo(s)${st ? ` · ${st}` : ''}`;
  },
  users: (i) => i?.sessions_open != null && `${i.total} usuarios · ${i.sessions_open} en turno`,
  almacenes: (i) => i && `${i.warehouses} almacén(es) · ${i.low_stock} alerta(s) stock`,
  salones: (i) => i?.active_orders != null && `${i.active_orders} pedido(s) en salón`,
  cajas: (i) => i && `${i.stations} cajas · ${i.register_open ? 'Caja abierta' : 'Caja cerrada'} · ${i.closed_today} cierre(s) hoy`,
  comprobantes: (i) => i && `${i.series} series · ${i.billing_errors} error(es) SUNAT`,
  impresoras: (i) => i && `${i.routes} ruta(s) de impresión activa(s)`,
  impuestos: (i) => i && `IGV / impuesto: ${i.rate}%`,
  tarjetas: (i) => i && `${i.count} tipo(s) de tarjeta`,
  monedas: (i) => i && `${i.active} moneda(s) activa(s)`,
  moneda_facturacion: (i) => i && `Facturación: ${i.symbol} (${i.code})`,
  cuentas_transferencia: (i) => i && `${i.count} cuenta(s) de transferencia`,
  marcas: (i) => i && `${i.count} marca(s) registrada(s)`,
  categoria_anular: (i) => i && `${i.motives} motivo(s) de anulación`,
  formas_pago: (i) => i && `${i.active} forma(s) de pago activa(s)`,
  modulo_empresarial: (i) => i && (i.configured ? 'Parámetros empresariales configurados' : 'Complete identidad y parámetros globales'),
};

export default function SettingsSectionInsights({ sectionId, hub }) {
  const insights = hub?.section_insights?.[sectionId];
  const fn = SECTION_HINTS[sectionId];
  const text = fn ? fn(insights) : null;
  if (!text) return null;

  return (
    <p className="text-xs text-[var(--ui-muted)] mb-4 px-1 border-l-2 border-gold-500/50 pl-2">
      Operación en vivo: {text}
    </p>
  );
}
