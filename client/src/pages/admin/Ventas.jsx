import { useState, useEffect } from 'react';
import { api, formatCurrency, formatDateTime } from '../../utils/api';
import toast from 'react-hot-toast';
import { MdSearch, MdVisibility, MdEdit, MdSave, MdPrint, MdTableChart, MdCancel, MdDownload } from 'react-icons/md';
import Modal from '../../components/Modal';

const payNames = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', tarjeta: 'Tarjeta', online: 'Online' };
const statusColors = { paid: 'bg-emerald-100 text-emerald-700', pending: 'bg-gold-100 text-gold-700', refunded: 'bg-red-100 text-red-700' };
const docNames = { nota_venta: 'Nota de Venta', boleta: 'Boleta', factura: 'Factura' };

function getOrderDocument(order) {
  const docType = order.sale_document_type || order.document?.doc_type || 'nota_venta';
  const noteNumber = `001-${String(order.order_number || 0).padStart(8, '0')}`;
  const fullNumber = order.sale_document_number || order.document?.full_number || noteNumber;
  return { doc_type: docType, full_number: fullNumber };
}

function orderReceiptHtml(order) {
  const doc = getOrderDocument(order);
  const itemsHtml = (order.items || [])
    .map(i => `<tr><td>${i.quantity}x ${i.product_name}</td><td style="text-align:right">${Number(i.subtotal || 0).toFixed(2)}</td></tr>`)
    .join('');
  return `
    <html>
      <head>
        <title>Venta ${order.order_number}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; padding: 18px; }
          h2 { margin: 0 0 6px 0; }
          .muted { color: #64748b; margin: 0 0 8px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          td { padding: 4px 0; border-bottom: 1px solid #e2e8f0; }
          .total { margin-top: 12px; font-size: 16px; font-weight: 700; text-align: right; }
        </style>
      </head>
      <body>
        <h2>${docNames[doc.doc_type] || doc.doc_type} ${doc.full_number}</h2>
        <p class="muted">Venta #${order.order_number} · ${new Date(`${order.created_at}Z`).toLocaleString('es-PE')}</p>
        <p><strong>Cliente:</strong> ${order.customer_name || 'PUBLICO GENERAL'}</p>
        <p><strong>Pago:</strong> ${payNames[order.payment_method] || order.payment_method}</p>
        <table><tbody>${itemsHtml}</tbody></table>
        <p class="total">Total: S/ ${Number(order.total || 0).toFixed(2)}</p>
      </body>
    </html>
  `;
}

