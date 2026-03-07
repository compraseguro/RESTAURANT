import { useState, useEffect, useMemo } from 'react';
import { api, formatCurrency, parseApiDate, toLocalDateKey } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MdDateRange, MdKeyboardArrowDown, MdKitchen, MdLocalBar, MdDeliveryDining, MdPointOfSale, MdPrint, MdTableBar } from 'react-icons/md';

const PAYMENT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
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

export default function Escritorio() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printConfig, setPrintConfig] = useState({ cocina: { width_mm: 80, copies: 1 }, bar: { width_mm: 80, copies: 1 } });
  const [restaurantInfo, setRestaurantInfo] = useState({ name: 'Resto-FADEY', address: '', phone: '' });
  const [datePreset, setDatePreset] = useState('month');
  const [startDate, setStartDate] = useState(getCurrentMonthRange().start);
  const [endDate, setEndDate] = useState(getCurrentMonthRange().end);
  const [showDatePicker, setShowDatePicker] = useState(false);
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
      const dateKey = toLocalDateKey(o.created_at);
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
      const parsed = parseApiDate(o.created_at);
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
    const map = {
      efectivo: 0,
      tarjeta: 0,
      yape: 0,
      plin: 0,
    };
    paidOrders.forEach((o) => {
      map[o.payment_method] = (map[o.payment_method] || 0) + Number(o.total || 0);
    });
    return map;
  }, [paidOrders]);

  const totalSales = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const totalDiscounts = scopedOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
  const totalCredit = paidOrders
    .filter(o => o.payment_method === 'online')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  const isBarItem = (item) => {
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
  const printStationOrders = (station, scope = 'all') => {
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
    const ticketWidth = width === 58 ? '50mm' : '72mm';
    const title = `${station === 'bar' ? 'Comandas pendientes - Bar' : 'Comandas pendientes - Cocina'} · ${scope === 'delivery' ? 'Delivery' : scope === 'salon' ? 'Mesas/Salón' : 'Todas'}`;
    const content = source.map(order => {
      const items = (order.items || []).map(item => `<li>${item.quantity}x ${item.product_name}${item.notes ? ` - ${item.notes}` : ''}</li>`).join('');
      return `
        <div style="border:1px solid #d9d9d9;border-radius:8px;padding:10px;margin-bottom:8px;">
          <strong>#${order.order_number}</strong> - ${order.type}${order.table_number ? ` - Mesa ${order.table_number}` : ''}
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
          @page { size: ${width}mm auto; margin: 3mm; }
          body { font-family: 'Courier New', monospace; width: ${ticketWidth}; margin: 0; font-size: 11px; line-height: 1.3; }
        </style>
      </head>
      <body>
        <h2 style="margin:0 0 4px 0;">${restaurantInfo?.name || 'Resto-FADEY'}</h2>
        <p style="margin:0;font-size:10px;">${restaurantInfo?.address || ''}</p>
        <p style="margin:0 0 6px 0;font-size:10px;">${restaurantInfo?.phone || ''}</p>
        <h2 style="margin:0 0 6px 0;">${title}</h2>
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-800">Centro Operativo</h3>
          <p className="text-xs text-slate-500">Acceso rápido a módulos críticos</p>
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
        <button className="input-field text-left flex items-center justify-between text-sm text-slate-600">
          Cantidad de ventas <MdKeyboardArrowDown />
        </button>
        <button className="input-field text-left flex items-center justify-between text-sm text-slate-600">
          Caja: Caja 01 <MdKeyboardArrowDown />
        </button>
        <div className="input-field text-left text-sm text-slate-600 flex flex-col gap-2">
          <div className="grid grid-cols-12 gap-2">
            <button
              type="button"
              onClick={() => setShowDatePicker(prev => !prev)}
              className="col-span-7 rounded-md border border-slate-300 bg-white/70 px-2 py-1.5 text-left hover:border-[#3B82F6] transition-colors"
            >
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <MdDateRange />
                <span>Rango de fechas</span>
                <MdKeyboardArrowDown className={`ml-auto transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
              </div>
              <div className="mt-0.5 leading-tight text-[13px] font-medium text-slate-700">
                <div>{formatDateForLabel(startDate)}</div>
                <div>{datePreset === 'total' ? 'Hoy' : formatDateForLabel(endDate)}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                applyMonthRange();
                setShowDatePicker(false);
              }}
              className={`col-span-2 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                datePreset === 'month'
                  ? 'bg-[#DBEAFE] border-[#3B82F6] text-[#1D4ED8]'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-[#3B82F6] hover:text-[#2563EB]'
              }`}
            >
              Mes
            </button>
            <button
              type="button"
              onClick={() => {
                setDatePreset('total');
                setShowDatePicker(false);
              }}
              className={`col-span-3 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                datePreset === 'total'
                  ? 'bg-[#2563EB] border-[#2563EB] text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-[#3B82F6] hover:text-[#2563EB]'
              }`}
            >
              Todo
            </button>
          </div>
          {showDatePicker && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] font-semibold text-[#3B82F6] mb-1">INICIO</p>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setStartDate(e.target.value);
                  }}
                  className="w-full rounded-md border border-[#3B82F6]/60 bg-[#EFF6FF] px-2 py-1 text-xs text-slate-700 focus:border-[#2563EB] focus:ring-2 focus:ring-[#3B82F6]/25"
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[#3B82F6] mb-1">FIN</p>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setEndDate(e.target.value);
                  }}
                  className="w-full rounded-md border border-[#3B82F6]/60 bg-[#EFF6FF] px-2 py-1 text-xs text-slate-700 focus:border-[#2563EB] focus:ring-2 focus:ring-[#3B82F6]/25"
                />
              </div>
            </div>
          )}
        </div>
        <button className="input-field text-left flex items-center justify-between text-sm text-slate-600">
          Local: Principal <MdKeyboardArrowDown />
        </button>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-2">
            <p className="text-xs text-slate-500">Hora punta</p>
            <p className="text-3xl font-light text-slate-700">{peakHour.hour}</p>
            <p className="text-xs text-slate-500 mt-3">Hora más libre</p>
            <p className="text-3xl font-light text-slate-700">{lowHour.hour}</p>
          </div>

          <div className="xl:col-span-10">
            <h3 className="text-center text-slate-600 mb-2">
              Gráfico por cantidad de ventas / Dinero por ventas
            </h3>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={hourlySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
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
            <p className="text-sm text-slate-500">Ventas en efectivo</p>
            <p className="text-4xl font-light text-slate-700">{formatCurrency(salesByPayment.efectivo)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Ventas con tarjeta</p>
            <p className="text-4xl font-light text-slate-700">{formatCurrency(salesByPayment.tarjeta)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Ventas por Yape/Plin</p>
            <p className="text-4xl font-light text-slate-700">{formatCurrency((salesByPayment.yape || 0) + (salesByPayment.plin || 0))}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total de Ventas</p>
            <p className="text-4xl font-light text-slate-700">{formatCurrency(totalSales)}</p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Ventas al crédito</p>
            <p className="text-4xl font-light text-slate-700">{formatCurrency(totalCredit)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total de egresos de caja</p>
            <p className="text-4xl font-light text-slate-700">S/ 0.00</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total de descuentos</p>
            <p className="text-4xl font-light text-slate-700">{formatCurrency(totalDiscounts)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total de Ingreso Débito</p>
            <p className="text-4xl font-light text-slate-700">S/ 0.00</p>
          </div>
        </div>

        <div className="xl:col-span-4 card p-4">
          <h3 className="text-xl font-light text-slate-700 mb-3">Resumen de ingresos</h3>
          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Ingreso total por ventas</p>
              <p className="text-xl font-bold text-emerald-800">{formatCurrency(totalSales)}</p>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs text-violet-700">Ingreso total al crédito</p>
              <p className="text-xl font-bold text-violet-800">{formatCurrency(totalCredit)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                <p className="text-[11px] text-sky-700">Ingresos en efectivo</p>
                <p className="text-sm font-bold text-sky-800">{formatCurrency(salesByPayment.efectivo)}</p>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-[11px] text-indigo-700">Ingresos digitales</p>
                <p className="text-sm font-bold text-indigo-800">{formatCurrency((salesByPayment.tarjeta || 0) + (salesByPayment.yape || 0) + (salesByPayment.plin || 0))}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                <p className="text-[10px] text-slate-500">Cobradas</p>
                <p className="text-sm font-bold text-slate-800">{paidOrdersCount}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
                <p className="text-[10px] text-amber-600">Pendientes</p>
                <p className="text-sm font-bold text-amber-700">{pendingPaymentCount}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-center">
                <p className="text-[10px] text-red-600">Canceladas</p>
                <p className="text-sm font-bold text-red-700">{cancelledOrdersCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Total ventas (pedidos)</p>
          <p className="text-2xl font-light text-slate-700">{scopedOrdersAll.length}</p>
          <p className="text-xs text-slate-500 mt-2">
            Cobradas: <strong>{paidOrdersCount}</strong> · Pendientes: <strong>{pendingPaymentCount}</strong> · Canceladas: <strong>{cancelledOrdersCount}</strong>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Promedio de consumo por venta y por persona</p>
          <p className="text-2xl font-light text-slate-700">
            {formatCurrency(paidOrders.length ? totalSales / paidOrders.length : 0)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Clientes</p>
          <p className="text-2xl font-light text-slate-700">{scopedOrders.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Por tipo de pago</p>
          <ResponsiveContainer width="100%" height={90}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Efectivo', value: salesByPayment.efectivo || 0 },
                  { name: 'Tarjeta', value: salesByPayment.tarjeta || 0 },
                  { name: 'Yape', value: salesByPayment.yape || 0 },
                  { name: 'Plin', value: salesByPayment.plin || 0 },
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={35}
              >
                {PAYMENT_COLORS.map((c) => <Cell key={c} fill={c} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
