import { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { api, formatCurrency, formatDateTime, parseApiDate, toLocalDateKey, PAYMENT_METHODS } from '../../utils/api';
import { buildKitchenTicketPlainText, orderHasTakeoutNote } from '../../utils/ticketPlainText';
import { shouldSendToNetworkPrinter } from '../../utils/networkPrinter';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { MdDateRange, MdKeyboardArrowDown, MdKitchen, MdLocalBar, MdDeliveryDining, MdPointOfSale, MdPrint, MdTableBar } from 'react-icons/md';

const PAYMENT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#06b6d4', '#a855f7'];
const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];
const toInputDate = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const getCurrentMonthRange = () => {
  const now = new Date();
  return {
    start: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toInputDate(now),
  };
};
const formatDateForLabel = (value) => {
  if (!value) return '-';
  const [y, m, d] = String(value).split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
};

/** 1 venta = 1 mesa (mismo table_number) o, sin mesa, 1 pedido (delivery / mostrador). */
function ventaMesaKey(order) {
  if (!order) return '';
  const t = String(order.table_number || '').trim();
  if (t) return `mesa:${t}`;
  return `pedido:${order.id || ''}`;
}

export default function Escritorio() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printConfig, setPrintConfig] = useState({ cocina: { width_mm: 80, copies: 1 }, bar: { width_mm: 80, copies: 1 } });
  const [restaurantInfo, setRestaurantInfo] = useState({ name: 'Resto-FADEY', address: '', phone: '' });
  const [datePreset, setDatePreset] = useState('month');
  const [startDate, setStartDate] = useState(getCurrentMonthRange().start);
  const [endDate, setEndDate] = useState(getCurrentMonthRange().end);
  const [datePickStep, setDatePickStep] = useState('idle');
  const [rankingMode, setRankingMode] = useState('dias');
  const startDateInputRef = useRef(null);
  const endDateInputRef = useRef(null);
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const allOrders = await api.get('/orders');
      setOrders(allOrders);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);
  useActiveInterval(loadData, 10000);

  useSocket('order-update', loadData);
  useEffect(() => {
    if (datePreset !== 'month') return;
    const monthRange = getCurrentMonthRange();
    setStartDate(monthRange.start);
    setEndDate(monthRange.end);
  }, [datePreset]);
  useEffect(() => {
    api.get('/orders/print-config')
      .then((cfg) => {
        setPrintConfig(cfg?.printers || { cocina: { width_mm: 80, copies: 1 }, bar: { width_mm: 80, copies: 1 } });
        setRestaurantInfo(cfg?.restaurant || { name: 'Resto-FADEY', address: '', phone: '' });
      })
      .catch(() => {});
  }, []);

  const scopedOrdersAll = useMemo(() => {
    const valid = [...orders];
    if (datePreset === 'total') return valid;
    const from = String(startDate || '');
    const to = String(endDate || '');
    if (!from || !to) return valid;
    return valid.filter((o) => {
      const dateKey = toLocalDateKey(o.updated_at || o.created_at);
      return dateKey >= from && dateKey <= to;
    });
  }, [orders, datePreset, startDate, endDate]);
  const scopedOrders = useMemo(
    () => scopedOrdersAll.filter(o => o.status !== 'cancelled'),
    [scopedOrdersAll]
  );
  const paidOrders = useMemo(
    () => scopedOrders.filter(o => o.payment_status === 'paid'),
    [scopedOrders]
  );
  const paidOrdersCount = useMemo(
    () => scopedOrdersAll.filter(o => o.status !== 'cancelled' && o.payment_status === 'paid').length,
    [scopedOrdersAll]
  );
  const pendingPaymentCount = useMemo(
    () => scopedOrdersAll.filter(o => o.status !== 'cancelled' && o.payment_status !== 'paid').length,
    [scopedOrdersAll]
  );
  const cancelledOrdersCount = useMemo(
    () => scopedOrdersAll.filter(o => o.status === 'cancelled').length,
    [scopedOrdersAll]
  );

  const hourlySales = useMemo(() => {
    const byHour = {};
    for (let h = 0; h < 24; h += 1) byHour[String(h).padStart(2, '0')] = 0;
    paidOrders.forEach((o) => {
      const parsed = parseApiDate(o.updated_at || o.created_at);
      if (!parsed) return;
      const hour = parsed.getHours();
      byHour[String(hour).padStart(2, '0')] += Number(o.total || 0);
    });
    return Object.entries(byHour).map(([hour, total]) => ({
      hour: `${hour}:00`,
      sales: Number(total.toFixed(2)),
    }));
  }, [paidOrders]);

  const peakHour = hourlySales.reduce((best, item) => item.sales > best.sales ? item : best, { hour: '--:--', sales: -1 });
  const lowHour = hourlySales.reduce((best, item) => item.sales < best.sales ? item : best, { hour: '--:--', sales: Number.MAX_VALUE });

  const salesByPayment = useMemo(() => {
    const map = { efectivo: 0, tarjeta: 0, yape: 0, plin: 0, online: 0 };
    paidOrders.forEach((o) => {
      const m = o.payment_method || 'efectivo';
      map[m] = (map[m] || 0) + Number(o.total || 0);
    });
    return map;
  }, [paidOrders]);

  const paymentPieData = useMemo(() => {
    const rows = [
      { name: PAYMENT_METHODS.efectivo, value: salesByPayment.efectivo || 0, key: 'efectivo' },
      { name: PAYMENT_METHODS.tarjeta, value: salesByPayment.tarjeta || 0, key: 'tarjeta' },
      { name: PAYMENT_METHODS.yape, value: salesByPayment.yape || 0, key: 'yape' },
      { name: PAYMENT_METHODS.plin, value: salesByPayment.plin || 0, key: 'plin' },
      { name: PAYMENT_METHODS.online, value: salesByPayment.online || 0, key: 'online' },
    ].filter((r) => r.value > 0);
    return rows;
  }, [salesByPayment]);

  const totalSales = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

  const pagoMasUsado = useMemo(() => {
    if (!paidOrders.length) return null;
    const countBy = {};
    paidOrders.forEach((o) => {
      const m = o.payment_method || 'efectivo';
      countBy[m] = (countBy[m] || 0) + 1;
    });
    let bestKey = null;
    let bestN = -1;
    Object.entries(countBy).forEach(([k, n]) => {
      if (n > bestN) {
        bestN = n;
        bestKey = k;
      }
    });
    if (!bestKey) return null;
    const monto = salesByPayment[bestKey] || 0;
    const share = totalSales > 0 ? (monto / totalSales) * 100 : 0;
    return {
      label: PAYMENT_METHODS[bestKey] || bestKey,
      operaciones: bestN,
      porcentajeMonto: share,
    };
  }, [paidOrders, salesByPayment, totalSales]);

  const totalVentasMesas = useMemo(
    () => new Set(scopedOrdersAll.filter((o) => o.status !== 'cancelled').map(ventaMesaKey)).size,
    [scopedOrdersAll]
  );
  /** Solo pedidos con mesa: una mesa = una venta en el periodo (sin delivery / mostrador). */
  const totalVentasPorMesa = useMemo(() => {
    const keys = new Set();
    scopedOrdersAll
      .filter((o) => o.status !== 'cancelled' && String(o.table_number || '').trim())
      .forEach((o) => {
        keys.add(ventaMesaKey(o));
      });
    return keys.size;
  }, [scopedOrdersAll]);
  /** Productos distintos con al menos una línea en pedidos cobrados del periodo. */
  const totalVentasPorProducto = useMemo(() => {
    const ids = new Set();
    paidOrders.forEach((o) => {
      (o.items || []).forEach((it) => {
        const key = String(it.product_id || it.product_name || '').trim();
        if (key) ids.add(key);
      });
    });
    return ids.size;
  }, [paidOrders]);
  const totalDiscounts = scopedOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
  const totalCredit = paidOrders
    .filter(o => o.payment_method === 'online')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);
  const parseHourToMinutes = (raw) => {
    const [h = '0', m = '0'] = String(raw || '').split(':');
    return (Number(h) * 60) + Number(m);
  };
  const isSaleInConfiguredSchedule = (order) => {
    const schedule = restaurantInfo?.schedule;
    if (!schedule || typeof schedule !== 'object') return true;
    const date = parseApiDate(order?.updated_at || order?.created_at);
    if (!date) return true;
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayMap[date.getDay()];
    const aliases = {
      sunday: ['sunday', 'domingo', 'dom'],
      monday: ['monday', 'lunes', 'lun'],
      tuesday: ['tuesday', 'martes', 'mar'],
      wednesday: ['wednesday', 'miercoles', 'miércoles', 'mie', 'mié'],
      thursday: ['thursday', 'jueves', 'jue'],
      friday: ['friday', 'viernes', 'vie'],
      saturday: ['saturday', 'sabado', 'sábado', 'sab', 'sáb'],
    };
    const cfg = (aliases[dayKey] || [])
      .map(k => schedule[k])
      .find(Boolean);
    if (!cfg) return true;
    if (cfg.enabled === false || Number(cfg.enabled) === 0) return false;
    const openMinutes = parseHourToMinutes(cfg.open || '00:00');
    const closeMinutes = parseHourToMinutes(cfg.close || '23:59');
    const currentMinutes = (date.getHours() * 60) + date.getMinutes();
    if (closeMinutes >= openMinutes) {
      return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    }
    return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
  };
  const paidOrdersInSchedule = useMemo(
    () => paidOrders.filter(isSaleInConfiguredSchedule),
    [paidOrders, restaurantInfo]
  );
  const topSalesData = useMemo(() => {
    const grouped = {};
    if (rankingMode === 'mesas') {
      paidOrdersInSchedule.forEach((o) => {
        const table = String(o.table_number || '').trim();
        if (!table) return;
        const key = `Mesa ${table}`;
        if (!grouped[key]) grouped[key] = { name: key, value: 0, orders: 0 };
        grouped[key].value += Number(o.total || 0);
        grouped[key].orders += 1;
      });
    } else {
      paidOrdersInSchedule.forEach((o) => {
        const date = parseApiDate(o.updated_at || o.created_at);
        if (!date) return;
        const label = date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
        if (!grouped[label]) grouped[label] = { name: label, value: 0, orders: 0 };
        grouped[label].value += Number(o.total || 0);
        grouped[label].orders += 1;
      });
    }
    return Object.values(grouped)
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      .slice(0, 6);
  }, [rankingMode, paidOrdersInSchedule]);

  const isBarItem = (item) => {
    if (String(item?.production_area || '').toLowerCase() === 'bar') return true;
    const text = `${item?.product_name || ''} ${item?.notes || ''}`.toLowerCase();
    return ['bar', 'bebida', 'bebidas', 'trago', 'tragos', 'coctel', 'cocteles', 'cocktail', 'cocktails'].some(token => text.includes(token));
  };
  const isBarOnlyOrder = (order) => {
    if (!Array.isArray(order?.items) || order.items.length === 0) return false;
    return order.items.every(isBarItem);
  };
  const kitchenQueue = useMemo(
    () => orders.filter(o => ['pending', 'preparing'].includes(o.status) && !isBarOnlyOrder(o)).length,
    [orders]
  );
  const barQueue = useMemo(
    () => orders.filter(o => ['pending', 'preparing'].includes(o.status) && isBarOnlyOrder(o)).length,
    [orders]
  );
  const deliveryReady = useMemo(
    () => orders.filter(o => o.type === 'delivery' && o.status === 'ready').length,
    [orders]
  );
  const salonActive = useMemo(
    () => orders.filter(o => o.type === 'dine_in' && ['pending', 'preparing', 'ready'].includes(o.status)).length,
    [orders]
  );
  const activeKitchenOrders = useMemo(
    () => orders.filter(o => ['pending', 'preparing'].includes(o.status) && !isBarOnlyOrder(o)),
    [orders]
  );
  const activeBarOrders = useMemo(
    () => orders.filter(o => ['pending', 'preparing'].includes(o.status) && isBarOnlyOrder(o)),
    [orders]
  );
  const getQueueLevel = (value) => {
    if (value >= 10) return { label: 'Crítico', pill: 'bg-red-100 text-red-700', card: 'border-red-300 bg-red-50 ring-1 ring-red-300' };
    if (value >= 5) return { label: 'Alto', pill: 'bg-amber-100 text-amber-700', card: 'border-amber-300 bg-amber-50' };
    return { label: 'Normal', pill: 'bg-emerald-100 text-emerald-700', card: 'border-emerald-200 bg-emerald-50' };
  };
  const printStationOrders = async (station, scope = 'all') => {
    const sourceBase = station === 'bar' ? activeBarOrders : activeKitchenOrders;
    const source = sourceBase.filter((order) => {
      if (scope === 'delivery') return order.type === 'delivery';
      if (scope === 'salon') return order.type === 'dine_in' || order.type === 'pickup';
      return true;
    });
    if (!source.length) return;
    const stationCfg = station === 'bar' ? printConfig?.bar : printConfig?.cocina;
    const width = [58, 80].includes(Number(stationCfg?.width_mm)) ? Number(stationCfg.width_mm) : 80;
    const copies = Math.min(5, Math.max(1, Number(stationCfg?.copies || 1)));
    const ticketWidth = width === 58 ? '54mm' : '76mm';
    const title = `${station === 'bar' ? 'Comandas pendientes - Bar' : 'Comandas pendientes - Cocina'} · ${scope === 'delivery' ? 'Delivery' : scope === 'salon' ? 'Mesas/Salón' : 'Todas'}`;
    const stationKey = station === 'bar' ? 'bar' : 'cocina';
    if (shouldSendToNetworkPrinter(stationCfg)) {
      const plain = buildKitchenTicketPlainText({
        restaurant: restaurantInfo,
        title,
        orders: source,
        copies: 1,
      });
      try {
        await api.post('/orders/print-network', { station: stationKey, text: plain, copies });
        toast.success('Enviado a impresora de red');
        return;
      } catch (err) {
        toast.error(err.message || 'No se pudo imprimir por red; se abrirá el navegador');
      }
    }
    const content = source.map(order => {
      const items = (order.items || []).map(item => `<li>${item.quantity}x ${item.product_name}${item.notes ? ` - ${item.notes}` : ''}</li>`).join('');
      const fechaLine = formatDateTime(order.updated_at || order.created_at);
      const paraLlevarBlock = orderHasTakeoutNote(order)
        ? `<div style="text-align:center;font-weight:bold;font-size:15px;letter-spacing:0.06em;margin-top:6px;">PARA LLEVAR</div>`
        : '';
      return `
        <div style="border:1px solid #d9d9d9;border-radius:8px;padding:10px;margin-bottom:8px;">
          <strong>#${order.order_number}</strong> - ${order.type}${order.table_number ? ` - Mesa ${order.table_number}` : ''}
          ${fechaLine ? `<div style="font-size:13px;font-weight:700;margin-top:4px;">${fechaLine}</div>` : ''}
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
      return;
    }
    doc.open();
    const repeated = Array.from({ length: copies }).map((_, idx) => (
      `${copies > 1 ? `<p style="margin:0 0 4px 0;font-size:10px;">Copia ${idx + 1} de ${copies}</p>` : ''}${content}`
    )).join('<div style="height:6px;"></div>');
    doc.write(`
      <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: ${width}mm auto; margin: 2mm; }
          body { font-family: 'Courier New', Courier, monospace; width: ${ticketWidth}; max-width: 100%; margin: 0; font-size: 15px; line-height: 1.45; font-weight: 600; }
          h2 { font-size: 19px; font-weight: 800; }
        </style>
      </head>
      <body>
        <h2 style="margin:0 0 6px 0;">${restaurantInfo?.name || 'Resto-FADEY'}</h2>
        <p style="margin:0;font-size:12px;">${restaurantInfo?.address || ''}</p>
        <p style="margin:0 0 8px 0;font-size:12px;">${restaurantInfo?.phone || ''}</p>
        <h2 style="margin:0 0 8px 0;">${title}</h2>
        ${repeated}
      </body>
      </html>
    `);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1000);
    }, 120);
  };

  const dateRangeLabel = datePreset === 'total'
    ? 'Total (desde inicio hasta hoy)'
    : `Del ${formatDateForLabel(startDate)} hasta ${formatDateForLabel(endDate)}`;
  const applyMonthRange = () => {
    const monthRange = getCurrentMonthRange();
    setDatePreset('month');
    setStartDate(monthRange.start);
    setEndDate(monthRange.end);
  };
  const openNativeDatePicker = (inputRef) => {
    const input = inputRef?.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.click();
  };
  const startRangeSelection = () => {
    setDatePickStep('start');
    setTimeout(() => openNativeDatePicker(startDateInputRef), 0);
  };
  const continueRangeSelection = () => {
    setDatePickStep('end');
    setTimeout(() => openNativeDatePicker(endDateInputRef), 0);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--ui-body-text)]">Centro Operativo</h3>
          <p className="text-xs text-[var(--ui-muted)]">Acceso rápido a módulos críticos</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/admin/cocina')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/admin/cocina'); }}
            className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${getQueueLevel(kitchenQueue).card}`}
          >
            <div className="flex items-center gap-2 text-amber-700 font-semibold"><MdKitchen /> Cocina</div>
            <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full ${getQueueLevel(kitchenQueue).pill}`}>{getQueueLevel(kitchenQueue).label}</span>
            <p className="text-2xl font-bold text-amber-800 mt-1">{kitchenQueue}</p>
            <p className="text-xs text-amber-700">Pedidos en cola</p>
            <div className="mt-2 flex items-center gap-3 text-xs text-amber-800">
              <button onClick={(e) => { e.stopPropagation(); printStationOrders('cocina', 'salon'); }} className="underline flex items-center gap-1"><MdPrint /> Mesas</button>
              <button onClick={(e) => { e.stopPropagation(); printStationOrders('cocina', 'delivery'); }} className="underline flex items-center gap-1"><MdPrint /> Delivery</button>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/admin/bar')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/admin/bar'); }}
            className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${getQueueLevel(barQueue).card}`}
          >
            <div className="flex items-center gap-2 text-indigo-700 font-semibold"><MdLocalBar /> Bar</div>
            <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full ${getQueueLevel(barQueue).pill}`}>{getQueueLevel(barQueue).label}</span>
            <p className="text-2xl font-bold text-indigo-800 mt-1">{barQueue}</p>
            <p className="text-xs text-indigo-700">Pedidos en cola</p>
            <div className="mt-2 flex items-center gap-3 text-xs text-indigo-800">
              <button onClick={(e) => { e.stopPropagation(); printStationOrders('bar', 'salon'); }} className="underline flex items-center gap-1"><MdPrint /> Mesas</button>
              <button onClick={(e) => { e.stopPropagation(); printStationOrders('bar', 'delivery'); }} className="underline flex items-center gap-1"><MdPrint /> Delivery</button>
            </div>
          </div>
          <button onClick={() => navigate('/admin/delivery')} className="text-left p-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold"><MdDeliveryDining /> Delivery</div>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{deliveryReady}</p>
            <p className="text-xs text-emerald-700">Pedidos listos para repartir</p>
          </button>
          <button onClick={() => navigate('/admin/mesas')} className="text-left p-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors">
            <div className="flex items-center gap-2 text-rose-700 font-semibold"><MdTableBar /> Mesas</div>
            <p className="text-2xl font-bold text-rose-800 mt-1">{salonActive}</p>
            <p className="text-xs text-rose-700">Pedidos activos en salón</p>
          </button>
          <button onClick={() => navigate('/admin/caja')} className="text-left p-3 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 transition-colors">
            <div className="flex items-center gap-2 text-sky-700 font-semibold"><MdPointOfSale /> Caja</div>
            <p className="text-2xl font-bold text-sky-800 mt-1">{paidOrders.length}</p>
            <p className="text-xs text-sky-700">Ventas cobradas ({datePreset === 'total' ? 'total' : 'rango'})</p>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        <button
          type="button"
          className="w-full rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-left flex items-center justify-between text-sm text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]"
        >
          Cantidad de ventas <MdKeyboardArrowDown className="text-[var(--ui-accent-muted)] shrink-0" />
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-left flex items-center justify-between text-sm text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]"
        >
          Caja: Caja 01 <MdKeyboardArrowDown className="text-[var(--ui-accent-muted)] shrink-0" />
        </button>
        <div className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-left text-sm flex flex-col gap-2">
          <div className="grid grid-cols-12 gap-2">
            <button
              type="button"
              onClick={startRangeSelection}
              className="col-span-7 rounded-md border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1.5 text-left hover:border-[var(--ui-accent-muted)] transition-colors"
            >
              <div className="flex items-center gap-2 text-[var(--ui-muted)] text-xs">
                <MdDateRange className="shrink-0 text-[var(--ui-accent-muted)]" />
                <span>{datePickStep === 'end' ? 'Selecciona FIN' : 'Selecciona INICIO'}</span>
                <MdKeyboardArrowDown className="ml-auto shrink-0 text-[var(--ui-accent-muted)]" />
              </div>
              <div className="mt-0.5 leading-snug text-[13px] font-medium text-[var(--ui-body-text)]">
                <div>{formatDateForLabel(startDate)}</div>
                <div>{datePreset === 'total' ? 'Hoy' : formatDateForLabel(endDate)}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                applyMonthRange();
                setDatePickStep('idle');
              }}
              className={`col-span-2 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                datePreset === 'month'
                  ? 'bg-[var(--ui-accent)] border-[var(--ui-accent)] text-white'
                  : 'bg-[var(--ui-surface-2)] border-[color:var(--ui-border)] text-[var(--ui-body-text)] hover:border-[var(--ui-accent-muted)]'
              }`}
            >
              Mes
            </button>
            <button
              type="button"
              onClick={() => {
                setDatePreset('total');
                setDatePickStep('idle');
              }}
              className={`col-span-3 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                datePreset === 'total'
                  ? 'bg-[var(--ui-accent)] border-[var(--ui-accent)] text-white'
                  : 'bg-[var(--ui-surface-2)] border-[color:var(--ui-border)] text-[var(--ui-body-text)] hover:border-[var(--ui-accent-muted)]'
              }`}
            >
              Todo
            </button>
            <input
              ref={startDateInputRef}
              type="date"
              value={startDate}
              onChange={(e) => {
                setDatePreset('custom');
                setStartDate(e.target.value);
                continueRangeSelection();
              }}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
            <input
              ref={endDateInputRef}
              type="date"
              value={endDate}
              onChange={(e) => {
                setDatePreset('custom');
                setEndDate(e.target.value);
                setDatePickStep('idle');
              }}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </div>
        <button
          type="button"
          className="w-full rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-left flex items-center justify-between text-sm text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]"
        >
          Local: Principal <MdKeyboardArrowDown className="text-[var(--ui-accent-muted)] shrink-0" />
        </button>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-2 min-w-0 self-start overflow-visible">
            <p className="text-xs text-[var(--ui-muted)]">Hora punta</p>
            <p className="text-3xl font-light text-[var(--ui-body-text)] leading-normal tabular-nums py-1 min-h-[2.5rem] flex items-center">
              {peakHour.hour}
            </p>
            <p className="text-xs text-[var(--ui-muted)] mt-3">Hora más libre</p>
            <p className="text-3xl font-light text-[var(--ui-body-text)] leading-normal tabular-nums py-1 min-h-[2.5rem] flex items-center">
              {lowHour.hour}
            </p>
          </div>

          <div className="xl:col-span-10">
            <h3 className="text-center text-[var(--ui-body-text)] mb-2 font-medium">
              Gráfico por cantidad de ventas / Dinero por ventas
            </h3>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={hourlySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-border)" strokeOpacity={0.55} />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--ui-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--ui-muted)' }} />
                <Tooltip
                  formatter={(v) => formatCurrency(v)}
                  contentStyle={{
                    background: 'var(--ui-surface-2)',
                    border: '1px solid var(--ui-border)',
                    borderRadius: '8px',
                    color: 'var(--ui-body-text)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  fill="#fcd34d"
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  name="Cantidad de ventas"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <p className="text-sm text-[var(--ui-muted)]">Ventas en efectivo (periodo)</p>
            <p className="text-4xl font-light text-[var(--ui-body-text)]">{formatCurrency(salesByPayment.efectivo)}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--ui-muted)]">Ventas con tarjeta (periodo)</p>
            <p className="text-4xl font-light text-[var(--ui-body-text)]">{formatCurrency(salesByPayment.tarjeta)}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--ui-muted)]">Ventas por Yape/Plin (periodo)</p>
            <p className="text-4xl font-light text-[var(--ui-body-text)]">{formatCurrency((salesByPayment.yape || 0) + (salesByPayment.plin || 0))}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--ui-muted)]">Total de Ventas (periodo)</p>
            <p className="text-4xl font-light text-[var(--ui-body-text)]">{formatCurrency(totalSales)}</p>
          </div>

          <div>
            <p className="text-sm text-[var(--ui-muted)]">Ventas al crédito</p>
            <p className="text-4xl font-light text-[var(--ui-body-text)]">{formatCurrency(totalCredit)}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--ui-muted)]">Total de egresos de caja</p>
            <p className="text-4xl font-light text-[var(--ui-body-text)]">S/ 0.00</p>
          </div>
          <div>
            <p className="text-sm text-[var(--ui-muted)]">Total de descuentos</p>
            <p className="text-4xl font-light text-[var(--ui-body-text)]">{formatCurrency(totalDiscounts)}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--ui-muted)]">Total de Ingreso Débito</p>
            <p className="text-4xl font-light text-[var(--ui-body-text)]">S/ 0.00</p>
          </div>
        </div>

        <div className="xl:col-span-4 card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-light text-[var(--ui-body-text)]">
              {rankingMode === 'dias' ? 'Top días con más ventas' : 'Top mesas que más venden'}
            </h3>
            <div className="inline-flex rounded-lg border border-[color:var(--ui-border)] overflow-hidden">
              <button
                type="button"
                onClick={() => setRankingMode('dias')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  rankingMode === 'dias' ? 'bg-[var(--ui-accent)] text-white' : 'bg-[var(--ui-surface-2)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]'
                }`}
              >
                Días
              </button>
              <button
                type="button"
                onClick={() => setRankingMode('mesas')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  rankingMode === 'mesas' ? 'bg-[var(--ui-accent)] text-white' : 'bg-[var(--ui-surface-2)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]'
                }`}
              >
                Mesas
              </button>
            </div>
          </div>
          {topSalesData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={topSalesData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={78}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {topSalesData.map((_, idx) => <Cell key={`rank-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatCurrency(v)}
                    contentStyle={{
                      background: 'var(--ui-surface-2)',
                      border: '1px solid var(--ui-border)',
                      borderRadius: '8px',
                      color: 'var(--ui-body-text)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-1 gap-1 mt-2">
                {topSalesData.map((item, idx) => (
                  <div key={`${item.name}-${idx}`} className="flex items-center justify-between text-xs border-b border-[color:var(--ui-border)] py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                      <span className="text-[var(--ui-body-text)] truncate">{item.name}</span>
                    </div>
                    <span className="font-semibold text-[var(--ui-body-text)]">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-[var(--ui-muted)]">
              Sin ventas en el rango y horario seleccionado.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="border-b border-[color:var(--ui-border)] pb-3 mb-3">
            <p className="text-sm text-[var(--ui-muted)]">Total de ventas por mesa</p>
            <p className="text-2xl font-light text-[var(--ui-body-text)]">{totalVentasPorMesa}</p>
            <p className="text-xs text-[var(--ui-muted)] mt-1">
              Una mesa con pedidos en el periodo = 1 venta (solo cuentan pedidos con mesa asignada).
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--ui-muted)]">Total de ventas por producto</p>
            <p className="text-2xl font-light text-[var(--ui-body-text)]">{totalVentasPorProducto}</p>
            <p className="text-xs text-[var(--ui-muted)] mt-1">
              Productos distintos con al menos una línea en pedidos <strong className="text-[var(--ui-body-text)]">cobrados</strong> en el
              periodo.
            </p>
          </div>
          <p className="text-xs text-[var(--ui-muted)] mt-3 pt-3 border-t border-[color:var(--ui-border)]">
            Pedidos — Cobradas: <strong className="text-[var(--ui-body-text)]">{paidOrdersCount}</strong> · Pendientes:{' '}
            <strong className="text-[var(--ui-body-text)]">{pendingPaymentCount}</strong> · Canceladas:{' '}
            <strong className="text-[var(--ui-body-text)]">{cancelledOrdersCount}</strong>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--ui-muted)]">Promedio de consumo por venta (mesa)</p>
          <p className="text-2xl font-light text-[var(--ui-body-text)]">
            {formatCurrency(totalVentasMesas ? totalSales / totalVentasMesas : 0)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--ui-muted)]">Clientes</p>
          <p className="text-2xl font-light text-[var(--ui-body-text)]">{scopedOrders.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-[var(--ui-muted)]">Por tipo de pago (monto)</p>
          {pagoMasUsado && (
            <p className="text-xs text-amber-700 mb-2 text-center">
              Más usado: <span className="font-semibold">{pagoMasUsado.label}</span> ({pagoMasUsado.operaciones}{' '}
              {pagoMasUsado.operaciones === 1 ? 'cobro' : 'cobros'} · {pagoMasUsado.porcentajeMonto.toFixed(0)}% del
              monto)
            </p>
          )}
          {paymentPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={168}>
              <PieChart>
                <Pie
                  data={paymentPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={52}
                  paddingAngle={2}
                  label={({ name, percent }) => (percent > 0.06 ? `${name} ${(percent * 100).toFixed(0)}%` : '')}
                >
                  {paymentPieData.map((row, i) => (
                    <Cell key={row.key} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} stroke="var(--ui-border)" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatCurrency(v)}
                  contentStyle={{
                    background: 'var(--ui-surface-2)',
                    border: '1px solid var(--ui-border)',
                    borderRadius: '8px',
                    color: 'var(--ui-body-text)',
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  wrapperStyle={{ color: 'var(--ui-body-text)' }}
                  formatter={(value, entry) => {
                    const v = entry?.payload?.value;
                    return `${value}: ${formatCurrency(v)}`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-[var(--ui-muted)] text-center py-6">Sin cobros en el periodo</p>
          )}
        </div>
      </div>
    </div>
  );
}