function toExcelHtmlTable(rows) {
  const body = rows.map((r) => {
    const cells = r.map((cell) => {
      const value = String(cell ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<td>${value}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #000; padding: 6px; font-size: 12px; }
          .title { font-weight: 700; background: #d9ead3; }
          .section { font-weight: 700; background: #f3f3f3; }
          .blank td { border: none; height: 10px; }
        </style>
      </head>
      <body>
        <table>${body}</table>
      </body>
    </html>
  `;
}

function formatTemplateDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}Z`);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatTemplateDateTime(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}Z`).toLocaleString('es-PE');
}

function getShiftLabel(dateStr) {
  const d = new Date(`${dateStr}Z`);
  const hour = d.getHours();
  return hour >= 7 && hour < 19 ? 'Turno Dia' : 'Turno Noche';
}

function getSalesChannel(order) {
  if (order.type === 'delivery') return 'Delivery';
  if (order.type === 'pickup') return 'Mostrador';
  return 'Salon';
}

function toTemplateRow(order, localName = '-') {
  const doc = getOrderDocument(order);
  const parts = String(doc.full_number || '').split('-');
  const serie = parts[0] || '001';
  const numero = parts[1] || String(order.order_number || '').padStart(8, '0');
  const isCancelled = order.status === 'cancelled';
  const isPaid = order.payment_status === 'paid';
  const paymentLabel = payNames[order.payment_method] || order.payment_method || '';
  const mesa = order.type === 'dine_in' ? `M${String(order.table_number || '0').padStart(2, '0')}` : '-';
  const requester = order.created_by_user_name || '-';
  return [
    formatTemplateDate(order.created_at),
    formatTemplateDateTime(order.created_at),
    mesa,
    requester,
    localName || '-',
    'Caja 01',
    getShiftLabel(order.created_at),
    order.customer_name || 'PUBLICO GENERAL',
    '00000000',
    `${docNames[doc.doc_type] || doc.doc_type}`,
    serie,
    numero,
    paymentLabel,
    isPaid ? Number(order.total || 0).toFixed(2) : '0.00',
    '0',
    '0',
    Number(order.subtotal || 0).toFixed(2),
    Number(order.tax || 0).toFixed(2),
    '0',
    Number(order.tax || 0).toFixed(2),
    Number(order.total || 0).toFixed(2),
    Number(order.discount || 0).toFixed(2),
    isPaid ? 'Contado' : 'Credito',
    isCancelled ? 'Anulada' : 'Activa',
    '-',
    '-',
    isCancelled ? (order.cancellation_reason || order.notes || '-') : '-',
    getSalesChannel(order),
    order.type === 'delivery' ? 'Delivery' : '-',
    requester,
    '0',
    Number(order.discount || 0) > 0 ? 'Monto' : '',
    Number(order.discount || 0) > 0 ? 'Descuento aplicado' : '',
    '0',
    order.type === 'delivery' ? 'DELIVERY-LOCAL' : '-',
    order.notes || '',
    '-',
  ];
}

function downloadExcel(order) {
  const header = [
    'Fecha', 'Hora', 'Mesa', 'Mesero', 'Local', 'Caja', 'Turno', 'Cliente', 'DNI/RUC', 'Tipo Doc.',
    'Serie Doc.', 'Num Doc.', 'Forma de pago', 'Monto pagado', 'Retencion', 'Propina', 'Subtotal',
    'IGV 18%', 'ICBPER', 'Impuestos', 'Total', 'Descuento', 'Tipo', 'Estado', 'Anulado por',
    'Aprobado por', 'Motivo', 'Canal de venta', 'Canal de delivery', 'Usuario solicitante',
    'Descuento redondeo', 'Tipo de descuento', 'Motivo descuento', 'Porcentaje de descuento',
    'Codigo integracion delivery', 'Observacion', 'Codigo vendedor',
  ];
  const items = order.items || [];
  const rows = [
    header,
    toTemplateRow(order, order.local_name || '-'),
    [''],
    ['SECCION DETALLE PRODUCTOS', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Cantidad', 'Producto', 'Variante', 'Precio Unitario', 'Subtotal', 'Notas Item', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ...items.map(i => [
      String(i.quantity || 0),
      i.product_name || '',
      i.variant_name || '',
      Number(i.unit_price || 0).toFixed(2),
      Number(i.subtotal || 0).toFixed(2),
      i.notes || '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    ]),
  ];
  const html = toExcelHtmlTable(rows);
  const bom = '\uFEFF';
  const blob = new Blob([bom + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `venta-${order.order_number}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadAllSalesExcel(orders) {
  const header = [
    'Fecha', 'Hora', 'Mesa', 'Mesero', 'Local', 'Caja', 'Turno', 'Cliente', 'DNI/RUC', 'Tipo Doc.',
    'Serie Doc.', 'Num Doc.', 'Forma de pago', 'Monto pagado', 'Retencion', 'Propina', 'Subtotal',
    'IGV 18%', 'ICBPER', 'Impuestos', 'Total', 'Descuento', 'Tipo', 'Estado', 'Anulado por',
    'Aprobado por', 'Motivo', 'Canal de venta', 'Canal de delivery', 'Usuario solicitante',
    'Descuento redondeo', 'Tipo de descuento', 'Motivo descuento', 'Porcentaje de descuento',
    'Codigo integracion delivery', 'Observacion', 'Codigo vendedor',
  ];
  const rows = [header, ...orders.map((o) => toTemplateRow(o, o.local_name || '-'))];
  const html = toExcelHtmlTable(rows);
  const bom = '\uFEFF';
  const blob = new Blob([bom + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `ventas-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Ventas() {
  const [orders, setOrders] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [waiterFilter, setWaiterFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  /** activas | anuladas | todas */
  const [saleTab, setSaleTab] = useState('activas');
  const [voidModalOrder, setVoidModalOrder] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState('efectivo');
  const [editDocType, setEditDocType] = useState('nota_venta');
  const [savingEdit, setSavingEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState('-');

  const load = async () => {
    try {
      const [ordersData, docsData] = await Promise.all([
        api.get('/orders'),
        api.get('/billing/documents?limit=200'),
      ]);
      const restaurant = await api.get('/restaurant');
      const docsByOrder = new Map((docsData || []).map(d => [d.order_id, d]));
      const local = restaurant?.name || '-';
      setRestaurantName(local);
      const merged = (ordersData || []).map(o => ({ ...o, document: docsByOrder.get(o.id) || null, local_name: local }));
      setOrders(merged);
      setFiltered(merged);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let f = orders;
    if (search) f = f.filter(o => String(o.order_number).includes(search) || (o.customer_name || '').toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') f = f.filter(o => o.payment_status === statusFilter);
    if (typeFilter !== 'all') f = f.filter(o => o.type === typeFilter);
    if (waiterFilter !== 'all') {
      f = f.filter(o => (o.created_by_user_name || o.customer_name || '-').toLowerCase() === waiterFilter.toLowerCase());
    }
    if (fromDate) {
      const from = new Date(`${fromDate}T00:00:00`);
      f = f.filter(o => new Date(`${o.created_at}Z`) >= from);
    }
    if (toDate) {
      const to = new Date(`${toDate}T23:59:59`);
      f = f.filter(o => new Date(`${o.created_at}Z`) <= to);
    }
    if (saleTab === 'activas') f = f.filter((o) => o.status !== 'cancelled');
    else if (saleTab === 'anuladas') f = f.filter((o) => o.status === 'cancelled');
    setFiltered(f);
  }, [search, statusFilter, typeFilter, waiterFilter, fromDate, toDate, saleTab, orders]);

  const waiterOptions = Array.from(
    new Set(orders.map(o => (o.created_by_user_name || o.customer_name || '-')).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const totals = {
    total: filtered.reduce((s, o) => s + (o.total || 0), 0),
    paid: filtered.filter(o => o.payment_status === 'paid').reduce((s, o) => s + (o.total || 0), 0),
    pending: filtered.filter(o => o.payment_status === 'pending').reduce((s, o) => s + (o.total || 0), 0),
    count: filtered.length,
  };

  const startEdit = (order) => {
    const doc = getOrderDocument(order);
    setEditing(order);
    setEditPaymentMethod(order.payment_method || 'efectivo');
    setEditDocType(doc.doc_type || 'nota_venta');
    setSelected(order);
  };

  const saveChanges = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      await api.put(`/orders/${editing.id}/payment`, { payment_method: editPaymentMethod });
      await api.put(`/billing/order/${editing.id}/document`, { doc_type: editDocType });
      toast.success('Registro actualizado');
      setEditing(null);
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const openReceipt = (order) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      toast.error('No se pudo preparar la impresion');
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(orderReceiptHtml(order));
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 700);
    }, 200);
  };

  const openVoidModal = (order) => {
    if (order.status === 'cancelled') return;
    setVoidModalOrder(order);
    setVoidReason('');
  };

  const confirmAnularVenta = async () => {
    const order = voidModalOrder;
    if (!order || order.status === 'cancelled') return;
    const reason = voidReason.trim();
    if (reason.length < 3) {
      toast.error('Escriba el motivo de anulación (mínimo 3 caracteres).');
      return;
    }
    setVoidSubmitting(true);
    try {
      await api.put(`/orders/${order.id}/status`, { status: 'cancelled', cancellation_reason: reason });
      await api.put(`/orders/${order.id}/payment`, { payment_status: 'refunded' });
      toast.success('Venta anulada');
      setVoidModalOrder(null);
      setVoidReason('');
      if (selected?.id === order.id) setSelected(null);
      setSaleTab('anuladas');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setVoidSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-3">Ventas</h1>

      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { id: 'activas', label: 'Ventas activas' },
          { id: 'anuladas', label: 'Ventas anuladas' },
          { id: 'todas', label: 'Todas' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSaleTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              saleTab === t.id
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <div className="card"><p className="text-xs text-slate-500">Total Ventas</p><p className="text-xl font-bold text-slate-800">{formatCurrency(totals.total)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Cobrado</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(totals.paid)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Pendiente</p><p className="text-xl font-bold text-gold-600">{formatCurrency(totals.pending)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Transacciones</p><p className="text-xl font-bold text-slate-800">{totals.count}</p></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por # o cliente..." className="input-field pl-9" />
          </div>
          <button
            onClick={() => downloadAllSalesExcel(filtered.map(o => ({ ...o, local_name: restaurantName })))}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
            title="Descargar todas las ventas en Excel"
          >
            <MdDownload /> Descargar todas
          </button>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-auto">
            <option value="all">Todos los pagos</option><option value="paid">Pagado</option><option value="pending">Pendiente</option><option value="refunded">Reembolsado</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-field w-auto">
            <option value="all">Todos los tipos</option><option value="dine_in">Mesa</option><option value="delivery">Delivery</option><option value="pickup">Para llevar</option>
          </select>
          <select value={waiterFilter} onChange={e => setWaiterFilter(e.target.value)} className="input-field w-auto">
            <option value="all">Todos los meseros</option>
            {waiterOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="input-field w-auto"
            title="Desde"
          />
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="input-field w-auto"
            title="Hasta"
          />
          <button
            onClick={() => { setFromDate(''); setToDate(''); }}
            className="px-3 py-2 rounded-lg border text-sm hover:bg-slate-50"
          >
            Limpiar fechas
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b">
              <th className="pb-2 font-medium">Fecha</th><th className="pb-2 font-medium">Mesa</th><th className="pb-2 font-medium">Caja</th><th className="pb-2 font-medium">Mesero</th><th className="pb-2 font-medium">Cliente</th><th className="pb-2 font-medium">Documento</th><th className="pb-2 font-medium">Pagos</th><th className="pb-2 font-medium">Venta</th><th className="pb-2 font-medium">Estado</th><th className="pb-2 font-medium">Opciones</th>
            </tr></thead>
            <tbody>
              {filtered.map(o => {
                const doc = getOrderDocument(o);
                const mesa = o.type === 'dine_in' ? `M${String(o.table_number || '0').padStart(2, '0')}` : '-';
                const activeSale = o.status !== 'cancelled';
                const mesero = o.created_by_user_name || o.customer_name || '-';
                return (
                  <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5">
                      <p className="font-medium">{new Date(`${o.created_at}Z`).toLocaleDateString('es-PE')}</p>
                      <p className="text-xs text-slate-500">{new Date(`${o.created_at}Z`).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td className="py-2.5">{mesa}</td>
                    <td className="py-2.5 text-slate-600">Caja 01</td>
                    <td className="py-2.5">{mesero}</td>
                    <td className="py-2.5">{o.customer_name || 'PUBLICO GENERAL'}</td>
                    <td className="py-2.5">
                      <p className="font-medium">{docNames[doc.doc_type] || doc.doc_type}</p>
                      <p className="text-xs text-slate-500">{doc.full_number}</p>
                    </td>
                    <td className="py-2.5 font-medium">{payNames[o.payment_method] || o.payment_method} (S/): {Number(o.total || 0).toFixed(2)}</td>
                    <td className="py-2.5 font-bold">{formatCurrency(o.total)}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activeSale ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {activeSale ? 'ACTIVA' : 'ANULADA'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1 relative">
                        <button onClick={() => setSelected(o)} className="px-2 py-1 rounded bg-slate-600 text-white text-xs hover:bg-slate-700" title="Ver"><MdVisibility /></button>
                        <button onClick={() => openReceipt(o)} className="px-2 py-1 rounded bg-cyan-600 text-white text-xs hover:bg-cyan-700" title="Imprimir"><MdPrint /></button>
                        <button onClick={() => downloadExcel({ ...o, local_name: restaurantName })} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700" title="Excel"><MdTableChart /></button>
                        <button onClick={() => startEdit(o)} className="px-2 py-1 rounded bg-amber-500 text-white text-xs hover:bg-amber-600" title="Editar"><MdEdit /></button>
                        <button
                          onClick={() => openVoidModal(o)}
                          disabled={o.status === 'cancelled'}
                          className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50"
                          title="Anular venta"
                        >
                          <MdCancel />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan="10" className="py-8 text-center text-slate-400">Sin ventas encontradas</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={!!selected} onClose={() => { setSelected(null); setEditing(null); }} title={`Venta #${selected?.order_number}`} size="md">
        {selected && (
          <div className="space-y-4">
            {editing?.id === selected.id && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Editar registro</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Metodo de pago</label>
                    <select className="input-field text-sm" value={editPaymentMethod} onChange={e => setEditPaymentMethod(e.target.value)}>
                      {Object.entries(payNames).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Comprobante</label>
                    <select className="input-field text-sm" value={editDocType} onChange={e => setEditDocType(e.target.value)}>
                      <option value="nota_venta">Nota de Venta</option>
                      <option value="boleta">Boleta</option>
                      <option value="factura">Factura</option>
                    </select>
                  </div>
                </div>
                <button onClick={saveChanges} disabled={savingEdit} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
                  <MdSave /> {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            )}

            {selected.status === 'cancelled' && (selected.cancellation_reason || selected.notes) ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <span className="font-semibold">Motivo de anulación: </span>
                {selected.cancellation_reason || selected.notes}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-slate-500">Fecha</p><p className="font-medium">{formatDateTime(selected.created_at)}</p></div>
              <div><p className="text-slate-500">Tipo</p><p className="font-medium">{selected.type === 'dine_in' ? `Mesa ${selected.table_number}` : selected.type}</p></div>
              <div><p className="text-slate-500">Metodo de Pago</p><p className="font-medium">{payNames[selected.payment_method] || selected.payment_method}</p></div>
              <div><p className="text-slate-500">Estado</p><p className="font-medium">{selected.payment_status === 'paid' ? 'Pagado' : selected.payment_status === 'pending' ? 'Pendiente' : 'Reembolsado'}</p></div>
              <div className="col-span-2">
                <p className="text-slate-500">Comprobante</p>
                <p className="font-medium">{(() => { const doc = getOrderDocument(selected); return `${docNames[doc.doc_type] || doc.doc_type} - ${doc.full_number}`; })()}</p>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="font-medium mb-2">Detalle:</p>
              {(selected.items || []).map((it, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-slate-50">
                  <span>{it.quantity}x {it.product_name}</span>
                  <span className="font-medium">{formatCurrency(it.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 flex justify-between font-bold text-lg">
              <span>Total</span><span>{formatCurrency(selected.total)}</span>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!voidModalOrder}
        onClose={() => { if (!voidSubmitting) { setVoidModalOrder(null); setVoidReason(''); } }}
        title={voidModalOrder ? `Anular venta #${voidModalOrder.order_number}` : 'Anular venta'}
        variant="light"
      >
        {voidModalOrder && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Esta acción marcará la venta como anulada y el pago como reembolsado. Indique el motivo (obligatorio).
            </p>
            <div>
              <label htmlFor="void-reason" className="block text-xs font-medium text-slate-600 mb-1">Motivo de anulación</label>
              <textarea
                id="void-reason"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={4}
                className="input-field w-full text-sm resize-y min-h-[100px]"
                placeholder="Ej.: Error en cobro, devolución del cliente, duplicado…"
                disabled={voidSubmitting}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
                disabled={voidSubmitting}
                onClick={() => { setVoidModalOrder(null); setVoidReason(''); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                disabled={voidSubmitting}
                onClick={() => { confirmAnularVenta(); }}
              >
                {voidSubmitting ? 'Anulando…' : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
