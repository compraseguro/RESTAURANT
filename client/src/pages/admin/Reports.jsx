import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, formatCurrency, PAYMENT_METHODS, resolveMediaUrl } from '../../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { MdCalendarToday, MdCalendarMonth, MdEmojiEvents, MdTrendingUp, MdReceipt, MdAttachMoney, MdVisibility, MdRefresh, MdPointOfSale, MdDownload, MdShoppingCart } from 'react-icons/md';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';

const COLORS = ['#f04438', '#ffa520', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316'];
const DENOMINATION_LABELS = {
  b200: 'Billete S/200',
  b100: 'Billete S/100',
  b50: 'Billete S/50',
  b20: 'Billete S/20',
  b10: 'Billete S/10',
  m5: 'Moneda S/5',
  m2: 'Moneda S/2',
  m1: 'Moneda S/1',
  c50: 'Moneda S/0.50',
};
const formatDateTime = (dateValue) => {
  if (!dateValue) return '-';
  return new Date(`${dateValue}`.includes('T') ? dateValue : `${dateValue}Z`)
    .toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function Reports() {
  const [searchParams] = useSearchParams();
  const [reportSection, setReportSection] = useState('ventas');
  const [tab, setTab] = useState('daily');
  const [dailyData, setDailyData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [rankingPeriod, setRankingPeriod] = useState('month');
  const [purchaseExpenses, setPurchaseExpenses] = useState([]);
  const [inventoryReconciliations, setInventoryReconciliations] = useState([]);
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [billingDocuments, setBillingDocuments] = useState([]);
  const [billingStatusFilter, setBillingStatusFilter] = useState('all');
  const [billingTypeFilter, setBillingTypeFilter] = useState('all');
  const [billingSearch, setBillingSearch] = useState('');
  const [retryingDocId, setRetryingDocId] = useState('');
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [billingPdfPreview, setBillingPdfPreview] = useState(null);
  const [selectedClosedRegister, setSelectedClosedRegister] = useState(null);
  const [loadingClosedRegister, setLoadingClosedRegister] = useState(false);
  const [productoInformeDetail, setProductoInformeDetail] = useState(null);
  const [productoInformeLoading, setProductoInformeLoading] = useState(false);
  const [productoInformeRegisterId, setProductoInformeRegisterId] = useState('');
  const [loading, setLoading] = useState(true);

  const loadDaily = () => api.get('/reports/daily').then(setDailyData).catch(console.error);
  const loadMonthly = () => api.get('/reports/monthly').then(setMonthlyData).catch(console.error);
  const loadRanking = (period) => api.get(`/reports/ranking?period=${period}`).then(setRanking).catch(console.error);
  const loadBillingDocuments = async ({
    status = billingStatusFilter,
    docType = billingTypeFilter,
    search = billingSearch,
  } = {}) => {
    const params = new URLSearchParams();
    params.set('limit', '150');
    if (status && status !== 'all') params.set('status', status);
    if (docType && docType !== 'all') params.set('doc_type', docType);
    if (search.trim()) params.set('search', search.trim());
    const docs = await api.get(`/billing/documents?${params.toString()}`);
    setBillingDocuments(Array.isArray(docs) ? docs : []);
  };

  useEffect(() => {
    Promise.all([
      loadDaily(),
      loadMonthly(),
      loadRanking('month'),
      api.get('/inventory/expenses').then(setPurchaseExpenses).catch(() => setPurchaseExpenses([])),
      api.get('/inventory/reconciliations').then(setInventoryReconciliations).catch(() => setInventoryReconciliations([])),
      api.get('/inventory/alerts').then(setInventoryAlerts).catch(() => setInventoryAlerts([])),
      loadBillingDocuments().catch(() => setBillingDocuments([])),
    ])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (searchParams.get('seccion') === 'facturacion') {
      setReportSection('facturacion');
    } else if (searchParams.get('seccion') === 'productos') {
      setReportSection('productos');
    }
  }, [searchParams]);

  useEffect(() => { loadRanking(rankingPeriod); }, [rankingPeriod]);
  useEffect(() => {
    if (reportSection !== 'facturacion') return;
    loadBillingDocuments().catch(() => setBillingDocuments([]));
  }, [reportSection, billingStatusFilter, billingTypeFilter]);

  const retryDocument = async (docId) => {
    try {
      setRetryingDocId(docId);
      await api.post(`/billing/${docId}/retry`, {});
      toast.success('Comprobante reenviado');
      await loadBillingDocuments();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRetryingDocId('');
    }
  };

  const retryFailedDocuments = async () => {
    try {
      setRetryingFailed(true);
      const result = await api.post('/billing/retry-failed', { limit: 30 });
      toast.success(`Reintento completado: ${result.success} exitosos de ${result.processed}`);
      await loadBillingDocuments();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRetryingFailed(false);
    }
  };
  const loadProductoInforme = async (register) => {
    if (!register?.id) return;
    setProductoInformeRegisterId(register.id);
    setProductoInformeLoading(true);
    setProductoInformeDetail(null);
    try {
      const d = await api.get(`/reports/closed-registers/${register.id}`);
      setProductoInformeDetail(d);
    } catch (err) {
      toast.error(err.message || 'No se pudo cargar el informe de productos');
      setProductoInformeDetail(null);
    } finally {
      setProductoInformeLoading(false);
    }
  };

  const openClosedRegisterDetail = async (register) => {
    if (!register?.id) return;
    try {
      setLoadingClosedRegister(true);
      const detail = await api.get(`/reports/closed-registers/${register.id}`);
      setSelectedClosedRegister(detail);
    } catch (err) {
      toast.error(err.message || 'No se pudo cargar el detalle del cierre');
      setSelectedClosedRegister(register);
    } finally {
      setLoadingClosedRegister(false);
    }
  };
  const buildClosedRegisterReportText = (register) => {
    if (!register) return '';
    const lines = [];
    const diff = Number(register?.arqueo?.difference ?? 0);
    lines.push('REPORTE DE CIERRE DE CAJA');
    lines.push('========================================');
    lines.push(`Caja cerrada: ${register.id}`);
    lines.push(`Cajero: ${register.user_name || '-'}`);
    lines.push(`Apertura: ${formatDateTime(register.opened_at)}`);
    lines.push(`Cierre: ${formatDateTime(register.closed_at)}`);
    lines.push('----------------------------------------');
    lines.push(`Venta total: ${formatCurrency(register.total_sales || 0)}`);
    lines.push(`Efectivo: ${formatCurrency(register.total_cash || 0)}`);
    lines.push(`Yape: ${formatCurrency(register.total_yape || 0)}`);
    lines.push(`Plin: ${formatCurrency(register.total_plin || 0)}`);
    lines.push(`Tarjeta: ${formatCurrency(register.total_card || 0)}`);
    const onlineAmt = Number(register.arqueo?.payment_breakdown?.online ?? 0);
    if (onlineAmt > 0) lines.push(`Online: ${formatCurrency(onlineAmt)}`);
    lines.push(`Efectivo esperado: ${formatCurrency(register.arqueo?.expected_cash || 0)}`);
    lines.push(`Efectivo contado: ${formatCurrency(register.arqueo?.counted_cash ?? register.closing_amount ?? 0)}`);
    lines.push(`Diferencia: ${diff >= 0 ? '+' : ''}${formatCurrency(diff)}`);
    lines.push('----------------------------------------');
    lines.push('DENOMINACIONES');
    Object.entries(DENOMINATION_LABELS).forEach(([key, label]) => {
      lines.push(`${label}: ${register.arqueo?.denominations?.[key] || 0}`);
    });
    lines.push('----------------------------------------');
    lines.push(`Observaciones: ${register.arqueo?.observations || register.notes || 'Sin observaciones'}`);
    if (Array.isArray(register.movements) && register.movements.length) {
      lines.push('----------------------------------------');
      lines.push('MOVIMIENTOS DE CAJA');
      register.movements.forEach((mv) => {
        lines.push(`${formatDateTime(mv.created_at)} | ${mv.type === 'income' ? 'Ingreso' : 'Egreso'} | ${formatCurrency(mv.amount)} | ${mv.concept || '-'}`);
      });
    }
    if (Array.isArray(register.notes_list) && register.notes_list.length) {
      lines.push('----------------------------------------');
      lines.push('NOTAS (CRÉDITO / DÉBITO)');
      register.notes_list.forEach((note) => {
        lines.push(`${formatDateTime(note.created_at)} | ${note.note_type === 'credit' ? 'Crédito' : 'Débito'} | ${formatCurrency(note.amount)} | ${note.reason || '-'}`);
      });
    }
    if (Array.isArray(register.sold_products) && register.sold_products.length) {
      lines.push('----------------------------------------');
      lines.push('PRODUCTOS VENDIDOS EN ESTA CAJA');
      register.sold_products.forEach((item) => {
        lines.push(`${item.product_name} | Cantidad: ${Number(item.total_qty || 0)} | Importe: ${formatCurrency(item.total_amount || 0)} | Pedidos: ${Number(item.order_count || 0)}`);
      });
    }
    if (Array.isArray(register.sales_orders) && register.sales_orders.length) {
      lines.push('----------------------------------------');
      lines.push('DETALLE DE VENTAS (PEDIDOS)');
      register.sales_orders.forEach((order) => {
        lines.push(`Pedido #${order.order_number || '-'} | ${formatDateTime(order.sold_at || order.updated_at || order.created_at)} | ${order.payment_method || '-'} | ${formatCurrency(order.total || 0)}`);
        (order.items || []).forEach((it) => {
          lines.push(`  - ${it.product_name} x${Number(it.quantity || 0)} (${formatCurrency(it.subtotal || 0)})`);
        });
      });
    }
    return `${lines.join('\n')}\n`;
  };
  const downloadClosedRegisterReport = (register) => {
    if (!register) return;
    const content = buildClosedRegisterReportText(register);
    const dateStamp = String(register.closed_at || new Date().toISOString()).replace(/[:T]/g, '-').slice(0, 16);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cierre-caja-${dateStamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;

  const purchaseGroups = Object.values(
    (purchaseExpenses || []).reduce((acc, expense) => {
      const key = expense.requirement_id || expense.id;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          created_at: expense.created_at,
          total: 0,
          items: [],
        };
      }
      acc[key].items.push(expense);
      acc[key].total += Number(expense.total_cost || 0);
      return acc;
    }, {})
  ).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const tabs = [
    { id: 'daily', label: 'Informe del Día', icon: MdCalendarToday },
    { id: 'monthly', label: 'Informe del Mes', icon: MdCalendarMonth },
    { id: 'ranking', label: 'Ranking Productos', icon: MdEmojiEvents },
  ];
  const sectionCards = [
    { id: 'ventas', title: 'Informe de Ventas', desc: 'Diversos informes de las ventas realizadas en la empresa.' },
    { id: 'productos', title: 'Informe de productos', desc: 'Detalle de productos vendidos por cada cierre de caja (se genera al cerrar turno).' },
    { id: 'caja', title: 'Informe de Caja', desc: 'Historial de cajas cerradas, detalle del cierre y descarga del reporte.' },
    { id: 'compras', title: 'Informe de Compras', desc: 'Las compras que has realizado.' },
    { id: 'finanzas', title: 'Informe de Finanzas', desc: 'Todo lo concerniente al flujo de dinero en las cajas.' },
    { id: 'facturacion', title: 'Informe de Facturación Electrónica', desc: 'Todo lo concerniente a documentos de facturación electrónica.' },
    { id: 'inventario', title: 'Informe de Inventario', desc: 'Movimientos de stock generados por ventas, compras, merma, etc.' },
  ];
  const activeSectionMeta = sectionCards.find(section => section.id === reportSection);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Informes</h1>
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {sectionCards.map(section => {
            const isActive = reportSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setReportSection(section.id)}
                className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-[#3B82F6] text-[#F9FAFB] bg-transparent'
                    : 'border-[#3B82F6]/30 text-[#9CA3AF] hover:border-[#3B82F6] hover:text-[#F9FAFB]'
                }`}
              >
                {section.title}
              </button>
            );
          })}
        </div>
        {activeSectionMeta?.desc && (
          <p className="text-sm text-[#9CA3AF] mt-3">{activeSectionMeta.desc}</p>
        )}
      </div>

      {reportSection === 'ventas' && (
        <>
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-gold-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border'}`}>
            <t.icon /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily' && dailyData && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${dailyData.register_open ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              Caja: {dailyData.register_open ? 'Abierta' : 'Cerrada'}
            </span>
            <span className="text-sm text-slate-500">Fecha: {dailyData.date}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><MdAttachMoney className="text-emerald-600 text-xl" /></div>
                <div>
                  <p className="text-xs text-slate-500">Ventas Hoy</p>
                  <p className="text-xl font-bold text-emerald-600">{formatCurrency(dailyData.sales?.total_sales)}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><MdReceipt className="text-sky-600 text-xl" /></div>
                <div>
                  <p className="text-xs text-slate-500">Pedidos</p>
                  <p className="text-xl font-bold text-sky-600">{dailyData.sales?.order_count || 0}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gold-100 rounded-xl flex items-center justify-center"><MdTrendingUp className="text-gold-600 text-xl" /></div>
                <div>
                  <p className="text-xs text-slate-500">IGV</p>
                  <p className="text-xl font-bold text-gold-600">{formatCurrency(dailyData.sales?.total_tax)}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><MdAttachMoney className="text-sky-600 text-xl" /></div>
                <div>
                  <p className="text-xs text-slate-500">Descuentos</p>
                  <p className="text-xl font-bold text-sky-600">{formatCurrency(dailyData.sales?.total_discount)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <h3 className="font-bold text-slate-800 mb-4">Ventas por Hora</h3>
              {dailyData.hourly?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dailyData.hourly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={h => `${h}:00`} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v, name) => [name === 'total' ? formatCurrency(v) : v, name === 'total' ? 'Ventas' : 'Pedidos']} labelFormatter={l => `${l}:00 hrs`} />
                    <Bar dataKey="total" fill="#f04438" radius={[4, 4, 0, 0]} name="Ventas" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-center py-8">Sin datos hoy</p>}
            </div>

            <div className="card">
              <h3 className="font-bold text-slate-800 mb-4">Métodos de Pago</h3>
              {dailyData.paymentMethods?.length > 0 ? (
                <div>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={dailyData.paymentMethods} dataKey="total" nameKey="payment_method" cx="50%" cy="50%" outerRadius={70} label={({ payment_method, percent }) => `${PAYMENT_METHODS[payment_method] || payment_method} ${(percent * 100).toFixed(0)}%`}>
                        {dailyData.paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {dailyData.paymentMethods.map((pm, i) => (
                      <div key={pm.payment_method} className="flex justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span>{PAYMENT_METHODS[pm.payment_method] || pm.payment_method}</span>
                        </div>
                        <span className="font-medium">{formatCurrency(pm.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-slate-400 text-center py-8">Sin ventas hoy</p>}
            </div>
          </div>

          {dailyData.orders?.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-slate-800 mb-4">Pedidos del Día ({dailyData.orders.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">#</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Mesa</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Estado</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Pago</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyData.orders.map(o => (
                      <tr key={o.id} className="border-b border-slate-50">
                        <td className="py-2 px-3 font-medium">#{o.order_number}</td>
                        <td className="py-2 px-3">{o.table_number || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' : o.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gold-100 text-gold-700'}`}>
                            {o.status === 'delivered' ? 'Entregado' : o.status === 'cancelled' ? 'Cancelado' : o.status === 'pending' ? 'Pendiente' : o.status === 'preparing' ? 'Preparando' : 'Listo'}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-xs ${
                            o.payment_status === 'paid'
                              ? 'text-emerald-600'
                              : o.payment_status === 'refunded'
                                ? 'text-red-600'
                                : 'text-gold-600'
                          }`}>
                            {o.payment_status === 'paid' ? 'Pagado' : o.payment_status === 'refunded' ? 'Reembolsado' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-bold">{formatCurrency(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'monthly' && monthlyData && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="card">
              <p className="text-sm text-slate-500">Ventas del Mes</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(monthlyData.totalMonth?.total)}</p>
              <p className="text-xs text-slate-400">{monthlyData.totalMonth?.orders || 0} pedidos</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">IGV del Mes</p>
              <p className="text-2xl font-bold text-gold-600">{formatCurrency(monthlyData.totalMonth?.tax)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Cajas Cerradas</p>
              <p className="text-2xl font-bold text-sky-600">{monthlyData.closedRegistersMonth || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <h3 className="font-bold text-slate-800 mb-4">Ventas Diarias (último mes)</h3>
              {monthlyData.dailySales?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={[...monthlyData.dailySales].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Line type="monotone" dataKey="total" stroke="#f04438" strokeWidth={2} dot={{ fill: '#f04438', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-center py-8">Sin datos</p>}
            </div>

            <div className="card">
              <h3 className="font-bold text-slate-800 mb-4">Ventas Mensuales</h3>
              {monthlyData.monthlySales?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={[...monthlyData.monthlySales].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-center py-8">Sin datos</p>}
            </div>
          </div>

        </div>
      )}

      {tab === 'ranking' && (
        <div>
          <div className="flex gap-2 mb-4">
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'week', label: 'Semana' },
              { id: 'month', label: 'Mes' },
              { id: 'all', label: 'Todo' },
            ].map(p => (
              <button key={p.id} onClick={() => setRankingPeriod(p.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${rankingPeriod === p.id ? 'bg-gold-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border'}`}>
                {p.label}
              </button>
            ))}
          </div>

          {ranking.length > 0 ? (
            <div>
              <div className="card mb-6">
                <h3 className="font-bold text-slate-800 mb-4">Top Productos</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ranking.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="product_name" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip formatter={(v, name) => [name === 'total_revenue' ? formatCurrency(v) : v, name === 'total_revenue' ? 'Ingresos' : 'Vendidos']} />
                    <Bar dataKey="total_sold" fill="#f04438" radius={[0, 4, 4, 0]} name="Vendidos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <h3 className="font-bold text-slate-800 mb-4">Ranking Completo</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-center py-2 px-3 text-xs text-slate-400 uppercase w-12">#</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Producto</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Vendidos</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Ingresos</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Pedidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((p, i) => (
                      <tr key={p.product_id} className="border-b border-slate-50">
                        <td className="py-2 px-3 text-center">
                          {i < 3 ? (
                            <span className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold text-white ${i === 0 ? 'bg-gold-400' : i === 1 ? 'bg-slate-400' : 'bg-gold-700'}`}>
                              {i + 1}
                            </span>
                          ) : <span className="text-slate-400">{i + 1}</span>}
                        </td>
                        <td className="py-2 px-3 font-medium">{p.product_name}</td>
                        <td className="py-2 px-3 text-right font-bold">{p.total_sold}</td>
                        <td className="py-2 px-3 text-right text-emerald-600 font-medium">{formatCurrency(p.total_revenue)}</td>
                        <td className="py-2 px-3 text-right text-slate-500">{p.order_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card text-center py-12 text-slate-400">
              <MdEmojiEvents className="text-5xl mx-auto mb-3 opacity-40" />
              <p className="font-medium">Sin datos de ventas</p>
              <p className="text-sm">Los rankings se generan con las ventas realizadas</p>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {reportSection === 'productos' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <MdShoppingCart className="text-[#3B82F6] text-xl" />
                <h3 className="font-bold text-slate-800">Cierres de caja con ventas</h3>
              </div>
              <button
                type="button"
                onClick={() => loadMonthly().then(setMonthlyData).catch(console.error)}
                className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
              >
                <MdRefresh className="text-sm" /> Actualizar lista
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Cada fila es un cierre: al cerrar caja se delimita el periodo. Pulsa <strong>Ver productos</strong> para el detalle
              (producto, cantidad, precio unitario, importe). Los datos provienen de los pedidos pagados entre apertura y cierre.
            </p>
            {!(monthlyData?.closedRegisters || []).length ? (
              <p className="text-slate-500">Aún no hay cierres de caja. Tras un cierre, aparecerá aquí y podrás abrir el informe.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Fecha cierre</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Cajero</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Apertura</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Venta turno</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase" />
                    </tr>
                  </thead>
                  <tbody>
                    {(monthlyData.closedRegisters || []).map((r) => (
                      <tr
                        key={r.id}
                        className={`border-b border-slate-50 ${productoInformeRegisterId === r.id ? 'bg-sky-50/80' : ''}`}
                      >
                        <td className="py-2 px-3 text-slate-600">{formatDateTime(r.closed_at)}</td>
                        <td className="py-2 px-3 font-medium">{r.user_name || '-'}</td>
                        <td className="py-2 px-3 text-slate-500 text-xs">{formatDateTime(r.opened_at)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-700">{formatCurrency(r.total_sales || 0)}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => loadProductoInforme(r)}
                            className="text-xs px-3 py-1.5 bg-[#3B82F6] text-white rounded-lg hover:bg-[#2563EB] inline-flex items-center gap-1"
                          >
                            <MdVisibility /> Ver productos
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {productoInformeLoading && (
            <div className="flex items-center justify-center py-10 text-slate-500 text-sm">Cargando detalle de productos…</div>
          )}

          {!productoInformeLoading && productoInformeDetail && (
            <div className="card border border-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                <div>
                  <h4 className="font-bold text-slate-800">Productos vendidos en este cierre</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Cierre: {formatDateTime(productoInformeDetail.closed_at)} · {productoInformeDetail.user_name || '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const lines = (productoInformeDetail.sold_products || [])
                      .map(
                        (row) =>
                          `${row.product_name}\t${Number(row.total_qty || 0)}\t${formatCurrency(row.unit_price || 0)}\t${formatCurrency(row.total_amount || 0)}`
                      )
                      .join('\n');
                    const head = 'Producto\tCantidad\tP. unit.\tTotal\n';
                    const tot = `TOTAL\t\t\t${formatCurrency(productoInformeDetail.product_sales_total ?? 0)}`;
                    const blob = new Blob([`${head}${lines}\n${tot}`], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `informe-productos-${String(productoInformeDetail.id || 'cierre').slice(0, 8)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <MdDownload /> Copiar / guardar
                </button>
              </div>
              {!(productoInformeDetail.sold_products || []).length ? (
                <p className="text-slate-500 py-4">No hay líneas de producto en el periodo de este cierre.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-600 uppercase">Producto</th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-600 uppercase">Cantidad</th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-600 uppercase">Precio unit.</th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-slate-600 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(productoInformeDetail.sold_products || []).map((row) => (
                        <tr key={`${row.product_id}-${row.product_name}`} className="border-b border-slate-100">
                          <td className="py-2 px-3 font-medium text-slate-800">{row.product_name}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{Number(row.total_qty || 0)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">{formatCurrency(row.unit_price || 0)}</td>
                          <td className="py-2 px-3 text-right font-medium text-slate-800 tabular-nums">
                            {formatCurrency(row.total_amount || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold">
                        <td colSpan={3} className="py-3 px-3 text-right text-slate-700">
                          Total ventas (productos)
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-700 tabular-nums">
                          {formatCurrency(
                            productoInformeDetail.product_sales_total != null
                              ? productoInformeDetail.product_sales_total
                              : (productoInformeDetail.sold_products || []).reduce(
                                  (s, r) => s + (Number(r.total_amount) || 0),
                                  0
                                )
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {reportSection === 'caja' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MdPointOfSale className="text-[#3B82F6] text-xl" />
              <h3 className="font-bold text-slate-800">Reporte de Caja</h3>
            </div>
            <span className="text-xs text-slate-500">
              Cierres registrados: {(monthlyData?.closedRegisters || []).length}
            </span>
          </div>
          {(monthlyData?.closedRegisters || []).length === 0 ? (
            <p className="text-slate-500">No hay cierres de caja registrados todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Caja cerrada</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Cajero</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Inicio de turno</th>
                    <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Hora de cierre</th>
                    <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Venta total</th>
                    <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(monthlyData?.closedRegisters || []).map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-2 px-3 font-medium">{r.id.slice(0, 8).toUpperCase()}</td>
                      <td className="py-2 px-3">{r.user_name || '-'}</td>
                      <td className="py-2 px-3 text-slate-500">{formatDateTime(r.opened_at)}</td>
                      <td className="py-2 px-3 text-slate-500">{formatDateTime(r.closed_at)}</td>
                      <td className="py-2 px-3 text-right font-bold">{formatCurrency(r.total_sales || 0)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openClosedRegisterDetail(r)}
                            className="text-xs px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 inline-flex items-center gap-1"
                          >
                            <MdVisibility /> Ver detalle
                          </button>
                          <button
                            onClick={() => downloadClosedRegisterReport(r)}
                            className="text-xs px-3 py-1.5 bg-[#3B82F6] text-white rounded-lg hover:bg-[#2563EB] inline-flex items-center gap-1"
                          >
                            <MdDownload /> Descargar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {reportSection === 'compras' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Compras recepcionadas</h3>
          {purchaseGroups.length === 0 ? (
            <p className="text-slate-500">No hay compras registradas.</p>
          ) : (
            <div className="space-y-4">
              {purchaseGroups.map(group => (
                <div key={group.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-slate-800">Compra {group.id.slice(0, 8)}</p>
                    <p className="font-bold text-red-700">{formatCurrency(group.total)}</p>
                  </div>
                  {group.items.map(item => (
                    <div key={item.id} className="text-sm flex justify-between border-b border-slate-100 py-1">
                      <span>{item.product_name || 'Producto'} · {item.quantity} u</span>
                      <span>{formatCurrency(item.unit_cost)} c/u</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {reportSection === 'finanzas' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Flujo de caja</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-xs text-emerald-600">Ventas mes</p>
              <p className="text-xl font-bold text-emerald-700">{formatCurrency(monthlyData?.totalMonth?.total)}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-red-600">Compras registradas</p>
              <p className="text-xl font-bold text-red-700">
                {formatCurrency((purchaseExpenses || []).reduce((s, e) => s + Number(e.total_cost || 0), 0))}
              </p>
            </div>
            <div className="bg-sky-50 rounded-lg p-3">
              <p className="text-xs text-sky-600">Cierres de caja</p>
              <p className="text-xl font-bold text-sky-700">{monthlyData?.closedRegisters?.length || 0}</p>
            </div>
          </div>
        </div>
      )}

      {reportSection === 'facturacion' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Facturación electrónica</h3>
          <p className="text-slate-600 mb-4">Resumen de comprobantes electrónicos emitidos.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Pedidos pagados hoy</p>
              <p className="text-xl font-bold text-slate-800">
                {(dailyData?.orders || []).filter(o => o.payment_status === 'paid' && o.status !== 'cancelled').length}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Monto facturable hoy</p>
              <p className="text-xl font-bold text-slate-800">
                {formatCurrency((dailyData?.orders || [])
                  .filter(o => o.payment_status === 'paid' && o.status !== 'cancelled')
                  .reduce((sum, o) => sum + Number(o.total || 0), 0))}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">Comprobantes emitidos</p>
              <p className="text-xl font-bold text-slate-800">{billingDocuments.length}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              className="input-field w-auto"
              value={billingStatusFilter}
              onChange={e => setBillingStatusFilter(e.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="accepted">Aceptados</option>
              <option value="sent">Enviados</option>
              <option value="pending">Pendientes</option>
              <option value="error">Con error</option>
            </select>
            <select
              className="input-field w-auto"
              value={billingTypeFilter}
              onChange={e => setBillingTypeFilter(e.target.value)}
            >
              <option value="all">Boletas y facturas</option>
              <option value="boleta">Boletas</option>
              <option value="factura">Facturas</option>
            </select>
            <input
              className="input-field flex-1 min-w-[220px]"
              placeholder="Buscar por comprobante, cliente o documento"
              value={billingSearch}
              onChange={e => setBillingSearch(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => loadBillingDocuments()}
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={retryFailedDocuments}
              disabled={retryingFailed}
              className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-2"
            >
              <MdRefresh />
              {retryingFailed ? 'Reintentando...' : 'Reintentar fallidos'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Comprobante</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Cliente</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Total</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-400 uppercase">Estado</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">Acciones</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-400 uppercase">PDF</th>
                </tr>
              </thead>
              <tbody>
                {billingDocuments.map(doc => (
                  <tr key={doc.id} className="border-b border-slate-50">
                    <td className="py-2 px-3 font-medium">{doc.full_number}</td>
                    <td className="py-2 px-3">{doc.customer_name || 'CLIENTE VARIOS'}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatCurrency(doc.total)}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        doc.provider_status === 'accepted'
                          ? 'bg-emerald-100 text-emerald-700'
                          : doc.provider_status === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}>
                        {doc.provider_status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {['error', 'pending', 'sent'].includes(doc.provider_status) ? (
                        <button
                          type="button"
                          onClick={() => retryDocument(doc.id)}
                          disabled={retryingDocId === doc.id}
                          className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-60 inline-flex items-center gap-1"
                        >
                          <MdRefresh /> {retryingDocId === doc.id ? 'Enviando...' : 'Reintentar'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">OK</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right align-middle">
                      {doc.pdf_url ? (
                        <button
                          type="button"
                          onClick={() =>
                            setBillingPdfPreview({
                              url: doc.pdf_url,
                              title: doc.full_number ? `PDF — ${doc.full_number}` : 'Vista previa del comprobante',
                            })
                          }
                          className="inline-block h-3 w-3 rounded-full bg-white border border-slate-300 shadow-sm hover:ring-2 hover:ring-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                          title="Ver PDF"
                          aria-label="Ver PDF del comprobante"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {billingDocuments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">Sin comprobantes emitidos todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportSection === 'inventario' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Movimientos de inventario</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-red-600">Productos con stock bajo</p>
              <p className="text-xl font-bold text-red-700">{inventoryAlerts.length}</p>
            </div>
            <div className="bg-sky-50 rounded-lg p-3">
              <p className="text-xs text-sky-600">Cuadres de almacén</p>
              <p className="text-xl font-bold text-sky-700">{inventoryReconciliations.length}</p>
            </div>
          </div>
          {inventoryAlerts.length > 0 && (
            <div className="space-y-1">
              {inventoryAlerts.slice(0, 10).map(item => (
                <div key={item.id} className="text-sm flex justify-between border-b border-slate-100 py-1">
                  <span>{item.name}</span>
                  <span className="font-medium text-red-700">{item.stock}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={!!billingPdfPreview}
        onClose={() => setBillingPdfPreview(null)}
        title={billingPdfPreview?.title || 'Vista previa del PDF'}
        size="full"
        variant="light"
      >
        {billingPdfPreview?.url && (
          <iframe
            title="PDF del comprobante"
            src={resolveMediaUrl(billingPdfPreview.url)}
            className="w-full h-[min(80vh,720px)] rounded-lg border border-slate-200 bg-slate-100"
          />
        )}
      </Modal>

      <Modal
        isOpen={!!selectedClosedRegister}
        onClose={() => setSelectedClosedRegister(null)}
        title="Detalle de Cierre de Caja"
        size="lg"
      >
        {loadingClosedRegister && (
          <div className="py-8 text-center text-slate-500">Cargando detalle...</div>
        )}
        {selectedClosedRegister && !loadingClosedRegister && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => downloadClosedRegisterReport(selectedClosedRegister)}
                className="text-xs px-3 py-1.5 bg-[#3B82F6] text-white rounded-lg hover:bg-[#2563EB] inline-flex items-center gap-1"
              >
                <MdDownload /> Descargar reporte
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Cajero</p>
                <p className="font-semibold text-slate-800">{selectedClosedRegister.user_name}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Apertura / Cierre</p>
                <p className="font-semibold text-slate-800">
                  {formatDateTime(selectedClosedRegister.opened_at)} - {formatDateTime(selectedClosedRegister.closed_at)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-emerald-600">Venta total</p>
                <p className="font-bold text-emerald-700">{formatCurrency(selectedClosedRegister.total_sales)}</p>
              </div>
              <div className="bg-sky-50 rounded-lg p-3">
                <p className="text-xs text-sky-600">Efectivo</p>
                <p className="font-bold text-sky-700">{formatCurrency(selectedClosedRegister.total_cash)}</p>
              </div>
              <div className="bg-violet-50 rounded-lg p-3">
                <p className="text-xs text-violet-600">Digital (Yape + Plin + Tarjeta + Online)</p>
                <p className="font-bold text-violet-700">
                  {formatCurrency(
                    (selectedClosedRegister.total_yape || 0) +
                      (selectedClosedRegister.total_plin || 0) +
                      (selectedClosedRegister.total_card || 0) +
                      Number(selectedClosedRegister.arqueo?.payment_breakdown?.online || 0)
                  )}
                </p>
              </div>
              <div className="bg-gold-50 rounded-lg p-3">
                <p className="text-xs text-gold-600">Efectivo contado</p>
                <p className="font-bold text-gold-700">
                  {formatCurrency(selectedClosedRegister.arqueo?.counted_cash ?? selectedClosedRegister.closing_amount)}
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800 mb-2">Arqueo</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Efectivo esperado</p>
                  <p className="font-medium">{formatCurrency(selectedClosedRegister.arqueo?.expected_cash)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Efectivo contado</p>
                  <p className="font-medium">{formatCurrency(selectedClosedRegister.arqueo?.counted_cash)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Diferencia</p>
                  <p className={`font-bold ${(selectedClosedRegister.arqueo?.difference || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(selectedClosedRegister.arqueo?.difference)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-slate-800 mb-2">Detalle por denominación</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {Object.entries(DENOMINATION_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-medium">{selectedClosedRegister.arqueo?.denominations?.[key] || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Observaciones</p>
              <p className="text-sm text-slate-700">{selectedClosedRegister.arqueo?.observations || selectedClosedRegister.notes || 'Sin observaciones'}</p>
            </div>
            {Array.isArray(selectedClosedRegister.sold_products) && selectedClosedRegister.sold_products.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Productos vendidos en esta caja</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-2 text-xs text-slate-400 uppercase">Producto</th>
                        <th className="text-right py-2 px-2 text-xs text-slate-400 uppercase">Cantidad</th>
                        <th className="text-right py-2 px-2 text-xs text-slate-400 uppercase">Importe</th>
                        <th className="text-right py-2 px-2 text-xs text-slate-400 uppercase">Pedidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClosedRegister.sold_products.map((item) => (
                        <tr key={`${item.product_id || item.product_name}`} className="border-b border-slate-50">
                          <td className="py-2 px-2">{item.product_name}</td>
                          <td className="py-2 px-2 text-right font-medium">{Number(item.total_qty || 0)}</td>
                          <td className="py-2 px-2 text-right font-medium">{formatCurrency(item.total_amount || 0)}</td>
                          <td className="py-2 px-2 text-right">{Number(item.order_count || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {Array.isArray(selectedClosedRegister.sales_orders) && selectedClosedRegister.sales_orders.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Detalle de ventas de la caja</p>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedClosedRegister.sales_orders.map((order) => (
                    <div key={order.id} className="border border-slate-100 rounded-lg p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p className="font-semibold text-slate-800">Pedido #{order.order_number || '-'}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(order.sold_at || order.updated_at || order.created_at)}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 mt-1">
                        <span>Método: {PAYMENT_METHODS[order.payment_method] || order.payment_method || '-'}</span>
                        <span className="font-semibold text-slate-800">{formatCurrency(order.total || 0)}</span>
                      </div>
                      {Array.isArray(order.items) && order.items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {order.items.map((it, idx) => (
                            <div key={`${order.id}-${idx}`} className="text-xs flex justify-between border-b border-slate-50 py-0.5">
                              <span className="text-slate-600">{it.product_name} x{Number(it.quantity || 0)}</span>
                              <span className="font-medium">{formatCurrency(it.subtotal || 0)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(selectedClosedRegister.movements) && selectedClosedRegister.movements.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Movimientos de caja</p>
                <div className="space-y-1">
                  {selectedClosedRegister.movements.map((mv) => (
                    <div key={mv.id} className="text-sm flex justify-between border-b border-slate-100 py-1">
                      <span className="text-slate-600">{formatDateTime(mv.created_at)} · {mv.type === 'income' ? 'Ingreso' : 'Egreso'} · {mv.concept || 'Sin concepto'}</span>
                      <span className={`font-medium ${mv.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(mv.amount || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Array.isArray(selectedClosedRegister.notes_list) && selectedClosedRegister.notes_list.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Notas de crédito / débito</p>
                <div className="space-y-1">
                  {selectedClosedRegister.notes_list.map((note) => (
                    <div key={note.id} className="text-sm flex justify-between border-b border-slate-100 py-1">
                      <span className="text-slate-600">{formatDateTime(note.created_at)} · {note.note_type === 'credit' ? 'Crédito' : 'Débito'} · {note.reason || 'Sin motivo'}</span>
                      <span className="font-medium text-slate-800">{formatCurrency(note.amount || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
