/** Líneas de producto a partir de pedidos de mesa (u órdenes con items). */

export function flattenOrdersToLines(orders) {
  const rows = [];
  for (const order of orders || []) {
    const st = order.status;
    const on = order.order_number;
    for (const it of order.items || []) {
      const qty = Number(it.quantity || 0);
      const unit = Number(it.unit_price ?? 0);
      const sub = Number(it.subtotal != null ? it.subtotal : unit * qty);
      rows.push({
        key: it.id,
        orderNumber: on,
        name: String(it.product_name || '—').trim() || '—',
        quantity: qty,
        subtotal: sub,
        status: st,
      });
    }
  }
  return rows;
}

export function mergeLinesByProductName(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = r.name.toLowerCase();
    if (!m.has(k)) {
      m.set(k, {
        key: `agg-${k}`,
        orderNumber: null,
        name: r.name,
        quantity: 0,
        subtotal: 0,
        statuses: new Set(),
      });
    }
    const a = m.get(k);
    a.quantity += r.quantity;
    a.subtotal += r.subtotal;
    a.statuses.add(String(r.status || '').toLowerCase());
  }
  return [...m.values()].map((row) => {
    const { statuses, ...rest } = row;
    const list = [...statuses].filter(Boolean);
    let status = list[0] || '';
    if (list.length > 1) status = '__mixed__';
    return { ...rest, status };
  });
}

/** Agrupa ítems de pedido por nombre (cobrar mesa, precuenta): cantidad, subtotal y precio unitario medio. */
export function groupItemsByProductNameForBill(items) {
  const m = new Map();
  for (const it of items || []) {
    const name = String(it.product_name || '—').trim() || '—';
    const k = name.toLowerCase();
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unit_price ?? 0);
    const sub = Number(it.subtotal != null ? it.subtotal : unit * qty);
    if (!m.has(k)) {
      m.set(k, { key: `bill-${k}`, name, qty: 0, subtotal: 0 });
    }
    const a = m.get(k);
    a.qty += qty;
    a.subtotal += sub;
  }
  return [...m.values()].map((r) => ({
    key: r.key,
    name: r.name,
    qty: r.qty,
    subtotal: r.subtotal,
    unitPrice: r.qty > 0 ? r.subtotal / r.qty : 0,
  }));
}

export function getStaffOrderStatusUi(status) {
  const value = String(status || '').toLowerCase();
  if (value === '__mixed__') return { label: 'Varios', classes: 'bg-slate-600/35 text-[#F9FAFB] border border-slate-400/35' };
  if (value === 'pending') return { label: 'Pendiente', classes: 'bg-[#3B82F6]/20 text-[#F9FAFB] border border-[#3B82F6]/40' };
  if (value === 'preparing') return { label: 'Preparando', classes: 'bg-[#2563EB]/20 text-[#F9FAFB] border border-[#2563EB]/40' };
  if (value === 'ready') return { label: 'Listo', classes: 'bg-emerald-500/20 text-emerald-100 border border-emerald-300/40' };
  if (value === 'delivered') return { label: 'Entregado', classes: 'bg-[#1F2937] text-[#F9FAFB] border border-[#3B82F6]/30' };
  if (value === 'cancelled') return { label: 'Cancelado', classes: 'bg-[#1E40AF]/25 text-[#F9FAFB] border border-[#3B82F6]/40' };
  return { label: value || 'Sin estado', classes: 'bg-[#1F2937] text-[#F9FAFB] border border-[#3B82F6]/30' };
}
