import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, formatCurrency, formatDate, labelDeliveryPaymentModality } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useAuth } from '../../context/AuthContext';
import EndShiftModal from '../../components/EndShiftModal';
import NotificationCenter from '../../components/NotificationCenter';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MdDeliveryDining,
  MdLogout,
  MdPhone,
  MdLocationOn,
  MdAccessTime,
  MdPrint,
} from 'react-icons/md';

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseApiDateLike(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZ = /Z$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const d = new Date(withZ);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameLocalCalendarDay(dateValue, ref = new Date()) {
  const d = parseApiDateLike(dateValue);
  if (!d) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function orderLinesSummary(order) {
  const items = order?.items || [];
  if (!items.length) return `Pedido #${order?.order_number ?? '—'}`;
  return items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ');
}

function getTimeDiffShort(created) {
  const d = parseApiDateLike(created);
  if (!d) return '—';
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (!Number.isFinite(diff) || diff < 1) return 'Ahora';
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

function todayLocalYyyyMmDd() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const TAB_KEYS = { activos: 'activos', proceso: 'proceso', completados: 'completados' };

export default function DeliveryPanel() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState(TAB_KEYS.activos);
  const { user } = useAuth();
  const [endShiftOpen, setEndShiftOpen] = useState(false);
  const [reportGateOpen, setReportGateOpen] = useState(false);
  const [reportPrintedConfirmed, setReportPrintedConfirmed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const canReturnToAdmin = user?.role === 'admin' && !location.pathname.startsWith('/admin');

  const loadData = useCallback(async () => {
    try {
      const data = await api.get('/orders?limit=500');
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useActiveInterval(loadData, 10000);

  useSocket('new-order', loadData);
  useSocket('order-update', loadData);
  useSocket('delivery-update', loadData);

  const uid = String(user?.id || '');

  const { activos, enProceso, completadosHoy } = useMemo(() => {
    const list = orders || [];
    const a = [];
    const p = [];
    const c = [];
    for (const o of list) {
      const started = String(o.delivery_driver_started_at || '').trim();
      const completed = String(o.delivery_driver_completed_at || '').trim();
      const routeDriver = String(o.delivery_route_driver_id || '');
      const unpaid = String(o.payment_status || '') !== 'paid';

      if (completed && routeDriver === uid && isSameLocalCalendarDay(completed)) {
        c.push(o);
        continue;
      }
      if (started && !completed && routeDriver === uid) {
        p.push(o);
        continue;
      }
      if (unpaid && !completed && (!started || routeDriver === uid)) {
        if (!started) {
          a.push(o);
        }
      }
    }
    const sortCreatedDesc = (x, y) => String(y.created_at || '').localeCompare(String(x.created_at || ''));
    const sortCompletedDesc = (x, y) =>
      String(y.delivery_driver_completed_at || '').localeCompare(String(x.delivery_driver_completed_at || ''));
    a.sort(sortCreatedDesc);
    p.sort(sortCreatedDesc);
    c.sort(sortCompletedDesc);
    return { activos: a, enProceso: p, completadosHoy: c };
  }, [orders, uid]);

  const driverAction = async (orderId, action) => {
    try {
      await api.post(`/orders/${orderId}/delivery-driver-action`, { action });
      toast.success(action === 'start' ? 'Pedido en proceso' : 'Pedido completado');
      loadData();
    } catch (err) {
      toast.error(err.message || 'No se pudo actualizar');
    }
  };

  const printCompletedReport = useCallback(() => {
    const todayLabel = formatDate(todayLocalYyyyMmDd()) || new Date().toLocaleDateString('es-PE');
    const rows = completadosHoy
      .map((o) => {
        const name = escHtml(o.customer_name || '—');
        const pedido = escHtml(orderLinesSummary(o));
        const total = formatCurrency(o.total || 0);
        const mod = escHtml(labelDeliveryPaymentModality(o.delivery_payment_modality) || '—');
        return `<tr><td style="padding:8px 6px;border-bottom:1px solid #e2e8f0">${name}</td><td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:12px">${pedido}</td><td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:12px;white-space:nowrap">${mod}</td><td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${total}</td></tr>`;
      })
      .join('');
    const sum = completadosHoy.reduce((s, o) => s + Number(o.total || 0), 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Reporte delivery</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:16px;max-width:640px;margin:0 auto;color:#0f172a}
        h1{font-size:18px;margin:0 0 4px 0}
        .d{font-size:13px;color:#64748b;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;padding:6px;border-bottom:2px solid #0f172a}
        .tot{margin-top:14px;font-size:15px;font-weight:700;text-align:right}
      </style></head><body>
        <h1>Pedidos completados (mi ruta)</h1>
        <p class="d">Fecha: ${escHtml(todayLabel)} · ${escHtml(user?.full_name || '')}</p>
        <table>
          <thead><tr><th>Cliente</th><th>Pedido</th><th>Modalidad de pago</th><th>Costo</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" style="padding:12px;color:#94a3b8">Sin entregas completadas hoy</td></tr>'}</tbody>
        </table>
        <p class="tot">Total: ${formatCurrency(sum)}</p>
        <script>window.print();window.onafterprint=function(){window.close()};</script>
      </body></html>`;
    const w = window.open('', '_blank', 'width=420,height=720');
    if (!w) {
      toast.error('Permita ventanas emergentes para imprimir');
      return;
    }
    w.document.write(html);
    w.document.close();
  }, [completadosHoy, user?.full_name]);

  const openEndShiftFlow = () => {
    setReportPrintedConfirmed(false);
    setReportGateOpen(true);
  };

  const continueToLogoutModal = () => {
    if (!reportPrintedConfirmed) {
      toast.error('Confirme que imprimió el reporte de pedidos completados');
      return;
    }
    setReportGateOpen(false);
    setEndShiftOpen(true);
  };

  const renderCard = (o, { showIniciar, showListo }) => (
    <div
      key={o.id}
      className="rounded-2xl overflow-hidden bg-[#1F2937]/95 border border-[#3B82F6]/35 shadow-md min-h-0"
    >
      <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 flex items-center justify-between gap-2 border-b border-[#3B82F6]/25 bg-[#111827]/50">
        <span className="font-bold text-[#F9FAFB] text-base sm:text-lg tabular-nums">#{o.order_number}</span>
        <div className="flex items-center gap-1 text-sm text-[#9CA3AF] shrink-0">
          <MdAccessTime className="text-lg" />
          <span>{getTimeDiffShort(o.created_at)}</span>
        </div>
      </div>
      <div className="px-3.5 py-3 sm:px-4 sm:py-4 space-y-2.5 text-base">
        <div className="flex items-start gap-2">
          <MdLocationOn className="text-[#93C5FD] mt-0.5 shrink-0 text-xl" />
          <p className="text-[#F9FAFB] leading-snug text-[15px] sm:text-base">{o.delivery_address || 'Sin dirección'}</p>
        </div>
        <div className="flex items-center gap-2">
          <MdPhone className="text-[#93C5FD] shrink-0 text-xl" />
          <p className="text-[#F9FAFB] font-semibold">{o.customer_name || 'Cliente'}</p>
        </div>
        <p className="text-[#BFDBFE] font-bold text-lg">{formatCurrency(o.total)}</p>
        <p className="text-sm text-[#E5E7EB]">
          <span className="text-[#9CA3AF]">Modalidad de pago:</span>{' '}
          <span className="font-semibold text-[#BFDBFE]">{labelDeliveryPaymentModality(o.delivery_payment_modality) || '—'}</span>
        </p>
        {o.notes ? (
          <p className="text-sm text-[#9CA3AF] bg-[#0f172A]/50 rounded-xl px-3 py-2 border border-[#3B82F6]/20">
            {o.notes}
          </p>
        ) : null}
        {o.items && o.items.length > 0 ? (
          <div className="pt-2 border-t border-[#3B82F6]/20">
            <p className="text-xs uppercase tracking-wide text-[#9CA3AF] mb-1.5 font-semibold">Productos</p>
            {o.items.map((it) => (
              <p key={it.id} className="text-sm text-[#E5E7EB] leading-relaxed">
                {it.quantity}× {it.product_name}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      {(showIniciar || showListo) && (
        <div className="px-3.5 py-3 sm:px-4 border-t border-[#3B82F6]/25">
          {showIniciar && (
            <button
              type="button"
              onClick={() => driverAction(o.id, 'start')}
              className="w-full min-h-[48px] py-3 rounded-xl font-bold text-base bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white active:opacity-90 touch-manipulation"
            >
              INICIAR
            </button>
          )}
          {showListo && (
            <button
              type="button"
              onClick={() => driverAction(o.id, 'complete')}
              className="w-full min-h-[48px] py-3 rounded-xl font-bold text-base bg-emerald-600 hover:bg-emerald-500 text-white active:opacity-90 touch-manipulation"
            >
              LISTO
            </button>
          )}
        </div>
      )}
    </div>
  );

  const displayedOrders =
    tab === TAB_KEYS.activos ? activos : tab === TAB_KEYS.proceso ? enProceso : completadosHoy;

  const tabCount = (k) =>
    k === TAB_KEYS.activos ? activos.length : k === TAB_KEYS.proceso ? enProceso.length : completadosHoy.length;

  const tabButton = (key, label, position) => {
    const selected = tab === key;
    const rounded =
      position === 'left' ? 'rounded-l-2xl' : position === 'right' ? 'rounded-r-2xl' : '';
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        className={`flex-1 min-h-[56px] sm:min-h-[60px] px-1 sm:px-2 py-2 text-center font-bold text-[11px] sm:text-sm leading-snug touch-manipulation transition-colors ${rounded} ${
          selected
            ? 'bg-[#2563EB] text-white shadow-inner z-10'
            : 'bg-[#111827]/90 text-[#E5E7EB] hover:bg-[#1F2937]'
        }`}
      >
        <span className="block hyphens-auto">{label}</span>
        <span className={`block text-[10px] sm:text-xs font-semibold mt-1 ${selected ? 'text-[#BFDBFE]' : 'text-[#9CA3AF]'}`}>
          ({tabCount(key)})
        </span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#111827] text-[#F9FAFB] pb-safe pb-28">
      <header className="sticky top-0 z-30 bg-[#1F2937]/95 backdrop-blur-md border-b border-[#3B82F6]/30 px-3 sm:px-4 pt-3 pb-3">
        <div className="flex flex-col gap-3 max-w-3xl mx-auto w-full">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MdDeliveryDining className="text-3xl sm:text-4xl text-[#93C5FD] shrink-0" />
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold leading-tight truncate">Panel de Delivery</h1>
                <p className="text-sm text-[#9CA3AF] truncate mt-0.5">
                  {user?.username || user?.full_name} · {activos.length + enProceso.length} en bandeja
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 pt-0.5">
              <NotificationCenter />
            </div>
          </div>

          <div className="flex w-full shadow-lg rounded-2xl overflow-hidden ring-1 ring-[#3B82F6]/25 divide-x divide-[#3B82F6]/35">
            {tabButton(TAB_KEYS.activos, 'Pedidos activos', 'left')}
            {tabButton(TAB_KEYS.proceso, 'Pedidos en proceso', 'middle')}
            {tabButton(TAB_KEYS.completados, 'Pedidos completados', 'right')}
          </div>
          <p className="text-[11px] sm:text-xs text-center text-[#64748B] -mt-1 px-1">
            Lista ordenada: los más recientes arriba; los más antiguos abajo en la cuadrícula.
          </p>

          <div className="flex flex-wrap gap-2">
            {canReturnToAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="flex-1 min-w-[10rem] min-h-[44px] px-3 py-2.5 bg-[#2563EB] rounded-xl text-white text-sm font-semibold border border-[#3B82F6]/30 touch-manipulation"
              >
                Centro operativo
              </button>
            )}
            <button
              type="button"
              onClick={openEndShiftFlow}
              className="flex-1 min-w-[10rem] min-h-[44px] px-3 py-2.5 rounded-xl text-[#F9FAFB] text-sm font-semibold border border-[#3B82F6]/35 bg-[#111827]/80 hover:bg-[#1F2937] inline-flex items-center justify-center gap-2 touch-manipulation"
            >
              <MdLogout className="text-xl shrink-0" /> Finalizar jornada
            </button>
          </div>
        </div>
      </header>

      <main className="px-3 sm:px-4 pt-4 pb-6 max-w-3xl mx-auto w-full">
        <p className="text-center text-base text-[#9CA3AF] mb-4">
          Fecha del día:{' '}
          <span className="text-[#E5E7EB] font-bold">{formatDate(todayLocalYyyyMmDd())}</span>
        </p>

        {displayedOrders.length === 0 ? (
          <p className="text-base text-[#9CA3AF] py-12 text-center border-2 border-dashed border-[#3B82F6]/30 rounded-2xl">
            {tab === TAB_KEYS.activos && 'No hay pedidos activos'}
            {tab === TAB_KEYS.proceso && 'No hay pedidos en proceso'}
            {tab === TAB_KEYS.completados && 'No hay pedidos completados hoy'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {displayedOrders.map((o) =>
              renderCard(o, {
                showIniciar: tab === TAB_KEYS.activos,
                showListo: tab === TAB_KEYS.proceso,
              })
            )}
          </div>
        )}
      </main>

      <Modal
        isOpen={reportGateOpen}
        onClose={() => setReportGateOpen(false)}
        title="Antes de finalizar la jornada"
        size="md"
        headerClassName="bg-[#1F2937] border-b border-[#3B82F6]/30"
        titleClassName="text-[#F9FAFB] font-bold"
      >
        <p className="text-sm text-[#9CA3AF] mb-3">
          Imprima el reporte de los pedidos que completó hoy en ruta (cliente, pedido y costo). El cobro en caja es independiente de este registro.
        </p>
        <p className="text-xs text-[#9CA3AF] mb-2">
          Completados hoy: <span className="text-[#E5E7EB] font-semibold">{completadosHoy.length}</span>
        </p>
        <button
          type="button"
          onClick={() => printCompletedReport()}
          className="w-full mb-4 py-2.5 rounded-lg font-medium text-sm bg-white text-slate-800 border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50"
        >
          <MdPrint className="text-lg" /> Imprimir reporte
        </button>
        <label className="flex items-start gap-2 text-sm text-[#E5E7EB] cursor-pointer mb-4">
          <input
            type="checkbox"
            className="mt-1 rounded border-[#3B82F6]/50"
            checked={reportPrintedConfirmed}
            onChange={(e) => setReportPrintedConfirmed(e.target.checked)}
          />
          <span>Confirmo que imprimí el reporte de pedidos completados (o no hay entregas completadas hoy).</span>
        </label>
        <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
          <button
            type="button"
            onClick={() => setReportGateOpen(false)}
            className="px-4 py-2 rounded-lg border border-[#3B82F6]/35 text-sm text-[#F9FAFB] hover:bg-[#1F2937]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={continueToLogoutModal}
            className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1D4ED8]"
          >
            Continuar al cierre de sesión
          </button>
        </div>
      </Modal>

      <EndShiftModal isOpen={endShiftOpen} onClose={() => setEndShiftOpen(false)} />
    </div>
  );
}
