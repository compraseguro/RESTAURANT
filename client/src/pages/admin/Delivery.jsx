import { useState, useEffect } from 'react';
import {
  api,
  formatCurrency,
  formatDate,
  formatDateTime,
  DELIVERY_PAYMENT_MODALITY_OPTIONS,
  labelDeliveryPaymentModality,
  PAYMENT_METHODS,
} from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { showStockInOrderingUI } from '../../utils/productStockDisplay';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import Modal from '../../components/Modal';
import {
  MdDeliveryDining, MdLocationOn, MdCheck, MdTimer, MdAdd,
  MdRemove, MdDelete, MdReceipt, MdSearch, MdShoppingCart,
  MdPerson, MdPhone, MdHome, MdEditNote, MdPrint,
} from 'react-icons/md';
import toast from 'react-hot-toast';

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function Delivery() {
  const { user } = useAuth();
  const isMozo = String(user?.role || '') === 'mozo';
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('active');
  const [loading, setLoading] = useState(true);
  const [printMeta, setPrintMeta] = useState({ name: 'Resto-FADEY', address: '', phone: '' });
  /** Preparación/listo solo en cocina/bar; aquí solo cierre operativo por personal autorizado. */
  const canMarkDeliveredFromAdmin = ['admin', 'cajero', 'mozo'].includes(String(user?.role || ''));

  const [showNewOrder, setShowNewOrder] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [noteEditorProductId, setNoteEditorProductId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPaymentModality, setDeliveryPaymentModality] = useState('contra_entrega');

  const load = () => {
    api.get('/orders').then(data => {
      setOrders(data.filter(o => o.type === 'delivery'));
    }).catch(console.error).finally(() => setLoading(false));
  };

  const loadProducts = () => {
    Promise.all([
      api.get('/products?active_only=true'),
      api.get('/categories/active'),
    ]).then(([prods, cats]) => {
      setProducts(prods);
      setCategories(cats);
    }).catch(console.error);
  };

  useEffect(() => {
    loadProducts();
    if (isMozo) {
      setLoading(false);
      return;
    }
    load();
    api.get('/orders/print-config')
      .then((d) => {
        setPrintMeta({
          name: d?.restaurant?.name || 'Resto-FADEY',
          address: d?.restaurant?.address || '',
          phone: d?.restaurant?.phone || '',
        });
      })
      .catch(() => {});
  }, [isMozo]);
  useActiveInterval(load, isMozo ? 0 : 10000);
  useSocket('order-update', isMozo ? () => {} : load);

  const activeOrders = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));
  const completedOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));
  const todayKey = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const todayDeliveries = orders.filter(
    o => o.status === 'delivered' && formatDate(o.updated_at || o.created_at) === todayKey
  );

  const displayed =
    tab === 'active'
      ? activeOrders
      : tab === 'today'
        ? todayDeliveries
        : completedOrders;

  const statusColors = { pending: 'bg-gold-100 text-gold-700', preparing: 'bg-sky-100 text-sky-700', ready: 'bg-sky-100 text-sky-700', delivered: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700' };
  const statusNames = { pending: 'Pendiente', preparing: 'Preparando', ready: 'Listo para enviar', delivered: 'Entregado', cancelled: 'Cancelado' };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/orders/${id}/status`, { status });
      toast.success('Estado actualizado');
      load();
    } catch (err) { toast.error(err.message); }
  };

  const printDeliveryOrder = (o) => {
    const modalityLabel = labelDeliveryPaymentModality(o.delivery_payment_modality) || '—';
    const payLabel = PAYMENT_METHODS[o.payment_method] || o.payment_method || '—';
    const subtotal = Number(o.subtotal || 0);
    const discount = Number(o.discount || 0);
    const fee = Number(o.delivery_fee || 0);
    const total = Number(o.total || 0);
    const itemsRows = (o.items || [])
      .map(
        (it) => `
        <tr>
          <td style="padding:4px 0;border-bottom:1px solid #e2e8f0;">${it.quantity}× ${escHtml(it.product_name)}${it.variant_name ? ` <span style="color:#64748b">(${escHtml(it.variant_name)})</span>` : ''}${it.notes ? `<br/><span style="font-size:11px;color:#64748b;font-style:italic">${escHtml(it.notes)}</span>` : ''}</td>
          <td style="padding:4px 0;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;">${formatCurrency(it.subtotal)}</td>
        </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Pedido delivery #${o.order_number}</title>
      <style>
        body { font-family: system-ui, Segoe UI, sans-serif; color: #0f172a; max-width: 520px; margin: 16px auto; padding: 0 12px; font-size: 14px; }
        h1 { font-size: 18px; margin: 0 0 4px 0; }
        .muted { color: #64748b; font-size: 12px; margin: 0 0 16px 0; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; padding-bottom: 6px; }
        .tot { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
        .tot strong { font-size: 15px; }
        hr { border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0; }
      </style></head><body>
        <h1>${escHtml(printMeta.name)}</h1>
        <p class="muted">Pedido delivery · #${o.order_number} · ${formatDateTime(o.created_at)}</p>
        <p><strong>Estado:</strong> ${escHtml(statusNames[o.status] || o.status)}</p>
        <hr/>
        <p><strong>Cliente:</strong> ${escHtml(o.customer_name || '—')}</p>
        <p><strong>Dirección:</strong> ${escHtml(o.delivery_address || '—')}</p>
        ${o.notes ? `<p><strong>Contacto / notas:</strong> ${escHtml(o.notes)}</p>` : ''}
        <p><strong>Modalidad de pago:</strong> ${escHtml(modalityLabel)}</p>
        ${o.payment_status === 'paid' ? `<p><strong>Medio de pago (caja):</strong> ${escHtml(payLabel)}</p>` : ''}
        <hr/>
        <p style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:8px;">Detalle de lo pedido</p>
        <table>
          <thead><tr><th>Producto</th><th style="text-align:right">Importe</th></tr></thead>
          <tbody>${itemsRows || '<tr><td colspan="2" style="color:#94a3b8">Sin ítems</td></tr>'}</tbody>
        </table>
        <hr/>
        <div class="tot"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
        ${discount > 0 ? `<div class="tot"><span>Descuento</span><span>− ${formatCurrency(discount)}</span></div>` : ''}
        ${fee > 0 ? `<div class="tot"><span>Delivery</span><span>${formatCurrency(fee)}</span></div>` : ''}
        <div class="tot" style="margin-top:8px;padding-top:8px;border-top:2px solid #0f172a"><span>Total</span><strong>${formatCurrency(total)}</strong></div>
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      toast.error('No se pudo abrir la ventana de impresión');
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 800);
    }, 150);
  };

  const openNewOrder = () => {
    setShowNewOrder(true);
    setCart([]);
    setNoteEditorProductId('');
    setSearch('');
    setSelectedCat('all');
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setDeliveryPaymentModality('contra_entrega');
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          note_required: Number(product.note_required || 0) === 1 ? 1 : 0,
          notes: '',
        },
      ];
    });
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const newQty = i.quantity + delta;
      return newQty > 0 ? { ...i, quantity: newQty } : i;
    }).filter(i => i.quantity > 0));
  };

  const removeFromCart = (productId) => setCart(prev => prev.filter(i => i.product_id !== productId));
  const updateItemNote = (productId, nextNote) => {
    setCart(prev => prev.map(i => (i.product_id === productId ? { ...i, notes: String(nextNote || '') } : i)));
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const submitDeliveryOrder = async () => {
    if (cart.length === 0) return toast.error('Agrega productos al pedido');
    const missingRequiredNote = cart.find(i => Number(i.note_required || 0) === 1 && !String(i.notes || '').trim());
    if (missingRequiredNote) {
      setNoteEditorProductId(missingRequiredNote.product_id);
      return toast.error(`"${missingRequiredNote.name}" requiere nota obligatoria`);
    }
    if (!customerName.trim()) return toast.error('Ingresa el nombre del cliente');
    if (!deliveryAddress.trim()) return toast.error('Ingresa la dirección de entrega');
    try {
      await api.post('/orders', {
        items: cart.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          notes: String(i.notes || '').trim(),
        })),
        type: 'delivery',
        customer_name: customerName.trim(),
        delivery_address: deliveryAddress.trim(),
        delivery_payment_modality: deliveryPaymentModality,
        notes: customerPhone ? `Tel: ${customerPhone}` : '',
      });
      toast.success('Pedido de delivery creado');
      setShowNewOrder(false);
      setCart([]);
      setNoteEditorProductId('');
      if (!isMozo) load();
    } catch (err) { toast.error(err.message); }
  };

  const filteredProducts = products.filter(p => {
    if (selectedCat !== 'all' && p.category_id !== selectedCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Delivery</h1>
        {!isMozo && (
          <div className="flex flex-wrap gap-2">
            <button onClick={openNewOrder} className="btn-primary flex items-center gap-2 text-sm">
              <MdAdd /> Nuevo Pedido
            </button>
            <button onClick={() => setTab('active')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'active' ? 'bg-gold-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>Activos ({activeOrders.length})</button>
            <button onClick={() => setTab('today')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'today' ? 'bg-gold-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>Hoy ({todayDeliveries.length})</button>
            <button onClick={() => setTab('completed')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'completed' ? 'bg-gold-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>Completados ({completedOrders.length})</button>
          </div>
        )}
      </div>

      {isMozo ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center max-w-lg mx-auto">
          <MdDeliveryDining className="text-5xl text-gold-500 mx-auto mb-4" />
          <p className="text-slate-700 font-medium mb-1">Registrar pedido a domicilio</p>
          <p className="text-sm text-slate-500 mb-6">Aquí solo puedes crear el pedido. El seguimiento lo gestionan caja y administración.</p>
          <button type="button" onClick={openNewOrder} className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-base">
            <MdAdd /> Nuevo pedido de delivery
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="card flex items-center gap-3"><div className="w-10 h-10 bg-gold-100 rounded-xl flex items-center justify-center"><MdTimer className="text-gold-600" /></div><div><p className="text-xs text-slate-500">En proceso</p><p className="text-xl font-bold">{activeOrders.length}</p></div></div>
            <div className="card flex items-center gap-3"><div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><MdCheck className="text-emerald-600" /></div><div><p className="text-xs text-slate-500">Entregados hoy</p><p className="text-xl font-bold">{todayDeliveries.length}</p></div></div>
            <div className="card flex items-center gap-3"><div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><MdDeliveryDining className="text-sky-600" /></div><div><p className="text-xs text-slate-500">Total Delivery</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + (o.total || 0), 0))}</p></div></div>
          </div>

          {displayed.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-slate-400"><MdDeliveryDining className="text-5xl mx-auto mb-3" /><p className="font-medium">No hay pedidos de delivery {tab === 'active' ? 'activos' : tab === 'today' ? 'entregados hoy' : 'completados'}</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayed.map(o => (
                <div key={o.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">#{o.order_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[o.status]}`}>{statusNames[o.status]}</span>
                    </div>
                    <p className="text-xs text-slate-400">{formatDateTime(o.created_at)}</p>
                  </div>
                  <div className="space-y-1 mb-3 text-sm">
                    {o.customer_name && <p className="text-slate-600 flex items-center gap-1"><MdPerson className="text-slate-400" />{o.customer_name}</p>}
                    <p className="text-slate-600 flex items-center gap-1"><MdLocationOn className="text-slate-400" />{o.delivery_address || 'Sin dirección'}</p>
                    {o.notes && <p className="text-slate-500 flex items-center gap-1"><MdPhone className="text-slate-400" />{o.notes}</p>}
                    <p className="text-slate-600 text-sm">
                      <span className="text-slate-500">Modalidad de pago:</span>{' '}
                      <span className="font-medium">{labelDeliveryPaymentModality(o.delivery_payment_modality) || '—'}</span>
                      {o.payment_status === 'paid' ? (
                        <span className="text-slate-500"> · Caja: {PAYMENT_METHODS[o.payment_method] || o.payment_method}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="border-t border-slate-100 pt-3 mb-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Detalle de lo pedido</p>
                    {(o.items || []).map((it, i) => (
                      <div key={i} className="flex justify-between text-sm py-0.5"><span>{it.quantity}x {it.product_name}</span><span className="text-slate-500">{formatCurrency(it.subtotal)}</span></div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <div>
                      <p className="text-xs text-slate-500">Total compra</p>
                      <p className="font-bold text-lg">{formatCurrency(o.total)}</p>
                    </div>
                    {tab === 'active' && ['pending', 'preparing', 'ready'].includes(o.status) && (
                      <div className="flex flex-wrap gap-2 justify-end items-center">
                        <button type="button" onClick={() => printDeliveryOrder(o)} className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium inline-flex items-center gap-1">
                          <MdPrint className="text-sm" /> Imprimir
                        </button>
                        {o.status === 'ready' && canMarkDeliveredFromAdmin && (
                          <button type="button" onClick={() => updateStatus(o.id, 'delivered')} className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-medium">Entregado</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal isOpen={showNewOrder} onClose={() => setShowNewOrder(false)} title="Nuevo Pedido de Delivery" size="xl">
        <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: '65vh' }}>
          <div className="flex-1 flex flex-col">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1"><MdPerson className="inline mr-1" />Cliente *</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre del cliente" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1"><MdPhone className="inline mr-1" />Teléfono</label>
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="999 888 777" className="input-field text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1"><MdHome className="inline mr-1" />Dirección de entrega *</label>
                <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Av. ejemplo 123, distrito" className="input-field text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Modalidad de pago</label>
                <select
                  value={deliveryPaymentModality}
                  onChange={(e) => setDeliveryPaymentModality(e.target.value)}
                  className="input-field text-sm max-w-md"
                >
                  {DELIVERY_PAYMENT_MODALITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">Anticipado o contra entrega; el medio de pago en caja lo registra caja al cobrar.</p>
              </div>
            </div>

            <div className="mb-3">
              <div className="relative">
                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="input-field pl-10" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap mb-3">
              <button onClick={() => setSelectedCat('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCat === 'all' ? 'bg-gold-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Todos</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setSelectedCat(c.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCat === c.id ? 'bg-gold-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{c.name}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {filteredProducts.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)} className="bg-slate-50 rounded-xl p-3 text-left hover:shadow-md transition-shadow border border-slate-100 hover:border-gold-300">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-gold-600 font-bold text-sm mt-1">{formatCurrency(p.price)}</p>
                    {showStockInOrderingUI(p) ? (
                      <p className="text-xs text-slate-400">Stock: {p.stock}</p>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-4 flex flex-col">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <MdShoppingCart /> Pedido
              {cart.length > 0 && <span className="text-xs bg-gold-100 text-gold-600 px-2 py-0.5 rounded-full">{cart.length}</span>}
            </h3>

            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">Selecciona productos</p>
              ) : (
                cart.map((item) => {
                  const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);
                  return (
                    <div key={item.product_id} className="border-b border-slate-200 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex-1 min-w-0 truncate font-medium text-slate-800" title={item.name}>
                          {item.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setNoteEditorProductId((prev) => (prev === item.product_id ? '' : item.product_id))}
                            className={`w-7 h-7 rounded flex items-center justify-center border ${
                              item.notes?.trim()
                                ? 'bg-amber-100 border-amber-300 text-amber-700'
                                : 'bg-white hover:bg-slate-200 border border-slate-200'
                            }`}
                            title="Agregar nota"
                          >
                            <MdEditNote className="text-sm" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateQty(item.product_id, -1)}
                            className="w-6 h-6 bg-white rounded flex items-center justify-center hover:bg-slate-200 border border-slate-200"
                          >
                            <MdRemove className="text-xs" />
                          </button>
                          <span className="w-7 text-center font-bold text-slate-900 tabular-nums">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.product_id, 1)}
                            className="w-6 h-6 bg-white rounded flex items-center justify-center hover:bg-slate-200 border border-slate-200"
                          >
                            <MdAdd className="text-xs" />
                          </button>
                        </div>
                        <span className="w-[5.5rem] shrink-0 text-right font-semibold text-gold-700 tabular-nums">
                          {formatCurrency(lineTotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product_id)}
                          className="text-red-400 hover:text-red-600 shrink-0 p-0.5"
                          aria-label="Quitar"
                        >
                          <MdDelete className="text-sm" />
                        </button>
                      </div>
                      {Number(item.note_required || 0) === 1 && (
                        <p className="text-[11px] text-red-600 font-medium mt-0.5">Nota obligatoria</p>
                      )}
                      {(noteEditorProductId === item.product_id || item.notes?.trim()) && (
                        <div className="mt-2">
                          <textarea
                            value={item.notes || ''}
                            onChange={(e) => updateItemNote(item.product_id, e.target.value)}
                            placeholder="Escribe una nota para cocina/bar..."
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                            rows={2}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t pt-3 mt-3 space-y-2">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-gold-600">{formatCurrency(cartTotal)}</span>
                </div>
                <button onClick={submitDeliveryOrder} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                  <MdDeliveryDining /> Crear Pedido Delivery
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
