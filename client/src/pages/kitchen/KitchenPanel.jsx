import { useState, useEffect } from 'react';
import { api, ORDER_TYPES, formatTime } from '../../utils/api';
import { useSocket, useSocketEmit } from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';
import { MdKitchen, MdLocalBar, MdLogout, MdRestaurant, MdDeliveryDining, MdTableBar, MdCheckCircle, MdAccessTime, MdPrint } from 'react-icons/md';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';

export default function KitchenPanel({ station = 'cocina' }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [printConfig, setPrintConfig] = useState({ cocina: { width_mm: 80, copies: 1 }, bar: { width_mm: 80, copies: 1 } });
  const [restaurantInfo, setRestaurantInfo] = useState({ name: 'Resto-FADEY', address: '', phone: '' });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const emit = useSocketEmit();
  const isBar = station === 'bar';
  const StationIcon = isBar ? MdLocalBar : MdKitchen;
  const panelTitle = isBar ? 'Panel de Bar' : 'Panel de Cocina';
  const canReturnToAdmin = user?.role === 'admin' && !location.pathname.startsWith('/admin');

  const playStationAlert = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = isBar ? 880 : 660;
      gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.38);
      oscillator.onended = () => {
        if (ctx.state !== 'closed') ctx.close().catch(() => {});
      };
    } catch (_) {
      // noop: if browser blocks autoplay or audio context
    }
  };

  const printQueue = async (scope = 'all') => {
    const qs = new URLSearchParams();
    qs.set('station', station);
    if (scope === 'delivery') qs.set('type', 'delivery');
    if (scope === 'salon') qs.set('type', 'dine_in');
    let list = orders;
    try {
      list = await api.get(`/orders/kitchen?${qs.toString()}`);
    } catch (_) {
      list = orders;
    }
    if (!list.length) {
      toast.error('No hay pedidos para imprimir');
      return;
    }
    const stationConfig = station === 'bar' ? printConfig?.bar : printConfig?.cocina;
    const width = [58, 80].includes(Number(stationConfig?.width_mm)) ? Number(stationConfig.width_mm) : 80;
    const copies = Math.min(5, Math.max(1, Number(stationConfig?.copies || 1)));
    const ticketWidth = width === 58 ? '50mm' : '72mm';
    const titleBase = isBar ? 'Comandas de Bar' : 'Comandas de Cocina';
    const scopeLabel = scope === 'delivery' ? 'Delivery' : scope === 'salon' ? 'Mesas/Salón' : 'Todas';
    const title = `${titleBase} - ${scopeLabel}`;
    const htmlRows = list.map(order => {
      const orderTypeLabel = order.type === 'delivery' ? 'Delivery' : order.type === 'pickup' ? 'Recojo' : 'Mesa/Salón';
      const items = (order.items || []).map(item => (
        `<li>${item.quantity}x ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}${item.notes ? ` - ${item.notes}` : ''}</li>`
      )).join('');
      return `
        <div class="ticket">
          <strong>#${order.order_number}</strong> - ${orderTypeLabel}${order.table_number ? ` - Mesa ${order.table_number}` : ''}<br/>
          <small>${formatTime(order.created_at)}</small>
          <ul style="margin:8px 0 0 16px;padding:0;">${items}</ul>
        </div>
      `;
    }).join('');

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
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      toast.error('No se pudo abrir el documento de impresión');
      return;
    }
    doc.open();
    const repeatedRows = Array.from({ length: copies }).map((_, idx) => `
      <div style="margin-bottom:8px;">
        ${copies > 1 ? `<p style="margin:0 0 4px 0;font-size:10px;">Copia ${idx + 1} de ${copies}</p>` : ''}
        ${htmlRows}
      </div>
    `).join('');

    doc.write(`
      <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: ${width}mm auto; margin: 3mm; }
          body { font-family: 'Courier New', monospace; width: ${ticketWidth}; margin: 0; font-size: 11px; line-height: 1.3; }
          .ticket { border-bottom: 1px dashed #999; padding-bottom: 6px; margin-bottom: 6px; }
          h2 { font-size: 13px; margin: 0 0 4px 0; }
          ul { margin: 6px 0 0 12px; padding: 0; }
          li { margin-bottom: 2px; }
        </style>
      </head>
      <body>
        <h2>${restaurantInfo?.name || 'Resto-FADEY'}</h2>
        <p style="margin:0;font-size:10px;">${restaurantInfo?.address || ''}</p>
        <p style="margin:0 0 6px 0;font-size:10px;">${restaurantInfo?.phone || ''}</p>
        <h2>${title}</h2>
        <p style="margin:0 0 8px 0;">${new Date().toLocaleString()}</p>
        ${repeatedRows}
      </body>
      </html>
    `);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1200);
    }, 120);
  };

  const loadOrders = async () => {
    try {
      const qs = new URLSearchParams();
      if (filter !== 'all') qs.set('type', filter);
      qs.set('station', station);
      setOrders(await api.get(`/orders/kitchen?${qs.toString()}`));
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    loadOrders();
    emit(isBar ? 'join-bar' : 'join-kitchen');
    const timer = setInterval(loadOrders, 10000);
    return () => clearInterval(timer);
  }, [filter, station]);

  useEffect(() => {
    api.get('/orders/print-config')
      .then((cfg) => {
        setPrintConfig(cfg?.printers || { cocina: { width_mm: 80, copies: 1 }, bar: { width_mm: 80, copies: 1 } });
        setRestaurantInfo(cfg?.restaurant || { name: 'Resto-FADEY', address: '', phone: '' });
      })
      .catch(() => {});
  }, [station]);

  useSocket('new-order', (order) => {
    loadOrders();
    playStationAlert();
    toast.success(`Nuevo pedido #${order.order_number} (${isBar ? 'bar' : 'cocina'})`, { icon: '🔔', duration: 5000 });
  });

  useSocket('order-update', () => loadOrders());

  const updateStatus = async (orderId, status) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status });
      toast.success(status === 'preparing' ? 'Marcado en preparación' : 'Marcado como listo');
      loadOrders();
    } catch (err) { toast.error(err.message); }
  };

  const getTimeDiff = (created) => {
    const diff = Math.floor((Date.now() - new Date(created + 'Z').getTime()) / 60000);
    if (diff < 1) return 'Ahora';
    if (diff < 60) return `${diff} min`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  const typeIcons = { dine_in: MdTableBar, delivery: MdDeliveryDining, pickup: MdRestaurant };

  return (
    <div className="min-h-screen bg-[#111827] text-[#F9FAFB]">
      <header className="bg-[#1F2937]/90 backdrop-blur-xl border-b border-[#3B82F6]/30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StationIcon className="text-3xl text-[#F9FAFB]" />
          <div>
            <h1 className="text-xl font-bold">{panelTitle}</h1>
            <p className="text-[#9CA3AF] text-sm">{orders.length} pedidos activos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {[{ v: 'all', l: 'Todos' }, { v: 'dine_in', l: 'Mesas' }, { v: 'delivery', l: 'Delivery' }].map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.v ? 'bg-[#3B82F6] text-white' : 'bg-[#111827]/60 text-[#F9FAFB] hover:bg-[#1F2937] border border-[#3B82F6]/25'}`}>{f.l}</button>
            ))}
          </div>
          <button onClick={() => printQueue('salon')} className="px-3 py-2 bg-[#111827]/60 hover:bg-[#1F2937] border border-[#3B82F6]/25 rounded-lg text-sm font-medium flex items-center gap-2">
            <MdPrint /> Imprimir Mesas
          </button>
          <button onClick={() => printQueue('delivery')} className="px-3 py-2 bg-[#111827]/60 hover:bg-[#1F2937] border border-[#3B82F6]/25 rounded-lg text-sm font-medium flex items-center gap-2">
            <MdPrint /> Imprimir Delivery
          </button>
          <button onClick={() => printQueue('all')} className="px-3 py-2 bg-[#111827]/60 hover:bg-[#1F2937] border border-[#3B82F6]/25 rounded-lg text-sm font-medium flex items-center gap-2">
            <MdPrint /> Imprimir Todo
          </button>
          {canReturnToAdmin && (
            <button onClick={() => navigate('/admin')} className="px-3 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg text-white border border-[#3B82F6]/25 text-sm font-medium">
              Volver al Centro Operativo
            </button>
          )}
          <button onClick={logout} className="px-3 py-2 hover:bg-[#1F2937] rounded-lg text-[#9CA3AF] hover:text-[#F9FAFB] border border-[#3B82F6]/25 text-sm font-medium inline-flex items-center gap-2">
            <MdLogout className="text-lg" /> Finalizar jornada
          </button>
        </div>
      </header>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orders.map(order => {
          const TypeIcon = typeIcons[order.type] || MdRestaurant;
          const isUrgent = (Date.now() - new Date(order.created_at + 'Z').getTime()) > 15 * 60000;

          return (
            <div key={order.id} className={`rounded-xl overflow-hidden backdrop-blur-xl ${order.status === 'pending' ? 'bg-[#1F2937] border-2 border-[#3B82F6]/60' : 'bg-[#1F2937]/85 border border-[#3B82F6]/25'} ${isUrgent ? 'ring-2 ring-[#3B82F6]/45' : ''}`}>
              <div className={`px-4 py-3 flex items-center justify-between ${order.status === 'pending' ? 'bg-[#3B82F6]/20' : 'bg-[#111827]/45'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">#{order.order_number}</span>
                  <TypeIcon className="text-xl" />
                  {order.table_number && <span className="text-sm bg-[#111827]/60 border border-[#3B82F6]/25 px-2 py-0.5 rounded">Mesa {order.table_number}</span>}
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <MdAccessTime className={isUrgent ? 'text-[#F9FAFB]' : 'text-[#9CA3AF]'} />
                  <span className={isUrgent ? 'text-[#F9FAFB] font-bold' : 'text-[#9CA3AF]'}>{getTimeDiff(order.created_at)}</span>
                </div>
              </div>

              <div className="px-4 py-3 space-y-2">
                {order.items?.map(item => (
                  <div key={item.id} className="flex items-start gap-2">
                    <span className="bg-[#111827]/60 border border-[#3B82F6]/25 text-[#F9FAFB] w-6 h-6 rounded flex items-center justify-center text-sm font-bold flex-shrink-0">{item.quantity}</span>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.product_name}</p>
                      {item.variant_name && <p className="text-xs text-[#9CA3AF]">{item.variant_name}</p>}
                      {item.notes && <p className="text-xs text-[#9CA3AF] italic">{item.notes}</p>}
                    </div>
                  </div>
                ))}
                {order.notes && <div className="bg-[#111827]/55 border border-[#3B82F6]/25 rounded-lg p-2 mt-2"><p className="text-xs text-[#F9FAFB]">📝 {order.notes}</p></div>}
              </div>

              <div className="px-4 py-3 border-t border-[#3B82F6]/25">
                {order.status === 'pending' ? (
                  <button onClick={() => updateStatus(order.id, 'preparing')} className="w-full py-2.5 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#1E40AF] rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <StationIcon /> PREPARAR
                  </button>
                ) : (
                  <button onClick={() => updateStatus(order.id, 'ready')} className="w-full py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2">
                    <MdCheckCircle /> LISTO
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {orders.length === 0 && (
          <div className="col-span-full text-center py-20">
            <StationIcon className="text-6xl text-[#9CA3AF] mx-auto mb-4" />
            <p className="text-xl text-[#F9FAFB]">No hay pedidos pendientes en {isBar ? 'bar' : 'cocina'}</p>
            <p className="text-[#9CA3AF] mt-2">Los nuevos pedidos aparecerán aquí automáticamente</p>
          </div>
        )}
      </div>
    </div>
  );
}
