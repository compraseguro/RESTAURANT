import { useState, useEffect, useRef } from 'react';
import { api, ORDER_TYPES, formatTime, parseApiDate } from '../../utils/api';
import { buildKitchenTicketPlainText, buildSimpleComandaPlainText, orderHasTakeoutNote } from '../../utils/ticketPlainText';
import { shouldSendToNetworkPrinter } from '../../utils/networkPrinter';
import { getKitchenOrderNotesDisplay } from '../../utils/reservationKitchenNotes';
import { useSocket, useSocketEmit } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useAuth } from '../../context/AuthContext';
import EndShiftModal from '../../components/EndShiftModal';
import NotificationCenter from '../../components/NotificationCenter';
import { MdKitchen, MdLocalBar, MdLogout, MdRestaurant, MdDeliveryDining, MdTableBar, MdCheckCircle, MdAccessTime, MdPrint } from 'react-icons/md';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';

/** Pedido auto-pedido con cuenta de cliente (sin mesa física). */
function isCuentaClienteSelfOrder(order) {
  return String(order?.table_number || '') === 'Cliente' && String(order?.customer_id || '').trim() !== '';
}

/** Misma lógica que el servidor para decidir si un pedido va a bar o a cocina. */
function isBarItemClient(item) {
  if (String(item?.production_area || '').toLowerCase() === 'bar') return true;
  const name = String(item?.product_name || '').toLowerCase();
  return ['bar', 'bebida', 'bebidas', 'trago', 'tragos', 'coctel', 'cocteles', 'cocktail', 'cocktails'].some((t) =>
    name.includes(t)
  );
}
function isBarOnlyOrderClient(order) {
  const items = order?.items || [];
  if (!items.length) return false;
  return items.every(isBarItemClient);
}
/** @param {'cocina'|'bar'} st */
function orderAppliesToStation(order, st) {
  const barOnly = isBarOnlyOrderClient(order);
  if (st === 'bar') return barOnly;
  if (st === 'cocina') return !barOnly;
  return true;
}

