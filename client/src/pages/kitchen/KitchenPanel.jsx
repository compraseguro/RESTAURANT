import { useState, useEffect } from 'react';
import { api, ORDER_TYPES, formatTime, parseApiDate } from '../../utils/api';
import { buildSimpleComandaPlainText } from '../../utils/ticketPlainText';
import { sendEscPosToStation } from '../../utils/cajaThermalPrint';
import { orderAppliesToStation } from '../../utils/stationKitchenPrint';
import { getKitchenOrderNotesDisplay } from '../../utils/reservationKitchenNotes';
import { useSocket, useSocketEmit } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useAuth } from '../../context/AuthContext';
import EndShiftModal from '../../components/EndShiftModal';
import NotificationCenter from '../../components/NotificationCenter';
import Modal from '../../components/Modal';
import StationPrinterCard from '../../components/StationPrinterCard';
import { MdKitchen, MdLocalBar, MdLogout, MdRestaurant, MdDeliveryDining, MdTableBar, MdCheckCircle, MdAccessTime, MdPrint } from 'react-icons/md';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';

/** Pedido auto-pedido con cuenta de cliente (sin mesa física). */
function isCuentaClienteSelfOrder(order) {
  return String(order?.table_number || '') === 'Cliente' && String(order?.customer_id || '').trim() !== '';
}

