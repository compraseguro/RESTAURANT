import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, formatCurrency, formatDate } from '../../utils/api';
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

export default function DeliveryPanel() {
  const [orders, setOrders] = useState([]);
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
    const sortCreated = (x, y) => String(x.created_at || '').localeCompare(String(y.created_at || ''));
    a.sort(sortCreated);
    p.sort(sortCreated);
    c.sort((x, y) => String(x.delivery_driver_completed_at || '').localeCompare(String(y.delivery_driver_completed_at || '')));
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
        return `<tr><td style="padding:8px 6px;border-bottom:1px solid #e2e8f0">${name}</td><td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:12px">${pedido}</td><td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${total}</td></tr>`;
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
          <thead><tr><th>Cliente</th><th>Pedido</th><th>Costo</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="3" style="padding:12px;color:#94a3b8">Sin entregas completadas hoy</td></tr>'}</tbody>
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
      className="rounded-xl overflow-hidden bg-[#1F2937]/95 border border-[#3B82F6]/30 shadow-sm"
    >
      <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-[#3B82F6]/25 bg-[#111827]/50">
        <span className="font-bold text-[#F9FAFB] text-sm tabular-nums">#{o.order_number}</span>
        <div className="flex items-center gap-1 text-xs text-[#9CA3AF] shrink-0">
          <MdAccessTime className="text-sm" />
          <span>{getTimeDiffShort(o.created_at)}</span>
        </div>
      </div>
      <div className="px-3 py-2.5 space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <MdLocationOn className="text-[#93C5FD] mt-0.5 shrink-0 text-base" />
          <p className="text-[#F9FAFB] leading-snug">{o.delivery_address || 'Sin dirección'}</p>
        </div>
        <div className="flex items-center gap-2">
          <MdPhone className="text-[#93C5FD] shrink-0 text-base" />
          <p className="text-[#F9FAFB] font-medium">{o.customer_name || 'Cliente'}</p>
        </div>
        <p className="text-[#BFDBFE] font-bold">{formatCurrency(o.total)}</p>
        {o.notes ? (
          <p className="text-xs text-[#9CA3AF] bg-[#0f172A]/50 rounded-lg px-2 py-1.5 border border-[#3B82F6]/20">
            {o.notes}
          </p>
        ) : null}
        {o.items && o.items.length > 0 ? (
          <div className="pt-1 border-t border-[#3B82F6]/20">
            <p className="text-[10px] uppercase tracking-wide text-[#9CA3AF] mb-1">Productos</p>
            {o.items.map((it) => (
              <p key={it.id} className="text-xs text-[#E5E7EB]">
                {it.quantity}× {it.product_name}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      {(showIniciar || showListo) && (
        <div className="px-3 py-2.5 border-t border-[#3B82F6]/25">
          {showIniciar && (
            <button
              type="button"
              onClick={() => driverAction(o.id, 'start')}
              className="w-full py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white active:opacity-90"
            >
              INICIAR
            </button>
          )}
          {showListo && (
            <button
              type="button"
              onClick={() => driverAction(o.id, 'complete')}
              className="w-full py-2.5 rounded-lg font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white active:opacity-90"
            >
              LISTO
            </button>
          )}
        </div>
      )}
    </div>
  );

  const section = (title, count, children) => (
    <section className="mb-5">
      <h2 className="text-sm font-bold text-[#F9FAFB] tracking-wide uppercase mb-2 px-0.5 border-b border-[#3B82F6]/35 pb-1.5">
        {title}
        <span className="text-[#9CA3AF] font-semibold normal-case text-xs ml-1">({count})</span>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );

  return (
    <div className="min-h-screen bg-[#111827] text-[#F9FAFB] pb-safe">
      <header className="sticky top-0 z-30 bg-[#1F2937]/95 backdrop-blur-md border-b border-[#3B82F6]/30 px-3 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MdDeliveryDining className="text-2xl text-[#93C5FD] shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight truncate">Panel de Delivery</h1>
                <p className="text-xs text-[#9CA3AF] truncate">
                  {user?.username || user?.full_name} · {activos.length + enProceso.length} en bandeja
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <NotificationCenter />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canReturnToAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="flex-1 min-w-[8rem] px-2 py-2 bg-[#2563EB] rounded-lg text-white text-xs font-medium border border-[#3B82F6]/30"
              >
                Centro operativo
              </button>
            )}
            <button
              type="button"
              onClick={openEndShiftFlow}
              className="flex-1 min-w-[8rem] px-2 py-2 rounded-lg text-[#F9FAFB] text-xs font-medium border border-[#3B82F6]/35 bg-[#111827]/80 hover:bg-[#1F2937] inline-flex items-center justify-center gap-1"
            >
              <MdLogout className="text-base" /> Finalizar jornada
            </button>
          </div>
        </div>
      </header>

      <main className="px-3 pt-4 max-w-lg mx-auto w-full">
        <p className="text-center text-sm text-[#9CA3AF] mb-4">
          Fecha del día: <span className="text-[#E5E7EB] font-semibold">{formatDate(todayLocalYyyyMmDd())}</span>
        </p>

        {section(
          'Pedidos activos',
          activos.length,
          activos.length === 0 ? (
            <p className="text-sm text-[#9CA3AF] py-6 text-center border border-dashed border-[#3B82F6]/25 rounded-xl">Ninguno</p>
          ) : (
            activos.map((o) => renderCard(o, { showIniciar: true, showListo: false }))
          )
        )}

        {section(
          'Pedidos en proceso',
          enProceso.length,
          enProceso.length === 0 ? (
            <p className="text-sm text-[#9CA3AF] py-6 text-center border border-dashed border-[#3B82F6]/25 rounded-xl">Ninguno</p>
          ) : (
            enProceso.map((o) => renderCard(o, { showIniciar: false, showListo: true }))
          )
        )}

        {section(
          'Pedidos completados',
          completadosHoy.length,
          completadosHoy.length === 0 ? (
            <p className="text-sm text-[#9CA3AF] py-6 text-center border border-dashed border-[#3B82F6]/25 rounded-xl">Ninguno hoy</p>
          ) : (
            completadosHoy.map((o) => renderCard(o, { showIniciar: false, showListo: false }))
          )
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
