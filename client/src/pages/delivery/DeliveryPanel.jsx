import { useState, useEffect } from 'react';
import { api, formatCurrency } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { MdDeliveryDining, MdLogout, MdPhone, MdLocationOn, MdAccessTime, MdCheckCircle } from 'react-icons/md';

export default function DeliveryPanel() {
  const [deliveries, setDeliveries] = useState([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canReturnToAdmin = user?.role === 'admin' && !location.pathname.startsWith('/admin');

  const loadData = async () => {
    try {
      const data = await api.get('/orders?type=delivery');
      setDeliveries((data || []).filter(d => ['pending', 'preparing', 'ready'].includes(d.status)));
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    loadData();
  }, []);
  useActiveInterval(loadData, 10000);

  useSocket('new-order', loadData);
  useSocket('order-update', loadData);
  useSocket('delivery-update', loadData);

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/orders/${id}/status`, { status });
      toast.success('Estado actualizado');
      loadData();
    } catch (err) { toast.error(err.message); }
  };

  const statusLabels = { pending: 'Pendiente', preparing: 'Preparando', ready: 'Listo para enviar' };
  const statusColors = {
    pending: 'bg-blue-500/20 text-blue-100 border border-blue-300/40',
    preparing: 'bg-blue-700/25 text-blue-100 border border-blue-300/30',
    ready: 'bg-blue-900/35 text-blue-100 border border-blue-300/30',
  };

  const getTimeDiff = (created) => {
    const source = created?.endsWith('Z') ? created : `${created}Z`;
    const diff = Math.floor((Date.now() - new Date(source).getTime()) / 60000);
    if (!Number.isFinite(diff) || diff < 1) return 'Ahora';
    if (diff < 60) return `${diff} min`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  const activeDeliveries = deliveries;

  return (
    <div className="min-h-screen bg-[#111827] text-[#F9FAFB]">
      <header className="bg-[#1F2937]/90 backdrop-blur-xl border-b border-[#3B82F6]/30 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <MdDeliveryDining className="text-3xl text-[#F9FAFB]" />
          <div>
            <h1 className="text-xl font-bold">Panel de Delivery</h1>
            <p className="text-sm text-[#9CA3AF]">{user?.full_name} · {activeDeliveries.length} entregas activas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canReturnToAdmin && (
            <button onClick={() => navigate('/admin')} className="px-3 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg text-white border border-[#3B82F6]/25 text-sm font-medium">
              Volver al Centro Operativo
            </button>
          )}
          <button onClick={logout} className="px-3 py-2 hover:bg-[#111827]/80 rounded-lg text-[#9CA3AF] hover:text-[#F9FAFB] border border-[#3B82F6]/25 text-sm font-medium inline-flex items-center gap-2">
            <MdLogout className="text-lg" /> Finalizar jornada
          </button>
        </div>
      </header>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl bg-[#1F2937]/85 border border-[#3B82F6]/25 p-4 flex items-center gap-3 backdrop-blur-xl">
            <div className="w-10 h-10 bg-[#111827]/60 border border-[#3B82F6]/25 rounded-xl flex items-center justify-center">
              <MdDeliveryDining className="text-[#F9FAFB] text-xl" />
            </div>
            <div>
              <p className="text-xs text-[#9CA3AF]">Entregas activas</p>
              <p className="text-xl font-bold text-white">{activeDeliveries.length}</p>
            </div>
          </div>
          <div className="rounded-xl bg-[#1F2937]/85 border border-[#3B82F6]/25 p-4 flex items-center gap-3 backdrop-blur-xl">
            <div className="w-10 h-10 bg-[#111827]/60 border border-[#3B82F6]/25 rounded-xl flex items-center justify-center">
              <MdCheckCircle className="text-[#F9FAFB] text-xl" />
            </div>
            <div>
              <p className="text-xs text-[#9CA3AF]">Monto en ruta</p>
              <p className="text-xl font-bold text-[#F9FAFB]">
                {formatCurrency(activeDeliveries.reduce((sum, d) => sum + Number(d.total || 0), 0))}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-[#1F2937]/85 border border-[#3B82F6]/25 p-4 flex items-center gap-3 backdrop-blur-xl">
            <div className="w-10 h-10 bg-[#111827]/60 border border-[#3B82F6]/25 rounded-xl flex items-center justify-center">
              <MdAccessTime className="text-[#F9FAFB] text-xl" />
            </div>
            <div>
              <p className="text-xs text-[#9CA3AF]">Pedidos listos</p>
              <p className="text-xl font-bold text-white">{activeDeliveries.filter(d => d.status === 'ready').length}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeDeliveries.map(d => (
            <div key={d.id} className="rounded-xl overflow-hidden bg-[#1F2937]/85 border border-[#3B82F6]/25 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="px-4 py-3 flex items-center justify-between w-full bg-[#111827]/50 border-b border-[#3B82F6]/25">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg">#{d.order_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[d.status]}`}>{statusLabels[d.status]}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-[#9CA3AF]">
                    <MdAccessTime />
                    <span>{getTimeDiff(d.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 space-y-2 mb-2">
                <div className="flex items-start gap-2">
                  <MdLocationOn className="text-[#9CA3AF] mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-[#F9FAFB]">{d.delivery_address || 'Sin dirección'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <MdPhone className="text-[#9CA3AF] flex-shrink-0" />
                  <p className="text-sm text-[#F9FAFB]">{d.customer_name || 'Cliente'}</p>
                </div>
                <p className="text-sm font-bold text-[#F9FAFB]">{formatCurrency(d.total)}</p>
                {d.notes && (
                  <div className="bg-[#111827]/55 rounded-lg p-2 border border-[#3B82F6]/25">
                    <p className="text-xs text-[#F9FAFB]">Notas: {d.notes}</p>
                  </div>
                )}
              </div>

              {d.items && d.items.length > 0 && (
                <div className="px-4 py-3 border-t border-[#3B82F6]/25 pt-3 mb-2">
                  <p className="text-xs font-medium text-[#9CA3AF] mb-1">Productos:</p>
                  {d.items.map(item => (
                    <p key={item.id} className="text-sm text-[#F9FAFB]">{item.quantity}x {item.product_name}</p>
                  ))}
                </div>
              )}

              {d.status !== 'delivered' && (
                <div className="px-4 py-3 border-t border-[#3B82F6]/25">
                  {d.status === 'pending' && (
                    <button onClick={() => updateStatus(d.id, 'preparing')} className="w-full py-2.5 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#1E40AF] rounded-lg font-bold text-sm transition-all">PREPARAR</button>
                  )}
                  {d.status === 'preparing' && (
                    <button onClick={() => updateStatus(d.id, 'ready')} className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg font-bold text-sm transition-colors">LISTO</button>
                  )}
                  {d.status === 'ready' && (
                    <button onClick={() => updateStatus(d.id, 'delivered')} className="w-full py-2.5 bg-[#1E40AF] hover:bg-[#1E3A8A] rounded-lg font-bold text-sm transition-colors">ENTREGADO</button>
                  )}
                </div>
              )}

            </div>
          ))}

          {activeDeliveries.length === 0 && (
            <div className="col-span-full text-center py-16">
              <MdDeliveryDining className="text-6xl text-[#9CA3AF] mx-auto mb-4" />
              <p className="text-xl text-[#F9FAFB]">No tienes entregas activas</p>
              <p className="text-[#9CA3AF] mt-2">Los nuevos pedidos delivery aparecerán aquí automáticamente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