export default function KitchenPanel({ station = 'cocina' }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [restaurantInfo, setRestaurantInfo] = useState({ name: 'Resto-FADEY', address: '', phone: '' });
  const { user } = useAuth();
  const [endShiftOpen, setEndShiftOpen] = useState(false);
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
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

  /** Reimpresión manual de comanda (auto la hace el servidor al crear/actualizar líneas). */
  const printSimpleComanda = async (order) => {
    if (!order?.id) return;
    const stationKey = isBar ? 'bar' : 'cocina';
    let widthMm = 80;
    let copies = 1;
    try {
      const pc = await api.get('/printing/config');
      const s = pc[stationKey];
      if (s) {
        widthMm = [58, 80].includes(Number(s.widthMm)) ? Number(s.widthMm) : 80;
        copies = Math.min(5, Math.max(1, Number(s.copies || 1)));
      }
    } catch (_) {
      /* default */
    }
    const plain = buildSimpleComandaPlainText(order, new Date(), widthMm);
    const thermal = await sendEscPosToStation({
      station: stationKey,
      text: plain,
      copies,
      width_mm: widthMm,
    });
    if (thermal.ok) {
      toast.success('Enviado a impresora térmica');
      return;
    }
    toast.error(thermal.error || 'Revise Impresora en el menú y la configuración en el servidor (Windows + térmica).');
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
  }, [filter, station]);
  useActiveInterval(loadOrders, 10000);

  useEffect(() => {
    api
      .get('/orders/print-config')
      .then((cfg) => {
        setRestaurantInfo(cfg?.restaurant || { name: 'Resto-FADEY', address: '', phone: '' });
      })
      .catch(() => {});
  }, [station]);

  const handleKitchenIncomingOrder = (order, toastLabel) => {
    loadOrders();
    playStationAlert();
    toast.success(`${toastLabel} #${order.order_number} (${isBar ? 'bar' : 'cocina'})`, { icon: '🔔', duration: 5000 });
    if (!order) return;
    if (!orderAppliesToStation(order, station)) return;
    const items = order.items || [];
    if (!items.length) return;
    /* Impresión automática: servidor (Print Bridge) en orderPrintHooks */
  };

  useSocket('new-order', (order) => handleKitchenIncomingOrder(order, 'Nuevo pedido'));
  /** Mesa/salón: ítems nuevos van por PUT /orders/:id/lines — antes no había evento para imprimir en cocina. */
  useSocket('order-lines-updated', (order) => handleKitchenIncomingOrder(order, 'Comanda actualizada'));

  useSocket('order-update', () => loadOrders());

  const updateStatus = async (orderId, status) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status });
      toast.success(status === 'preparing' ? 'Marcado en preparación' : 'Marcado como listo');
      loadOrders();
    } catch (err) { toast.error(err.message); }
  };

  const KITCHEN_OVERDUE_MS = 15 * 60 * 1000;

  const getTimeDiff = (created) => {
    const d = parseApiDate(created);
    if (!d) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return 'Ahora';
    if (diff < 60) return `${diff} min`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  const isKitchenOrderOverdue = (created) => {
    const d = parseApiDate(created);
    if (!d) return false;
    return Date.now() - d.getTime() >= KITCHEN_OVERDUE_MS;
  };

  const typeIcons = { dine_in: MdTableBar, delivery: MdDeliveryDining, pickup: MdRestaurant };

  return (
    <div className="min-h-screen bg-[var(--ui-body-bg)] text-[var(--ui-body-text)]">
      <header className="bg-[var(--ui-surface)] backdrop-blur-xl border-b border-[color:var(--ui-border)] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StationIcon className="text-3xl text-[var(--ui-body-text)]" />
          <div>
            <h1 className="text-xl font-bold">{panelTitle}</h1>
            <p className="text-[var(--ui-muted)] text-sm">{orders.length} pedidos activos</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[{ v: 'all', l: 'Todos' }, { v: 'dine_in', l: 'Mesas' }, { v: 'delivery', l: 'Delivery' }].map(f => (
              <button
                key={f.v}
                type="button"
                onClick={() => setFilter(f.v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${filter === f.v ? 'bg-[var(--ui-accent)] text-white' : 'bg-[var(--ui-surface-2)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)] border border-[color:var(--ui-border)]'}`}
              >
                {f.v === 'delivery' ? <MdDeliveryDining className="text-base shrink-0" /> : null}
                {f.l}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPrinterModalOpen(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--ui-surface-2)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)] border border-[color:var(--ui-border)] inline-flex items-center justify-center gap-1.5"
            >
              <MdPrint className="text-base shrink-0" />
              Impresora
            </button>
          </div>
          {canReturnToAdmin && (
            <button onClick={() => navigate('/admin')} className="px-3 py-2 bg-[var(--ui-accent)] hover:bg-[var(--ui-accent-hover)] rounded-lg text-white border border-[color:var(--ui-border)] text-sm font-medium">
              Volver al Centro Operativo
            </button>
          )}
          <NotificationCenter />
          <button type="button" onClick={() => setEndShiftOpen(true)} className="px-3 py-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-[var(--ui-muted)] hover:text-[var(--ui-body-text)] border border-[color:var(--ui-border)] text-sm font-medium inline-flex items-center gap-2">
            <MdLogout className="text-lg" /> Finalizar jornada
          </button>
        </div>
      </header>
      <EndShiftModal isOpen={endShiftOpen} onClose={() => setEndShiftOpen(false)} />

      <Modal
        isOpen={printerModalOpen}
        onClose={() => setPrinterModalOpen(false)}
        title={isBar ? 'Impresora de bar' : 'Impresora de cocina'}
        size="lg"
      >
        <StationPrinterCard station={isBar ? 'bar' : 'cocina'} userRole={user?.role} hideHeading embedded />
      </Modal>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orders.map(order => {
          const TypeIcon = typeIcons[order.type] || MdRestaurant;
          const isOverdue = !isBar && isKitchenOrderOverdue(order.created_at);

          const cuentaCliente = isCuentaClienteSelfOrder(order);
          const cardBorder = isOverdue
            ? order.status === 'pending'
              ? 'border-2 border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.22)]'
              : 'border-2 border-red-500/75'
            : order.status === 'pending'
              ? 'border-2 border-[color:color-mix(in_srgb,var(--ui-accent-muted)_55%,transparent)]'
              : 'border border-[color:var(--ui-border)]';
          const cardBg = 'bg-[var(--ui-surface)]';
          const headerBg = isOverdue
            ? order.status === 'pending'
              ? 'bg-red-950/55'
              : 'bg-red-950/40'
            : order.status === 'pending'
              ? 'bg-[var(--ui-sidebar-active-bg)]'
              : 'bg-[var(--ui-surface-2)]';

          return (
            <div key={order.id} className={`rounded-xl overflow-hidden backdrop-blur-xl ${cardBg} ${cardBorder} ${isOverdue ? 'ring-2 ring-red-500/45' : ''}`}>
              <div className={`px-4 py-3 ${headerBg}`}>
                {cuentaCliente ? (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold leading-tight text-[var(--ui-body-text)]" title={order.customer_name}>
                        {order.customer_name || 'Cliente'}
                      </p>
                      <p className="mt-1 text-xs text-[var(--ui-muted)]">Pedido #{order.order_number}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-sm">
                      <MdAccessTime className={isOverdue ? 'text-red-400' : 'text-[var(--ui-muted)]'} />
                      <span className={isOverdue ? 'font-bold text-red-300' : 'text-[var(--ui-muted)]'}>{getTimeDiff(order.created_at)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {order.type === 'delivery' ? (
                        <span className="text-lg font-bold tracking-tight text-[var(--ui-body-text)]">Delivery</span>
                      ) : (
                        <span className="text-lg font-bold text-[var(--ui-body-text)]">#{order.order_number}</span>
                      )}
                      <TypeIcon className="text-xl shrink-0 text-[var(--ui-body-text)]" />
                      {order.table_number ? (
                        <span className="rounded border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-0.5 text-sm text-[var(--ui-body-text)]">Mesa {order.table_number}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 text-sm">
                      <MdAccessTime className={isOverdue ? 'text-red-400' : 'text-[var(--ui-muted)]'} />
                      <span className={isOverdue ? 'font-bold text-red-300' : 'text-[var(--ui-muted)]'}>{getTimeDiff(order.created_at)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 px-4 py-3">
                {order.items?.map(item => (
                  <div key={item.id} className="flex items-start gap-2">
                    <span className="bg-[var(--ui-surface-2)] border border-[color:var(--ui-border)] text-[var(--ui-body-text)] w-6 h-6 rounded flex items-center justify-center text-sm font-bold flex-shrink-0">{item.quantity}</span>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-[var(--ui-body-text)]">{item.product_name}</p>
                      {item.variant_name && <p className="text-xs text-[var(--ui-muted)]">{item.variant_name}</p>}
                      {item.notes && <p className="text-xs text-[var(--ui-muted)] italic">{item.notes}</p>}
                    </div>
                  </div>
                ))}
                {(() => {
                  const noteBlock = getKitchenOrderNotesDisplay(order);
                  if (!noteBlock) return null;
                  return (
                    <div className="bg-[var(--ui-surface-2)] border border-[color:var(--ui-border)] rounded-lg p-2 mt-2">
                      <p className="text-xs text-[var(--ui-body-text)] whitespace-pre-line leading-relaxed">{noteBlock}</p>
                    </div>
                  );
                })()}
              </div>

              <div className="px-4 py-3 border-t border-[color:var(--ui-border)]">
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    title="Imprimir comanda"
                    aria-label="Imprimir comanda"
                    onClick={() => void printSimpleComanda(order)}
                    className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] hover:bg-[var(--ui-sidebar-hover)] transition-colors"
                  >
                    <MdPrint className="text-xl text-[var(--ui-accent-muted)]" />
                  </button>
                  {order.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(order.id, 'preparing')}
                      className="flex-1 min-w-0 py-2.5 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#1E40AF] rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2"
                    >
                      <StationIcon /> PREPARAR
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateStatus(order.id, 'ready')}
                      className="flex-1 min-w-0 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <MdCheckCircle /> LISTO
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {orders.length === 0 && (
          <div className="col-span-full text-center py-20">
            <StationIcon className="text-6xl text-[var(--ui-muted)] mx-auto mb-4" />
            <p className="text-xl text-[var(--ui-body-text)]">No hay pedidos pendientes en {isBar ? 'bar' : 'cocina'}</p>
            <p className="text-[var(--ui-muted)] mt-2">Los nuevos pedidos aparecerán aquí automáticamente</p>
          </div>
        )}
      </div>
    </div>
  );
}
