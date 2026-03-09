import { useEffect, useMemo, useState } from 'react';
import { api, formatCurrency } from '../../utils/api';
import { MdAdd, MdEdit, MdDelete, MdSearch, MdPhone, MdEmail, MdReceipt, MdAttachMoney } from 'react-icons/md';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [expandedClientId, setExpandedClientId] = useState('');
  const [chargingClientId, setChargingClientId] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', password: '' });

  const load = async (term = '') => {
    setLoading(true);
    try {
      const [data, ordersData] = await Promise.all([
        api.get(`/admin-modules/customers${term ? `?q=${encodeURIComponent(term)}` : ''}`),
        api.get('/orders?limit=600').catch(() => []),
      ]);
      setClientes(data || []);
      setOrders(ordersData || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = clientes.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editClient) {
        await api.put(`/admin-modules/customers/${editClient.id}`, form);
        toast.success('Cliente actualizado');
      } else {
        await api.post('/admin-modules/customers', form);
        toast.success('Cliente registrado');
      }
      setShowModal(false);
      setEditClient(null);
      setForm({ name: '', phone: '', email: '', address: '', password: '' });
      load(search);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openEdit = (c) => {
    setEditClient(c);
    setForm({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '', password: '' });
    setShowModal(true);
  };
  const openNew = () => {
    setEditClient(null);
    setForm({ name: '', phone: '', email: '', address: '', password: '' });
    setShowModal(true);
  };
  const deleteClient = async (id) => {
    if (!confirm('¿Eliminar cliente?')) return;
    try {
      await api.delete(`/admin-modules/customers/${id}`);
      toast.success('Cliente eliminado');
      load(search);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const totalVisits = clientes.reduce((s, c) => s + Number(c.visits || 0), 0);
  const totalIncome = clientes.reduce((s, c) => s + Number(c.total_spent || 0), 0);
  const pendingOrdersByCustomer = useMemo(() => {
    const map = {};
    (orders || []).forEach((o) => {
      if (String(o.payment_status || '') === 'paid' || String(o.status || '') === 'cancelled') return;
      const cid = String(o.customer_id || '').trim();
      if (!cid) return;
      if (!map[cid]) map[cid] = [];
      map[cid].push(o);
    });
    return map;
  }, [orders]);
  const getCustomerPendingTotal = (customerId) =>
    (pendingOrdersByCustomer[customerId] || []).reduce((sum, o) => sum + Number(o.total || 0), 0);
  const chargeCustomerPendingOrders = async (customer) => {
    const customerOrders = pendingOrdersByCustomer[customer.id] || [];
    if (!customerOrders.length) return toast.error('No hay pedidos pendientes para cobrar');
    try {
      setChargingClientId(customer.id);
      await api.post('/pos/checkout-table', {
        order_ids: customerOrders.map(o => o.id),
        payment_method: 'efectivo',
      });
      toast.success(`Pedidos de ${customer.name} cobrados correctamente`);
      await load(search);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChargingClientId('');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2"><MdAdd /> Nuevo Cliente</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="card"><p className="text-xs text-slate-500">Total Clientes</p><p className="text-xl font-bold">{clientes.length}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Visitas Totales</p><p className="text-xl font-bold">{totalVisits}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Ingreso por Clientes</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</p></div>
      </div>

      <div className="card p-5">
        <div className="relative mb-4">
          <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o teléfono..." className="input-field pl-9" />
        </div>
        {loading ? (
          <div className="text-center py-10 text-slate-400">Cargando clientes...</div>
        ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="p-4 rounded-lg border border-slate-700 bg-slate-800/40 hover:bg-slate-700/40">
              <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gold-100 rounded-full flex items-center justify-center"><span className="font-bold text-gold-700 text-lg">{c.name[0]}</span></div>
                <div>
                  <p className="font-bold text-slate-100">{c.name}</p>
                  <p className="text-sm text-slate-300"><MdPhone className="inline text-xs" /> {c.phone} · <MdEmail className="inline text-xs" /> {c.email}</p>
                  <p className="text-xs text-slate-400">{Number(c.visits || 0)} visitas · Última: {c.last_visit || '-'} · Total: {formatCurrency(c.total_spent || 0)}</p>
                  <p className="text-xs text-sky-300 mt-1">
                    Pedidos pendientes: <strong>{(pendingOrdersByCustomer[c.id] || []).length}</strong>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setExpandedClientId(prev => prev === c.id ? '' : c.id)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-300"><MdReceipt /></button>
                <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-300"><MdEdit /></button>
                <button onClick={(e) => { e.stopPropagation(); deleteClient(c.id); }} className="p-2 hover:bg-red-900/40 rounded-lg text-slate-300 hover:text-red-300"><MdDelete /></button>
              </div>
              </div>
              {expandedClientId === c.id && (
                <div className="mt-3 rounded-lg border border-slate-300 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-900 mb-2">Pedidos pendientes por cobrar</p>
                  {(pendingOrdersByCustomer[c.id] || []).length === 0 ? (
                    <p className="text-xs text-slate-700">No tiene pedidos pendientes.</p>
                  ) : (
                    <div className="space-y-2">
                      {(pendingOrdersByCustomer[c.id] || []).map(o => (
                        <div key={o.id} className="rounded-lg border border-slate-200 p-2">
                          <div className="text-[11px] font-semibold text-slate-700 mb-1">Pedido #{o.order_number || '-'}</div>
                          <div className="space-y-1">
                            {(o.items || []).length === 0 ? (
                              <p className="text-xs text-slate-500">Sin detalle de productos</p>
                            ) : (
                              (o.items || []).map((item) => (
                                <div key={item.id || `${o.id}-${item.product_id}`} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-800">{item.quantity}x {item.product_name}</span>
                                  <span className="text-slate-700">{formatCurrency(item.subtotal || 0)}</span>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1">
                            <span className="text-xs font-medium text-slate-700">Total pedido</span>
                            <strong className="text-emerald-700">{formatCurrency(o.total || 0)}</strong>
                          </div>
                        </div>
                      ))}
                      <div className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-white flex items-center justify-between">
                        <span className="text-sm font-semibold">Total pendiente</span>
                        <span className="text-base font-bold">{formatCurrency(getCustomerPendingTotal(c.id))}</span>
                      </div>
                      <button
                        onClick={() => chargeCustomerPendingOrders(c)}
                        disabled={chargingClientId === c.id}
                        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <MdAttachMoney />
                        {chargingClientId === c.id ? 'Cobrando...' : 'Cobrar pendientes'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center py-8 text-slate-400">No se encontraron clientes</p>}
        </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditClient(null); }} title={editClient ? 'Editar Cliente' : 'Nuevo Cliente'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" name="customer-create-email" autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="@gmail.com" /></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input-field" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Contraseña {editClient ? '(opcional para actualizar)' : '(opcional, por defecto cliente123)'}</label><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-field" /></div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button><button type="submit" className="btn-primary flex-1">{editClient ? 'Guardar' : 'Registrar'}</button></div>
        </form>
      </Modal>
    </div>
  );
}