export default function KitchenPanel({ station = 'cocina' }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [printConfig, setPrintConfig] = useState({ cocina: { width_mm: 80, copies: 1 }, bar: { width_mm: 80, copies: 1 } });
  const [restaurantInfo, setRestaurantInfo] = useState({ name: 'Resto-FADEY', address: '', phone: '' });
  const storageKeyAutoPrint = `resto_kitchen_auto_print_${station}`;
  const readAutoPrintPreference = () => {
    try {
      const raw = localStorage.getItem(storageKeyAutoPrint);
      if (raw === '0') return false;
      if (raw === '1') return true;
      return true; /* primera visita: impresión automática activa por defecto */
    } catch (_) {
      return true;
    }
  };
  const [autoPrint, setAutoPrint] = useState(() => readAutoPrintPreference());
  const autoPrintRef = useRef(false);
  const warnedSilentNoNetworkRef = useRef(false);
  useEffect(() => {
    autoPrintRef.current = autoPrint;
  }, [autoPrint]);
  useEffect(() => {
    setAutoPrint(readAutoPrintPreference());
  }, [storageKeyAutoPrint]);
  const { user } = useAuth();
  const [endShiftOpen, setEndShiftOpen] = useState(false);
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

  /**
   * @param {object[]} list
   * @param {string} title
   * @param {{ silent?: boolean }} opts silent: impresión automática (sin diálogo del navegador salvo fallback manual)
   */
  const printOrdersList = async (list, title, opts = {}) => {
    const { silent = false } = opts;
    if (!list?.length) {
      if (!silent) toast.error('No hay pedidos para imprimir');
      return;
    }
    /** Siempre refrescar: al llegar un pedido por socket a veces aún no cargó print-config y se caía al navegador. */
    let cfgPrinters = printConfig;
    let cfgRestaurant = restaurantInfo;
    try {
      const cfg = await api.get('/orders/print-config');
      if (cfg?.printers) {
        cfgPrinters = cfg.printers;
        setPrintConfig(cfg.printers);
      }
      if (cfg?.restaurant) {
        cfgRestaurant = cfg.restaurant;
        setRestaurantInfo(cfg.restaurant);
      }
    } catch (_) {
      /* usar estado previo */
    }
    const stationConfig = station === 'bar' ? cfgPrinters?.bar : cfgPrinters?.cocina;
    const width = [58, 80].includes(Number(stationConfig?.width_mm)) ? Number(stationConfig.width_mm) : 80;
    const copies = Math.min(5, Math.max(1, Number(stationConfig?.copies || 1)));
    const ticketWidth = width === 58 ? '54mm' : '76mm';
    const stationKey = isBar ? 'bar' : 'cocina';
    if (shouldSendToNetworkPrinter(stationConfig)) {
      const plain = buildKitchenTicketPlainText({
        restaurant: cfgRestaurant,
        title,
        orders: list,
        copies: 1,
      });
      try {
        await api.post('/orders/print-network', { station: stationKey, text: plain, copies });
        if (!silent) toast.success('Enviado a impresora de red');
        return;
      } catch (err) {
        const msg = err.message || 'No se pudo imprimir por red';
        if (silent) {
          toast.error(`Impresión automática: ${msg}`, { duration: 7000 });
          return;
        }
        toast.error(`${msg}; se abrirá el navegador`);
      }
    } else if (silent) {
      if (!warnedSilentNoNetworkRef.current) {
        warnedSilentNoNetworkRef.current = true;
        toast.error(
          'Impresión automática: no hay IP de impresora para esta estación. Configuración → Impresoras (activa, estación cocina o bar). El servidor Node debe estar en la misma red que la impresora.',
          { duration: 10000 }
        );
      }
      return;
    }
    const htmlRows = list.map((order) => {
      const orderTypeLabel = order.type === 'delivery' ? 'Delivery' : order.type === 'pickup' ? 'Recojo' : 'Mesa/Salón';
      const items = (order.items || [])
        .map(
          (item) =>
            `<li>${item.quantity}x ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}${item.notes ? ` - ${item.notes}` : ''}</li>`
        )
        .join('');
      const cliente = isCuentaClienteSelfOrder(order);
      const esc = (s) => String(s || '').replace(/</g, '');
      const timeSmall = `<span style="font-size:13px;font-weight:700">${formatTime(order.created_at)}</span>`;
      let header;
      if (cliente) {
        header = `<strong>${esc(order.customer_name)}</strong><br/><strong>#${order.order_number}</strong> - ${orderTypeLabel}<br/>${timeSmall}`;
      } else if (order.type === 'delivery') {
        header = `<strong>Delivery</strong><br/>${timeSmall}`;
      } else {
        const mesa = order.table_number ? ` - Mesa ${esc(order.table_number)}` : '';
        header = `<strong>#${order.order_number}</strong> - ${orderTypeLabel}${mesa}<br/>${timeSmall}`;
      }
      const paraLlevarBlock = orderHasTakeoutNote(order)
        ? `<div style="text-align:center;font-weight:800;font-size:17px;letter-spacing:0.08em;margin-top:6px;color:inherit;">PARA LLEVAR</div>`
        : '';
      return `
        <div class="ticket">
          ${header}
          ${paraLlevarBlock}
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
      if (!silent) toast.error('No se pudo abrir el documento de impresión');
      return;
    }
    doc.open();
    const repeatedRows = Array.from({ length: copies }).map((_, idx) => `
      <div style="margin-bottom:8px;">
        ${copies > 1 ? `<p style="margin:0 0 6px 0;font-size:12px;font-weight:700;">Copia ${idx + 1} de ${copies}</p>` : ''}
        ${htmlRows}
      </div>
    `).join('');

    doc.write(`
      <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: ${width}mm auto; margin: 2mm; }
          body { font-family: 'Courier New', Courier, monospace; width: ${ticketWidth}; max-width: 100%; margin: 0; font-size: 15px; line-height: 1.45; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .ticket { border-bottom: 1px dashed #999; padding-bottom: 8px; margin-bottom: 8px; }
          h2 { font-size: 19px; font-weight: 800; margin: 0 0 6px 0; letter-spacing: 0.02em; }
          ul { margin: 6px 0 0 12px; padding: 0; }
          li { margin-bottom: 2px; }
        </style>
      </head>
      <body>
        <h2>${cfgRestaurant?.name || 'Resto-FADEY'}</h2>
        <p style="margin:0;font-size:12px;">${cfgRestaurant?.address || ''}</p>
        <p style="margin:0 0 8px 0;font-size:12px;">${cfgRestaurant?.phone || ''}</p>
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

  /** Solo mesa (o delivery/cliente), ítems y fecha/hora — misma impresora de estación que la comanda completa. */
  const printSimpleComanda = async (order) => {
    if (!order?.id) return;
    let cfgPrinters = printConfig;
    try {
      const cfg = await api.get('/orders/print-config');
      if (cfg?.printers) {
        cfgPrinters = cfg.printers;
        setPrintConfig(cfg.printers);
      }
    } catch (_) {
      /* estado previo */
    }
    const stationConfig = station === 'bar' ? cfgPrinters?.bar : cfgPrinters?.cocina;
    const stationKey = isBar ? 'bar' : 'cocina';
    const plain = buildSimpleComandaPlainText(order);
    const copies = Math.min(5, Math.max(1, Number(stationConfig?.copies || 1)));
    if (shouldSendToNetworkPrinter(stationConfig)) {
      try {
        await api.post('/orders/print-network', { station: stationKey, text: plain, copies });
        toast.success('Enviado a impresora');
        return;
      } catch (err) {
        toast.error(err.message || 'No se pudo imprimir por red');
      }
    }
    const safe = plain.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const printWin = window.open('', '_blank', 'width=380,height=560');
    if (!printWin) {
      toast.error('Permita ventanas emergentes para imprimir');
      return;
    }
    printWin.document.write(`<!DOCTYPE html><html><head><title>Comanda #${order.order_number}</title>
      <style>body{font-family:'Courier New',Courier,monospace;padding:16px;font-size:14px;line-height:1.35;margin:0;color:#111}</style></head><body>
      <pre style="white-space:pre-wrap;margin:0">${safe}</pre>
      <script>window.print();window.onafterprint=function(){window.close()};</script>
      </body></html>`);
    printWin.document.close();
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
    api.get('/orders/print-config')
      .then((cfg) => {
        setPrintConfig(cfg?.printers || { cocina: { width_mm: 80, copies: 1 }, bar: { width_mm: 80, copies: 1 } });
        setRestaurantInfo(cfg?.restaurant || { name: 'Resto-FADEY', address: '', phone: '' });
      })
      .catch(() => {});
  }, [station]);

  const handleKitchenIncomingOrder = (order, toastLabel) => {
    loadOrders();
    playStationAlert();
    toast.success(`${toastLabel} #${order.order_number} (${isBar ? 'bar' : 'cocina'})`, { icon: '🔔', duration: 5000 });
    if (!order || !autoPrintRef.current) return;
    if (!orderAppliesToStation(order, station)) return;
    const items = order.items || [];
    if (!items.length) return;
    const titleBase = isBar ? 'Comandas de Bar' : 'Comandas de Cocina';
    const title = `${titleBase} · Automático · #${order.order_number}`;
    void printOrdersList([order], title, { silent: true });
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
              <button key={f.v} onClick={() => setFilter(f.v)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.v ? 'bg-[var(--ui-accent)] text-white' : 'bg-[var(--ui-surface-2)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)] border border-[color:var(--ui-border)]'}`}>{f.l}</button>
            ))}
          </div>
          <button
            type="button"
            title="Impresión automática al nuevo pedido. Requiere IP en Configuración → Impresoras; el envío lo hace el servidor por red (TCP), no el navegador."
            onClick={() => {
              const v = !autoPrint;
              setAutoPrint(v);
              try {
                localStorage.setItem(storageKeyAutoPrint, v ? '1' : '0');
              } catch (_) {
                /* noop */
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 ${
              autoPrint
                ? 'bg-[var(--ui-accent)] text-white shadow-sm'
                : 'bg-[var(--ui-surface-2)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)] border border-[color:var(--ui-border)]'
            }`}
          >
            <MdPrint className={`shrink-0 text-base ${autoPrint ? 'text-white' : 'text-[var(--ui-accent-muted)]'}`} />
            Automática
          </button>
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
