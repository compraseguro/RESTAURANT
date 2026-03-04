import { useEffect, useState } from 'react';
import { api, formatCurrency } from '../../utils/api';
import { MdAdd, MdEdit, MdDelete, MdLocalOffer, MdCalendarToday } from 'react-icons/md';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';

export default function Ofertas() {
  const [ofertas, setOfertas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', type: 'promo', discount: '', startDate: '', endDate: '', products: '' });

  const load = async () => {
    try {
      const rows = await api.get('/admin-modules/offers');
      setOfertas(rows || []);
    } catch (err) {
      toast.error(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin-modules/offers', {
        name: form.name,
        description: form.description,
        type: form.type,
        discount: parseFloat(form.discount),
        start_date: form.startDate,
        end_date: form.endDate,
        products: form.products,
        active: 1,
      });
      setShowModal(false);
      setForm({ name: '', description: '', type: 'promo', discount: '', startDate: '', endDate: '', products: '' });
      toast.success('Oferta creada');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleActive = async (id) => {
    const current = ofertas.find(o => o.id === id);
    if (!current) return;
    try {
      await api.put(`/admin-modules/offers/${id}`, { active: current.active ? 0 : 1 });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const deleteOferta = async (id) => {
    if (!confirm('¿Eliminar oferta?')) return;
    try {
      await api.delete(`/admin-modules/offers/${id}`);
      toast.success('Eliminada');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Ofertas</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><MdAdd /> Nueva Oferta</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="card flex items-center gap-3"><div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><MdLocalOffer className="text-emerald-600" /></div><div><p className="text-xs text-slate-500">Ofertas Activas</p><p className="text-xl font-bold">{ofertas.filter(o => o.active).length}</p></div></div>
        <div className="card flex items-center gap-3"><div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center"><MdLocalOffer className="text-slate-500" /></div><div><p className="text-xs text-slate-500">Total Ofertas</p><p className="text-xl font-bold">{ofertas.length}</p></div></div>
      </div>

      <div className="space-y-4">
        {ofertas.map(o => (
          <div key={o.id} className={`bg-white rounded-xl shadow-sm border p-5 ${o.active ? 'border-emerald-200' : 'border-slate-200 opacity-60'}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-slate-800">{o.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${o.type === 'promo' ? 'bg-sky-100 text-sky-700' : 'bg-sky-100 text-sky-700'}`}>{o.type === 'promo' ? 'Promoción' : 'Combo'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${o.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{o.active ? 'Activa' : 'Inactiva'}</span>
                </div>
                <p className="text-sm text-slate-500 mb-2">{o.description}</p>
                <p className="text-xs text-slate-400"><MdCalendarToday className="inline mr-1" />{o.start_date} al {o.end_date}</p>
                <p className="text-xs text-slate-400 mt-1">Productos: {o.products}</p>
              </div>
              <div className="text-right ml-4">
                <p className="text-2xl font-bold text-gold-600">{o.discount}%</p>
                <p className="text-xs text-slate-400">descuento</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => toggleActive(o.id)} className={`text-xs px-3 py-1.5 rounded-lg ${o.active ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-600'}`}>{o.active ? 'Desactivar' : 'Activar'}</button>
                  <button onClick={() => deleteOferta(o.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"><MdDelete /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Nueva Oferta" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" rows="2" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input-field"><option value="promo">Promoción</option><option value="combo">Combo</option></select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Descuento (%)</label><input type="number" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} className="input-field" required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Inicio</label><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="input-field" required /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Fin</label><input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="input-field" required /></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Productos aplicables</label><input value={form.products} onChange={e => setForm({ ...form, products: e.target.value })} className="input-field" placeholder="Separados por coma" /></div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button><button type="submit" className="btn-primary flex-1">Crear Oferta</button></div>
        </form>
      </Modal>
    </div>
  );
}
