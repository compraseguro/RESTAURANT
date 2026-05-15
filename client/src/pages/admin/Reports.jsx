import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, formatCurrency, PAYMENT_METHODS, resolveMediaUrl } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import {
  MdCalendarToday,
  MdCalendarMonth,
  MdEmojiEvents,
  MdTrendingUp,
  MdReceipt,
  MdAttachMoney,
  MdVisibility,
  MdRefresh,
  MdPointOfSale,
  MdDownload,
  MdShoppingCart,
  MdVolunteerActivism,
  MdAutoGraph,
} from 'react-icons/md';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';

const COLORS = ['#f04438', '#ffa520', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316'];
const FINANCE_LOSS_LABELS = {
  salida_efectivo: 'Salida de efectivo',
  gasto_extra: 'Gasto extra',
  merma: 'Merma',
  danio_propiedad: 'Daño en propiedad',
  reembolso: 'Reembolso',
  otro: 'Otro',
};
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

function formatPct1(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return `${x.toFixed(1)}%`;
}

/** Umbrales del módulo empresarial + lectura frente al resumen del rango (Informes · Finanzas). */
function FinanceBusinessIntelPanel({ overview }) {
  const bi = overview?.business_intel;
  if (!bi || typeof bi !== 'object') return null;

  const sales = Number(overview.sales?.total || 0);
  const gross = Number(overview.approx_gross_margin ?? 0);
  const profit = Number(overview.approx_profit ?? 0);
  const losses = Number(overview.losses_combined_total ?? 0);
  const grossPct = sales > 0 ? (gross / sales) * 100 : null;
  const netPct = sales > 0 ? (profit / sales) * 100 : null;
  const lossRatioPct = sales > 0 ? (losses / sales) * 100 : null;

  const minG = Number(bi.prof_margin_min_pct);
  const idealG = Number(bi.prof_margin_ideal_pct);
  const critG = Number(bi.prof_margin_critical_pct);
  const targetNet = Number(bi.prof_target_net_margin_pct);
  const varTol = Number(bi.var_tolerance_pct);
  const overhead = Number(bi.gen_indirect_overhead_pct);

  let grossLabel = 'Sin ventas en el rango';
  let grossClass = 'text-slate-600';
  if (grossPct != null && Number.isFinite(grossPct)) {
    if (Number.isFinite(critG) && grossPct < critG) {
      grossLabel = `Por debajo del margen crítico (${formatPct1(critG)})`;
      grossClass = 'text-red-700 font-semibold';
    } else if (Number.isFinite(minG) && grossPct < minG) {
      grossLabel = `Por debajo del mínimo objetivo (${formatPct1(minG)})`;
      grossClass = 'text-amber-800 font-semibold';
    } else if (Number.isFinite(idealG) && grossPct >= idealG) {
      grossLabel = `En o por encima del ideal (${formatPct1(idealG)})`;
      grossClass = 'text-emerald-800 font-semibold';
    } else {
      grossLabel = 'Dentro del rango operativo';
      grossClass = 'text-slate-800';
    }
  }

  let netLabel = 'Sin ventas en el rango';
  let netClass = 'text-slate-600';
  if (netPct != null && Number.isFinite(netPct)) {
    if (profit < 0) {
      netLabel = 'Resultado neto aproximado negativo';
      netClass = 'text-red-700 font-semibold';
    } else if (Number.isFinite(targetNet) && netPct < targetNet) {
      netLabel = `Por debajo del objetivo de utilidad neta (${formatPct1(targetNet)})`;
      netClass = 'text-amber-800 font-semibold';
    } else {
      netLabel = 'En o por encima del objetivo de utilidad neta';
      netClass = 'text-emerald-800 font-semibold';
    }
  }

  let lossLabel = 'Sin ventas en el rango';
  let lossClass = 'text-slate-600';
  if (lossRatioPct != null && Number.isFinite(lossRatioPct) && sales > 0) {
    if (Number.isFinite(varTol) && lossRatioPct >= varTol) {
      lossLabel = `Salidas combinadas ≥ umbral de alertas (${formatPct1(varTol)} sobre ventas)`;
      lossClass = 'text-amber-900 font-semibold';
    } else {
      lossLabel = 'Por debajo del umbral usado en alertas operativas';
      lossClass = 'text-slate-700';
    }
  }

  const rows = [
    { k: 'Margen bruto mínimo objetivo', v: formatPct1(minG) },
    { k: 'Margen bruto ideal', v: formatPct1(idealG) },
    { k: 'Margen crítico', v: formatPct1(critG) },
    { k: 'Utilidad neta objetivo', v: formatPct1(targetNet) },
    { k: 'Tolerancia teórico vs real (alertas gastos/ventas)', v: formatPct1(varTol) },
    { k: 'Costos indirectos estimados (referencia)', v: formatPct1(overhead) },
  ];

  return (
    <div className="card border border-violet-200 bg-violet-50/40">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <MdAutoGraph className="text-violet-600 text-xl shrink-0" />
            Rentabilidad según módulo empresarial
          </h3>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Los porcentajes se configuran en Configuración → Módulo empresarial (dominio Rentabilidad y relacionados). Aquí se
            comparan con el resumen del rango de fechas seleccionado.
          </p>
        </div>
        <Link
          to="/admin/configuracion"
          className="text-sm font-semibold text-violet-800 hover:underline whitespace-nowrap"
        >
          Editar umbrales
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {rows.map((r) => (
          <div key={r.k} className="rounded-lg bg-white/90 border border-violet-100 px-3 py-2">
            <p className="text-[11px] text-slate-500 leading-snug">{r.k}</p>
            <p className="text-lg font-bold text-violet-950 tabular-nums">{r.v}</p>
          </div>
        ))}
      </div>
      {sales > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Lectura en este rango</p>
          <ul className="space-y-2 text-sm">
            <li className="flex flex-wrap justify-between gap-2">
              <span className="text-slate-600">Margen bruto aprox. / ventas</span>
              <span className="tabular-nums font-semibold">{formatPct1(grossPct)}</span>
            </li>
            <li className={grossClass}>{grossLabel}</li>
            <li className="flex flex-wrap justify-between gap-2 mt-2">
              <span className="text-slate-600">Utilidad neta aprox. / ventas</span>
              <span className="tabular-nums font-semibold">{formatPct1(netPct)}</span>
            </li>
            <li className={netClass}>{netLabel}</li>
            <li className="flex flex-wrap justify-between gap-2 mt-2">
              <span className="text-slate-600">Salidas combinadas / ventas</span>
              <span className="tabular-nums font-semibold">{formatPct1(lossRatioPct)}</span>
            </li>
            <li className={lossClass}>{lossLabel}</li>
          </ul>
        </div>
      )}
    </div>
  );
}

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
  const [productoInformeModalOpen, setProductoInformeModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [financeFrom, setFinanceFrom] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 30);
    return t.toISOString().split('T')[0];
  });
  const [financeTo, setFinanceTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [financeOverview, setFinanceOverview] = useState(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [lossEvents, setLossEvents] = useState(null);
  const [lossCategoryFilter, setLossCategoryFilter] = useState('all');
  const [lossForm, setLossForm] = useState({
    category: 'gasto_extra',
    amount: '',
    concept: '',
    itemsText: '',
    occurred_at: '',
  });

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

  const loadBillingDocumentsRef = useRef(loadBillingDocuments);
  loadBillingDocumentsRef.current = loadBillingDocuments;
  const reportSectionRef = useRef(reportSection);
  reportSectionRef.current = reportSection;

  useSocket(
    'billing-document-update',
    useCallback(() => {
      if (reportSectionRef.current !== 'facturacion') return;
      loadBillingDocumentsRef.current().catch(() => setBillingDocuments([]));
    }, [])
  );

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
    } else if (searchParams.get('seccion') === 'finanzas') {
      setReportSection('finanzas');
    }
  }, [searchParams]);

  useEffect(() => { loadRanking(rankingPeriod); }, [rankingPeriod]);
  useEffect(() => {
    if (reportSection !== 'finanzas') return undefined;
    let cancelled = false;
    setFinanceLoading(true);
    const q1 = new URLSearchParams({ from: financeFrom, to: financeTo });
    const q2 = new URLSearchParams({ from: financeFrom, to: financeTo });
    if (lossCategoryFilter !== 'all') q2.set('category', lossCategoryFilter);
    Promise.all([
      api.get(`/reports/finance-overview?${q1}`),
      api.get(`/reports/finance-loss-events?${q2}`),
    ])
      .then(([ov, ev]) => {
        if (cancelled) return;
        setFinanceOverview(ov);
        setLossEvents(ev);
      })
      .catch(() => {
        if (!cancelled) {
          setFinanceOverview(null);
          setLossEvents(null);
        }
      })
      .finally(() => {
        if (!cancelled) setFinanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportSection, financeFrom, financeTo, lossCategoryFilter]);
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
  const closeProductoInformeModal = () => {
    setProductoInformeModalOpen(false);
    setProductoInformeDetail(null);
    setProductoInformeRegisterId('');
    setProductoInformeLoading(false);
  };

  const openProductoInforme = async (register) => {
    if (!register?.id) return;
    setProductoInformeModalOpen(true);
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

  const submitFinanceLoss = async () => {
    const amt = parseFloat(lossForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Monto inválido');
    let items = null;
    const raw = lossForm.itemsText.trim();
    if (raw) {
      try {
        items = JSON.parse(raw);
      } catch {
        return toast.error('Detalle de ítems: JSON inválido (usa un array, p. ej. [{"name":"Producto","qty":2}])');
      }
    }
    try {
      await api.post('/reports/finance-loss-events', {
        category: lossForm.category,
        amount: amt,
        concept: lossForm.concept.trim(),
        items,
        occurred_at: lossForm.occurred_at.trim() || undefined,
      });
      toast.success('Pérdida registrada');
      setLossForm((p) => ({ ...p, amount: '', concept: '', itemsText: '', occurred_at: '' }));
      const q1 = new URLSearchParams({ from: financeFrom, to: financeTo });
      const q2 = new URLSearchParams({ from: financeFrom, to: financeTo });
      if (lossCategoryFilter !== 'all') q2.set('category', lossCategoryFilter);
      const [ov, ev] = await Promise.all([
        api.get(`/reports/finance-overview?${q1}`),
        api.get(`/reports/finance-loss-events?${q2}`),
      ]);
      setFinanceOverview(ov);
      setLossEvents(ev);
    } catch (e) {
      toast.error(e.message || 'No se pudo registrar');
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
    lines.push(`Propinas: ${formatCurrency(register.arqueo?.total_tips || 0)}`);
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
    const incomeMov = (register.movements || []).filter((m) => m.type === 'income');
    const expenseMov = (register.movements || []).filter((m) => m.type === 'expense');
    const notesDebit = (register.notes_list || []).filter((n) => n.note_type === 'debit');
    const notesCredit = (register.notes_list || []).filter((n) => n.note_type === 'credit');
    if (incomeMov.length) {
      lines.push('----------------------------------------');
      lines.push('INGRESOS (CAJA)');
      incomeMov.forEach((mv) => {
        lines.push(`${formatDateTime(mv.created_at)} | ${formatCurrency(mv.amount)} | ${mv.concept || '-'}`);
      });
    }
    if (expenseMov.length) {
      lines.push('----------------------------------------');
      lines.push('EGRESOS (CAJA)');
      expenseMov.forEach((mv) => {
        lines.push(`${formatDateTime(mv.created_at)} | ${formatCurrency(mv.amount)} | ${mv.concept || '-'}`);
      });
    }
    if (notesDebit.length) {
      lines.push('----------------------------------------');
      lines.push('NOTAS DE DÉBITO');
      notesDebit.forEach((note) => {
        lines.push(`${formatDateTime(note.created_at)} | ${formatCurrency(note.amount)} | ${note.reason || '-'}`);
      });
    }
    if (notesCredit.length) {
      lines.push('----------------------------------------');
      lines.push('NOTAS DE CRÉDITO');
      notesCredit.forEach((note) => {
        lines.push(`${formatDateTime(note.created_at)} | ${formatCurrency(note.amount)} | ${note.reason || '-'}`);
      });
    }
    lines.push('----------------------------------------');
    lines.push(`Observaciones: ${register.arqueo?.observations || register.notes || 'Sin observaciones'}`);
    if (Array.isArray(register.sold_products) && register.sold_products.length) {
      lines.push('----------------------------------------');
      lines.push('PRODUCTOS VENDIDOS (DETALLE POR PRODUCTO)');
      register.sold_products.forEach((item) => {
        const qty = Number(item.total_qty || 0);
        const unit = qty > 0 ? Number(item.total_amount || 0) / qty : 0;
        lines.push(
          `${item.product_name} | Cantidad: ${qty} | Precio unit.: ${formatCurrency(unit)} | Total: ${formatCurrency(item.total_amount || 0)}`
        );
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

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
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
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center"><MdVolunteerActivism className="text-violet-600 text-xl" /></div>
                <div>
                  <p className="text-xs text-slate-500">Propinas</p>
                  <p className="text-xl font-bold text-violet-600">{formatCurrency(dailyData.sales?.total_tips)}</p>
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
            {!(monthlyData?.closedRegisters || []).length ? (
              <p className="text-slate-500">Aún no hay cierres de caja. Tras un cierre, aparecerá aquí y podrás abrir el informe.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="informe-productos-table w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--ui-border)]">
                      <th className="text-left py-2 px-3 text-xs text-[color:var(--ui-muted)] uppercase">Fecha cierre</th>
                      <th className="text-left py-2 px-3 text-xs text-[color:var(--ui-muted)] uppercase">Cajero</th>
                      <th className="text-left py-2 px-3 text-xs text-[color:var(--ui-muted)] uppercase">Apertura</th>
                      <th className="text-right py-2 px-3 text-xs text-[color:var(--ui-muted)] uppercase">Venta turno</th>
                      <th className="text-right py-2 px-3 text-xs text-[color:var(--ui-muted)] uppercase" />
                    </tr>
                  </thead>
                  <tbody>
                    {(monthlyData.closedRegisters || []).map((r) => (
                      <tr
                        key={r.id}
                        className={`border-b border-[color:var(--ui-border)] ${
                          productoInformeModalOpen && productoInformeRegisterId === r.id ? 'informe-productos-row-selected' : ''
                        }`}
                      >
                        <td className="py-2 px-3 text-[color:var(--ui-body-text)]">{formatDateTime(r.closed_at)}</td>
                        <td className="py-2 px-3 font-medium text-[color:var(--ui-body-text)]">{r.user_name || '-'}</td>
                        <td className="py-2 px-3 text-[color:var(--ui-muted)] text-xs">{formatDateTime(r.opened_at)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-600">{formatCurrency(r.total_sales || 0)}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => openProductoInforme(r)}
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

          <Modal
            isOpen={productoInformeModalOpen}
            onClose={closeProductoInformeModal}
            title="Productos vendidos en este cierre"
            size="lg"
          >
            {productoInformeLoading && (
              <div className="flex items-center justify-center py-12 text-[color:var(--ui-muted)] text-sm">
                Cargando detalle de productos…
              </div>
            )}
            {!productoInformeLoading && !productoInformeDetail && (
              <p className="text-center py-10 text-[color:var(--ui-muted)] text-sm">
                No hay datos para mostrar o hubo un error al cargar.
              </p>
            )}
            {!productoInformeLoading && productoInformeDetail && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm text-[color:var(--ui-muted)]">
                    Cierre: {formatDateTime(productoInformeDetail.closed_at)} · {productoInformeDetail.user_name || '—'}
                  </p>
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
                    className="text-xs px-3 py-1.5 border border-[color:var(--ui-border)] rounded-lg text-[color:var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)] inline-flex items-center gap-1 shrink-0"
                  >
                    <MdDownload /> Copiar / guardar
                  </button>
                </div>
                {!(productoInformeDetail.sold_products || []).length ? (
                  <p className="text-[color:var(--ui-muted)] py-4">No hay líneas de producto en el periodo de este cierre.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[color:var(--ui-border)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]">
                          <th className="text-left py-2.5 px-3 text-xs font-semibold text-[color:var(--ui-muted)] uppercase">Producto</th>
                          <th className="text-right py-2.5 px-3 text-xs font-semibold text-[color:var(--ui-muted)] uppercase">Cantidad</th>
                          <th className="text-right py-2.5 px-3 text-xs font-semibold text-[color:var(--ui-muted)] uppercase">Precio unit.</th>
                          <th className="text-right py-2.5 px-3 text-xs font-semibold text-[color:var(--ui-muted)] uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(productoInformeDetail.sold_products || []).map((row) => (
                          <tr key={`${row.product_id}-${row.product_name}`} className="border-b border-[color:var(--ui-border)]">
                            <td className="py-2 px-3 font-medium text-[color:var(--ui-body-text)]">{row.product_name}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-[color:var(--ui-body-text)]">{Number(row.total_qty || 0)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-[color:var(--ui-muted)]">{formatCurrency(row.unit_price || 0)}</td>
                            <td className="py-2 px-3 text-right font-medium tabular-nums text-[color:var(--ui-body-text)]">
                              {formatCurrency(row.total_amount || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[var(--ui-surface-2)] font-bold border-t border-[color:var(--ui-border)]">
                          <td colSpan={3} className="py-3 px-3 text-right text-[color:var(--ui-body-text)]">
                            Total ventas (productos)
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-500 tabular-nums">
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
          </Modal>
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
        <div className="space-y-6">
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-4">Resumen financiero</h3>
            <div className="flex flex-wrap gap-3 mb-4 items-end">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Desde</label>
                <input
                  type="date"
                  className="input-field"
                  value={financeFrom}
                  onChange={(e) => setFinanceFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Hasta</label>
                <input
                  type="date"
                  className="input-field"
                  value={financeTo}
                  onChange={(e) => setFinanceTo(e.target.value)}
                />
              </div>
            </div>
            {financeLoading ? (
              <p className="text-slate-500">Cargando…</p>
            ) : !financeOverview ? (
              <p className="text-slate-500">No se pudo cargar el resumen.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                    <p className="text-xs text-amber-800">Inversión (nómina y otros movimientos)</p>
                    <p className="text-xl font-bold text-amber-900">{formatCurrency(financeOverview.investment?.total)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                    <p className="text-xs text-emerald-700">Ventas (pedidos pagados)</p>
                    <p className="text-xl font-bold text-emerald-800">{formatCurrency(financeOverview.sales?.total)}</p>
                    <p className="text-xs text-emerald-600 mt-1">{financeOverview.sales?.orders || 0} pedidos</p>
                  </div>
                  <div className="bg-sky-50 rounded-lg p-3 border border-sky-100">
                    <p className="text-xs text-sky-700">Ganancia aproximada</p>
                    <p className="text-xl font-bold text-sky-900">{formatCurrency(financeOverview.approx_profit)}</p>
                    <p className="text-[11px] text-sky-700 mt-1">
                      Ventas − compras − pérdidas registradas − egresos de caja en el rango
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-xs text-slate-600">Compras (inventario)</p>
                    <p className="text-lg font-bold text-slate-800">{formatCurrency(financeOverview.purchases?.total)}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                    <p className="text-xs text-red-700">Pérdidas (eventos + egresos caja)</p>
                    <p className="text-xl font-bold text-red-800">{formatCurrency(financeOverview.losses_combined_total)}</p>
                    <p className="text-[11px] text-red-600 mt-1">
                      Eventos: {formatCurrency(financeOverview.loss_events?.total)} · Egresos caja:{' '}
                      {formatCurrency(financeOverview.cash_expenses?.total)}
                    </p>
                  </div>
                  <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                    <p className="text-xs text-violet-700">Margen bruto aprox.</p>
                    <p className="text-lg font-bold text-violet-900">{formatCurrency(financeOverview.approx_gross_margin)}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Rango: {financeOverview.filters?.from} — {financeOverview.filters?.to}. Los totales usan fecha local del servidor.
                </p>
              </>
            )}
          </div>

          {financeOverview && !financeLoading ? <FinanceBusinessIntelPanel overview={financeOverview} /> : null}

          <div className="card">
            <h3 className="font-bold text-slate-800 mb-2">Registrar pérdida</h3>
            <p className="text-sm text-slate-600 mb-4">
              Incluye mermas, daños, reembolsos y gastos extra. Opcional: detalle en JSON (productos y cantidades).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Categoría</label>
                <select
                  className="input-field"
                  value={lossForm.category}
                  onChange={(e) => setLossForm((p) => ({ ...p, category: e.target.value }))}
                >
                  {Object.entries(FINANCE_LOSS_LABELS).map(([k, lab]) => (
                    <option key={k} value={k}>{lab}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Monto (S/)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="input-field"
                  value={lossForm.amount}
                  onChange={(e) => setLossForm((p) => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Concepto</label>
                <input
                  className="input-field"
                  value={lossForm.concept}
                  onChange={(e) => setLossForm((p) => ({ ...p, concept: e.target.value }))}
                  placeholder="Descripción breve"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Fecha (opcional, ISO)</label>
                <input
                  className="input-field"
                  value={lossForm.occurred_at}
                  onChange={(e) => setLossForm((p) => ({ ...p, occurred_at: e.target.value }))}
                  placeholder="2026-05-10 o 2026-05-10T12:00"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Detalle ítems (JSON opcional)</label>
                <textarea
                  className="input-field min-h-[72px] font-mono text-xs"
                  value={lossForm.itemsText}
                  onChange={(e) => setLossForm((p) => ({ ...p, itemsText: e.target.value }))}
                  placeholder='[{"name":"Insumo X","qty":2,"unit":15.5}]'
                />
              </div>
            </div>
            <button type="button" className="btn-primary mt-4" onClick={() => void submitFinanceLoss()}>
              Guardar pérdida
            </button>
          </div>

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="font-bold text-slate-800">Detalle de pérdidas</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">Filtrar categoría</label>
                <select
                  className="input-field w-auto text-sm"
                  value={lossCategoryFilter}
                  onChange={(e) => setLossCategoryFilter(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {Object.entries(FINANCE_LOSS_LABELS).map(([k, lab]) => (
                    <option key={k} value={k}>{lab}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-3">
              Total pérdidas (eventos en rango): {formatCurrency(lossEvents?.loss_events_total)}
            </p>
            {!lossEvents?.events?.length ? (
              <p className="text-slate-500">No hay eventos en este rango.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-left p-2">Categoría</th>
                      <th className="text-left p-2">Concepto</th>
                      <th className="text-right p-2">Monto</th>
                      <th className="text-left p-2">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lossEvents.events.map((ev) => (
                      <tr key={ev.id} className="border-t border-slate-100">
                        <td className="p-2 whitespace-nowrap">{formatDateTime(ev.occurred_at)}</td>
                        <td className="p-2">{FINANCE_LOSS_LABELS[ev.category] || ev.category}</td>
                        <td className="p-2 max-w-[200px] truncate" title={ev.concept}>{ev.concept || '—'}</td>
                        <td className="p-2 text-right font-semibold">{formatCurrency(ev.amount)}</td>
                        <td className="p-2 text-xs text-slate-600 max-w-xs">
                          {Array.isArray(ev.items_json_parsed)
                            ? ev.items_json_parsed.map((it, i) => (
                              <span key={i} className="inline-block mr-2">
                                {it.name || it.product_name || 'Ítem'}: {it.qty ?? it.quantity ?? '—'}
                              </span>
                            ))
                            : (ev.items_json ? String(ev.items_json).slice(0, 80) : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              <option value="local">Notas locales</option>
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
              <option value="all">Todos (boletas, facturas y notas)</option>
              <option value="nota_venta">Notas de venta</option>
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
                            : doc.provider_status === 'local'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-amber-100 text-amber-700'
                      }`}>
                        {doc.provider_status === 'local' ? 'local (nota)' : doc.provider_status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {doc.provider_status === 'local' ? (
                        <span className="text-xs text-slate-500">Nota local</span>
                      ) : ['error', 'pending', 'sent'].includes(doc.provider_status) ? (
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
                        <div className="flex items-center justify-end gap-2">
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
                          <a
                            href={resolveMediaUrl(doc.pdf_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#3B82F6] hover:underline whitespace-nowrap"
                            title="Abrir en otra pestaña para imprimir"
                          >
                            Abrir / imprimir
                          </a>
                        </div>
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
          <div className="space-y-2">
            <div className="flex justify-end">
              <a
                href={resolveMediaUrl(billingPdfPreview.url)}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[#3B82F6] hover:underline"
              >
                Abrir en nueva pestaña / imprimir
              </a>
            </div>
            <iframe
              title="PDF del comprobante"
              src={resolveMediaUrl(billingPdfPreview.url)}
              className="w-full h-[min(80vh,720px)] rounded-lg border border-slate-200 bg-slate-100"
            />
          </div>
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

            {Array.isArray(selectedClosedRegister.movements) &&
              selectedClosedRegister.movements.filter((m) => m.type === 'income').length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Ingresos</p>
                  <div className="space-y-1">
                    {selectedClosedRegister.movements
                      .filter((mv) => mv.type === 'income')
                      .map((mv) => (
                        <div key={mv.id} className="text-sm flex justify-between border-b border-slate-100 py-1">
                          <span className="text-slate-600">{formatDateTime(mv.created_at)} · {mv.concept || 'Sin concepto'}</span>
                          <span className="font-medium text-emerald-600">{formatCurrency(mv.amount || 0)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            {Array.isArray(selectedClosedRegister.movements) &&
              selectedClosedRegister.movements.filter((m) => m.type === 'expense').length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Egresos</p>
                  <div className="space-y-1">
                    {selectedClosedRegister.movements
                      .filter((mv) => mv.type === 'expense')
                      .map((mv) => (
                        <div key={mv.id} className="text-sm flex justify-between border-b border-slate-100 py-1">
                          <span className="text-slate-600">{formatDateTime(mv.created_at)} · {mv.concept || 'Sin concepto'}</span>
                          <span className="font-medium text-red-600">{formatCurrency(mv.amount || 0)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            {Array.isArray(selectedClosedRegister.notes_list) &&
              selectedClosedRegister.notes_list.filter((n) => n.note_type === 'debit').length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Notas de débito</p>
                  <div className="space-y-1">
                    {selectedClosedRegister.notes_list
                      .filter((note) => note.note_type === 'debit')
                      .map((note) => (
                        <div key={note.id} className="text-sm flex justify-between border-b border-slate-100 py-1">
                          <span className="text-slate-600">{formatDateTime(note.created_at)} · {note.reason || 'Sin motivo'}</span>
                          <span className="font-medium text-slate-800">{formatCurrency(note.amount || 0)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            {Array.isArray(selectedClosedRegister.notes_list) &&
              selectedClosedRegister.notes_list.filter((n) => n.note_type === 'credit').length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Notas de crédito</p>
                  <div className="space-y-1">
                    {selectedClosedRegister.notes_list
                      .filter((note) => note.note_type === 'credit')
                      .map((note) => (
                        <div key={note.id} className="text-sm flex justify-between border-b border-slate-100 py-1">
                          <span className="text-slate-600">{formatDateTime(note.created_at)} · {note.reason || 'Sin motivo'}</span>
                          <span className="font-medium text-slate-800">{formatCurrency(note.amount || 0)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Observaciones</p>
              <p className="text-sm text-slate-700">{selectedClosedRegister.arqueo?.observations || selectedClosedRegister.notes || 'Sin observaciones'}</p>
            </div>
            {Array.isArray(selectedClosedRegister.sold_products) && selectedClosedRegister.sold_products.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Detalle por producto (ventas de la caja)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-2 text-xs text-slate-400 uppercase">Producto</th>
                        <th className="text-right py-2 px-2 text-xs text-slate-400 uppercase">Cantidad</th>
                        <th className="text-right py-2 px-2 text-xs text-slate-400 uppercase">Precio</th>
                        <th className="text-right py-2 px-2 text-xs text-slate-400 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClosedRegister.sold_products.map((item) => {
                        const qty = Number(item.total_qty || 0);
                        const unit = qty > 0 ? Number(item.total_amount || 0) / qty : 0;
                        return (
                          <tr key={`${item.product_id || item.product_name}`} className="border-b border-slate-50">
                            <td className="py-2 px-2">{item.product_name}</td>
                            <td className="py-2 px-2 text-right font-medium">{qty}</td>
                            <td className="py-2 px-2 text-right font-medium">{formatCurrency(unit)}</td>
                            <td className="py-2 px-2 text-right font-semibold">{formatCurrency(item.total_amount || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
