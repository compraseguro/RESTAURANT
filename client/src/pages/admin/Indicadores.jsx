import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import {
  MdInsights,
  MdDashboard,
  MdAttachMoney,
  MdStore,
  MdTrendingUp,
  MdInventory,
  MdPeople,
  MdRestaurantMenu,
  MdBarChart,
  MdNotificationsActive,
  MdPsychology,
  MdDownload,
} from 'react-icons/md';
import {
  IndicatorsGeneralPanel,
  IndicatorsFinancialPanel,
  IndicatorsOperationalPanel,
  IndicatorsProductivityPanel,
  IndicatorsInventoryPanel,
  IndicatorsCustomersPanel,
  IndicatorsProductsPanel,
  IndicatorsChartsPanel,
  IndicatorsAlertsPanel,
  IndicatorsInsightsPanel,
} from '../../components/indicadores/IndicatorsHubPanels';

const TABS = [
  { id: 'general', label: 'Panel', icon: MdDashboard },
  { id: 'financiero', label: 'Financiero', icon: MdAttachMoney },
  { id: 'operativo', label: 'Operativo', icon: MdStore },
  { id: 'productividad', label: 'Productividad', icon: MdTrendingUp },
  { id: 'inventario', label: 'Inventario', icon: MdInventory },
  { id: 'clientes', label: 'Clientes', icon: MdPeople },
  { id: 'productos', label: 'Productos', icon: MdRestaurantMenu },
  { id: 'graficos', label: 'Gráficos', icon: MdBarChart },
  { id: 'alertas', label: 'Alertas', icon: MdNotificationsActive },
  { id: 'ia', label: 'IA analítica', icon: MdPsychology },
];

export default function Indicadores() {
  const [tab, setTab] = useState('general');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '' });

  const loadHub = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      const hub = await api.get(`/reports/indicators-hub${qs.toString() ? `?${qs}` : ''}`);
      setData(hub);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to]);

  useEffect(() => {
    setLoading(true);
    void loadHub();
  }, [loadHub]);

  useSocket('order-update', () => void loadHub());
  useSocket('new-order', () => void loadHub());
  useSocket('inventory-update', () => void loadHub());
  useSocket('staff-data-update', () => void loadHub());

  const exportCsv = () => {
    const rows = data?.products?.top_sellers || [];
    if (!rows.length) return;
    const csv = ['Producto,Cantidad,Ingresos', ...rows.map((r) => `${r.product_name},${r.qty},${r.revenue}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'indicadores-productos.csv';
    a.click();
  };

  const alertCount = data?.alerts?.length ?? 0;

  const renderPanel = () => {
    if (!data) return null;
    switch (tab) {
      case 'general':
        return <IndicatorsGeneralPanel data={data} />;
      case 'financiero':
        return <IndicatorsFinancialPanel data={data} />;
      case 'operativo':
        return <IndicatorsOperationalPanel data={data} />;
      case 'productividad':
        return <IndicatorsProductivityPanel data={data} />;
      case 'inventario':
        return <IndicatorsInventoryPanel data={data} />;
      case 'clientes':
        return <IndicatorsCustomersPanel data={data} />;
      case 'productos':
        return <IndicatorsProductsPanel data={data} />;
      case 'graficos':
        return <IndicatorsChartsPanel data={data} />;
      case 'alertas':
        return <IndicatorsAlertsPanel data={data} />;
      case 'ia':
        return <IndicatorsInsightsPanel data={data} />;
      default:
        return <IndicatorsGeneralPanel data={data} />;
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="animate-spin w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full" />
        <p className="text-sm text-[var(--ui-muted)]">Cargando indicadores…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ui-body-text)] flex items-center gap-2">
            <MdInsights className="text-gold-600" /> Indicadores
          </h1>
          <p className="text-sm text-[var(--ui-muted)] mt-1 max-w-2xl">
            Centro de análisis conectado con caja, mesas, cocina, delivery, inventario, clientes y ventas en tiempo real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => { setLoading(true); void loadHub(); }}>
            Actualizar
          </button>
          <button type="button" className="btn-secondary text-sm flex items-center gap-1" onClick={exportCsv}>
            <MdDownload /> Exportar
          </button>
        </div>
      </div>

      <div className="card grid grid-cols-1 md:grid-cols-2 gap-3 py-3">
        <div>
          <label className="block text-xs text-[var(--ui-muted)] mb-1">Desde</label>
          <input type="date" className="input-field" value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-[var(--ui-muted)] mb-1">Hasta</label>
          <input type="date" className="input-field" value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition ${
              tab === t.id
                ? 'bg-gold-600 text-white border-gold-600'
                : 'bg-[var(--ui-surface)] border-[color:var(--ui-border)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]'
            }`}
          >
            <t.icon />
            {t.label}
            {t.id === 'alertas' && alertCount > 0 ? (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px]">{alertCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {data?.generated_at ? (
        <p className="text-[10px] text-[var(--ui-muted)]">Actualizado: {new Date(data.generated_at).toLocaleString('es-PE')}</p>
      ) : null}

      {renderPanel()}
    </div>
  );
}
