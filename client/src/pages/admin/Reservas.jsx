import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdEventSeat, MdPerson, MdPhone, MdCalendarToday, MdAccessTime } from 'react-icons/md';

export default function Reservas() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const [reservas, setReservas] = useState([]);
  const [tables, setTables] = useState([]);
  const [menuProducts, setMenuProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saveAsNewCustomer, setSaveAsNewCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedRequestProductId, setSelectedRequestProductId] = useState('');
  const [selectedRequestQty, setSelectedRequestQty] = useState('1');
  const [requestItems, setRequestItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ client_name: '', phone: '', date: todayKey, time: '', guests: 1, table_id: '', notes: '' });

  const load = async () => {
    try {
      const [tablesData, reservationsData, customersData, productsData] = await Promise.all([
        api.get('/tables'),
        api.get('/admin-modules/reservations'),
        api.get('/admin-modules/customers').catch(() => []),
        api.get('/products?active_only=true').catch(() => []),
      ]);
      setTables(tablesData);
      setReservas(reservationsData || []);
      setCustomers(customersData || []);
      setMenuProducts((productsData || []).filter(p => Number(p.is_active ?? 1) === 1));
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const query = String(form.client_name || '').trim().toLowerCase();
    const source = (customers || []);
    const suggestions = (!query
      ? source
      : source.filter(c => String(c.name || '').toLowerCase().includes(query)))
      .slice(0, 8);
    setCustomerSuggestions(suggestions);
  }, [form.client_name, customers]);

  const resetForm = () => {
    setForm({ client_name: '', phone: '', date: todayKey, time: '', guests: 1, table_id: '', notes: '' });
    setSaveAsNewCustomer(false);
    setSelectedCustomerId('');
    setShowSuggestions(false);
    setSelectedRequestProductId('');
    setSelectedRequestQty('1');
    setRequestItems([]);
  };
  const selectCustomer = (customer) => {
    setForm(prev => ({
      ...prev,
      client_name: customer.name || '',
      phone: customer.phone || prev.phone || '',
    }));
    setSelectedCustomerId(customer.id || '');
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const clientName = String(form.client_name || '').trim();
      if (!clientName) return toast.error('Ingresa o selecciona el cliente');
      if (saveAsNewCustomer && !selectedCustomerId) {
        await api.post('/admin-modules/customers', {
          name: clientName,
          phone: String(form.phone || '').trim(),
        });
      }
      const requestedSummary = requestItems
        .map(item => `${item.qty}x ${item.name}`)
        .join(' | ');
      const notesMerged = [String(form.notes || '').trim(), requestedSummary ? `Pedido solicitado: ${requestedSummary}` : '']
        .filter(Boolean)
        .join('\n');
      await api.post('/admin-modules/reservations', {
        ...form,
        notes: notesMerged,
        status: 'confirmed',
      });
      setShowModal(false);
      resetForm();
      toast.success('Reserva creada');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const addRequestItem = () => {
    const product = menuProducts.find(p => p.id === selectedRequestProductId);
    if (!product) return toast.error('Selecciona un producto de la carta');
    const qty = Math.max(1, parseInt(selectedRequestQty || '1', 10) || 1);
    setRequestItems(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item => item.product_id === product.id ? { ...item, qty: item.qty + qty } : item);
      }
      return [...prev, { product_id: product.id, name: product.name, qty }];
    });
    setSelectedRequestProductId('');
    setSelectedRequestQty('1');
  };
  const removeRequestItem = (productId) => {
    setRequestItems(prev => prev.filter(item => item.product_id !== productId));
  };

  const cancelReserva = async (id) => {
    try {
      await api.put(`/admin-modules/reservations/${id}`, { status: 'cancelled' });
      toast.success('Reserva cancelada');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const todayReservas = reservas.filter(r => r.date === today && r.status !== 'cancelled');
  const statusColors = { confirmed: 'bg-emerald-100 text-emerald-700', pending: 'bg-gold-100 text-gold-700', cancelled: 'bg-red-100 text-red-700', completed: 'bg-sky-100 text-sky-700' };
  const statusNames = { confirmed: 'Confirmada', pending: 'Pendiente', cancelled: 'Cancelada', completed: 'Completada' };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Reservas</h1>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center gap-2"><MdAdd /> Nueva Reserva</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="card flex items-center gap-3"><div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><MdCalendarToday className="text-sky-600" /></div><div><p className="text-xs text-slate-500">Hoy</p><p className="text-xl font-bold">{todayReservas.length}</p></div></div>
        <div className="card flex items-center gap-3"><div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><MdEventSeat className="text-emerald-600" /></div><div><p className="text-xs text-slate-500">Confirmadas</p><p className="text-xl font-bold">{reservas.filter(r => r.status === 'confirmed').length}</p></div></div>
        <div className="card flex items-center gap-3"><div className="w-10 h-10 bg-gold-100 rounded-xl flex items-center justify-center"><MdPerson className="text-gold-600" /></div><div><p className="text-xs text-slate-500">Comensales esperados</p><p className="text-xl font-bold">{todayReservas.reduce((s, r) => s + r.guests, 0)}</p></div></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        {reservas.length === 0 ? (
          <div className="text-center py-12 text-slate-400"><MdEventSeat className="text-5xl mx-auto mb-3" /><p className="font-medium">No hay reservas</p><p className="text-sm">Crea una nueva reserva para comenzar</p></div>
        ) : (
          <div className="space-y-3">
            {reservas.map(r => (
              <div key={r.id} className="flex items-center justify-between p-4 rounded-lg border border-slate-100 hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gold-100 rounded-full flex items-center justify-center"><span className="font-bold text-gold-700">{r.client_name[0]}</span></div>
                  <div>
                    <p className="font-bold text-slate-800">{r.client_name}</p>
                    <p className="text-sm text-slate-500"><MdCalendarToday className="inline text-xs mr-1" />{r.date} · <MdAccessTime className="inline text-xs mr-1" />{r.time} · {r.guests} personas</p>
                    {r.phone && <p className="text-xs text-slate-400"><MdPhone className="inline text-xs mr-1" />{r.phone}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[r.status]}`}>{statusNames[r.status]}</span>
                  {r.status !== 'cancelled' && (
                    <button onClick={() => cancelReserva(r.id)} className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">Cancelar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Nueva Reserva" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Cliente</label>
            <input
              value={form.client_name}
              onChange={e => {
                setForm({ ...form, client_name: e.target.value });
                setSelectedCustomerId('');
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              className="input-field"
              required
              placeholder="Busca o escribe nombre del cliente"
            />
            {showSuggestions && customerSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                {customerSuggestions.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.phone || 'Sin teléfono'}</p>
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && customerSuggestions.length === 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-3">
                <p className="text-xs text-slate-500">No hay coincidencias. Puedes crear cliente nuevo con la opción de abajo.</p>
              </div>
            )}
            <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={saveAsNewCustomer}
                onChange={e => setSaveAsNewCustomer(e.target.checked)}
                className="rounded border-slate-300"
              />
              Guardar como cliente nuevo si no existe (opción de nueva solicitud)
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="999 999 999" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Comensales</label><input type="number" min="1" max="20" value={form.guests} onChange={e => setForm({ ...form, guests: parseInt(e.target.value) })} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Hora</label><input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="input-field" required /></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Mesa</label>
            <select value={form.table_id} onChange={e => setForm({ ...form, table_id: e.target.value })} className="input-field">
              <option value="">Sin asignar</option>
              {tables.map(t => <option key={t.id} value={t.id}>{t.name || `Mesa ${t.number}`} (Cap. {t.capacity})</option>)}
            </select>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
            <p className="text-sm font-medium text-slate-700 mb-2">Pedido solicitado (opcional)</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select
                value={selectedRequestProductId}
                onChange={e => setSelectedRequestProductId(e.target.value)}
                className="input-field md:col-span-2"
              >
                <option value="">Selecciona producto de carta</option>
                {menuProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={selectedRequestQty}
                onChange={e => setSelectedRequestQty(e.target.value)}
                className="input-field"
                placeholder="Cant."
              />
              <button type="button" onClick={addRequestItem} className="btn-secondary">Añadir</button>
            </div>
            {requestItems.length > 0 && (
              <div className="mt-2 space-y-1">
                {requestItems.map(item => (
                  <div key={item.product_id} className="flex items-center justify-between rounded-md bg-white border border-slate-200 px-2 py-1 text-sm">
                    <span>{item.qty}x {item.name}</span>
                    <button type="button" onClick={() => removeRequestItem(item.product_id)} className="text-xs text-red-600 hover:text-red-700">Quitar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Notas</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" rows="2" placeholder="Observaciones..." /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">Crear Reserva</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
