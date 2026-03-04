import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { MdAdd, MdEdit, MdDelete, MdEventSeat, MdPerson, MdPhone, MdCalendarToday, MdAccessTime } from 'react-icons/md';

export default function Reservas() {
  const [reservas, setReservas] = useState([]);
  const [tables, setTables] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ client_name: '', phone: '', date: '', time: '', guests: 2, table_id: '', notes: '' });

  const load = async () => {
    try {
      const [tablesData, reservationsData] = await Promise.all([
        api.get('/tables'),
        api.get('/admin-modules/reservations'),
      ]);
      setTables(tablesData);
      setReservas(reservationsData || []);
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin-modules/reservations', { ...form, status: 'confirmed' });
      setShowModal(false);
      setForm({ client_name: '', phone: '', date: '', time: '', guests: 2, table_id: '', notes: '' });
      toast.success('Reserva creada');
      load();
    } catch (err) {
      toast.error(err.message);
    }
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
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><MdAdd /> Nueva Reserva</button>
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
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Cliente</label><input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className="input-field" required placeholder="Nombre completo" /></div>
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
