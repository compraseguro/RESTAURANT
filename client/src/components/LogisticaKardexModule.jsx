import { useState, useEffect, useCallback } from 'react';
import { api, formatCurrency, API_BASE, formatDateTime } from '../utils/api';
import toast from 'react-hot-toast';
import { MdDownload, MdWarning, MdInventory2, MdAdd, MdList } from 'react-icons/md';
import Modal from './Modal';

const TABS = [
  { id: 'dashboard', label: 'Resumen' },
  { id: 'insumos', label: 'Insumos' },
  { id: 'compras', label: 'Compras' },
  { id: 'recetas', label: 'Recetas' },
  { id: 'kardex', label: 'Kardex' },
  { id: 'inv_fisico', label: 'Inventario de transformables' },
  { id: 'inv_no_transform', label: 'Inventario de no transformables' },
  { id: 'ajustes', label: 'Ajustes / mermas' },
];

const BASE = '/kardex-inventory';

function parseWarehouseMeta(description, fallbackStock) {
  const raw = description || '';
  const transformedMatch = raw.match(/\[WAREHOUSE_PROCESS:(transformed|non_transformed)\]/);
  const mainMatch = raw.match(/\[STOCK_MAIN:(-?\d+)\]/);
  const kitchenMatch = raw.match(/\[STOCK_KITCHEN:(-?\d+)\]/);
  const notes = raw.replace(/\[(WAREHOUSE_PROCESS|STOCK_MAIN|STOCK_KITCHEN):[^\]]+\]\s*/g, '').trim();
  const fallback = Math.max(0, Number(fallbackStock || 0));
  let stockMain = mainMatch ? Math.max(0, parseInt(mainMatch[1], 10) || 0) : fallback;
  let stockKitchen = kitchenMatch ? Math.max(0, parseInt(kitchenMatch[1], 10) || 0) : 0;
  if (!mainMatch && kitchenMatch) stockMain = Math.max(0, fallback - stockKitchen);
  if (!mainMatch && !kitchenMatch) {
    stockMain = fallback;
    stockKitchen = 0;
  }
  return {
    process: transformedMatch ? transformedMatch[1] : 'non_transformed',
    stockMain,
    stockKitchen,
    notes,
  };
}

const sameWarehouseId = (a, b) => String(a || '') === String(b || '');

export default function LogisticaKardexModule() {
  const [tab, setTab] = useState('dashboard');
  const [insumos, setInsumos] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [invList, setInvList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [insumoForm, setInsumoForm] = useState({
    nombre: '', unidad_medida: 'kg', stock_minimo: '0', activo: true,
  });
  const [compraLines, setCompraLines] = useState([{ insumo_id: '', cantidad: '', costo_unitario: '' }]);
  const [recetaForm, setRecetaForm] = useState({
    nombre_plato: '', product_id: '', activo: true, detalles: [{ insumo_id: '', cantidad_usada: '' }],
  });
  const [editingRecetaId, setEditingRecetaId] = useState('');

  const [kardexInsumo, setKardexInsumo] = useState('');
  const [kardexFrom, setKardexFrom] = useState('');
  const [kardexTo, setKardexTo] = useState('');
  const [kardexData, setKardexData] = useState(null);

  const [invDetalles, setInvDetalles] = useState([{ insumo_id: '', stock_real: '' }]);
  const [ajusteForm, setAjusteForm] = useState({
    insumo_id: '', cantidad: '', tipo: 'salida', referencia: 'merma',
  });

  const [whProducts, setWhProducts] = useState([]);
  const [whWarehouses, setWhWarehouses] = useState([]);
  const [cuadreWarehouseId, setCuadreWarehouseId] = useState('');
  const [logisticsCounted, setLogisticsCounted] = useState({});
  const [showReconciliationsModal, setShowReconciliationsModal] = useState(false);
  const [reconciliationHistory, setReconciliationHistory] = useState([]);

  const loadCore = useCallback(async () => {
    const [ins, dash, prods, rec, inv] = await Promise.all([
      api.get(`${BASE}/insumos`),
      api.get(`${BASE}/dashboard`),
      api.get('/products').catch(() => []),
      api.get(`${BASE}/recetas`),
      api.get(`${BASE}/inventario-fisico`),
    ]);
    setInsumos(Array.isArray(ins) ? ins : []);
    setDashboard(dash);
    setProducts(Array.isArray(prods) ? prods : []);
    setRecetas(Array.isArray(rec) ? rec : []);
    setInvList(Array.isArray(inv) ? inv : []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadCore();
      } catch (e) {
        toast.error(e.message || 'No se pudo cargar inventario kardex');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCore]);

  const loadWhData = useCallback(async () => {
    const data = await api.get('/inventory/warehouse-stock');
    const wh = data.warehouses || [];
    const list = (data.products || [])
      .map((p) => {
        const parsed = parseWarehouseMeta(p.description, p.stock);
        return {
          ...p,
          process:
            p.process_type === 'non_transformed'
              ? 'non_transformed'
              : p.process_type === 'transformed'
                ? 'transformed'
                : parsed.process,
          warehouse_stocks: p.warehouse_stocks || [],
          stock: Number(p.total_stock || 0),
        };
      })
      .filter((p) => p.process === 'non_transformed');
    setWhWarehouses(wh);
    setWhProducts(list);
    setCuadreWarehouseId((prev) => {
      if (prev) return prev;
      const pr = wh.find((w) => w.name === 'Almacen Principal') || wh[0];
      return pr ? String(pr.id) : '';
    });
  }, []);

  useEffect(() => {
    if (tab !== 'inv_no_transform') return;
    loadWhData().catch((e) => toast.error(e.message || 'No se pudo cargar almacén'));
  }, [tab, loadWhData]);

  useEffect(() => {
    if (tab !== 'inv_no_transform') return;
    (async () => {
      try {
        const reconciliations = await api.get('/inventory/reconciliations');
        setReconciliationHistory(reconciliations || []);
      } catch (_) {}
    })();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'kardex' || !kardexInsumo) {
      setKardexData(null);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const q = new URLSearchParams();
        if (kardexFrom) q.set('from', kardexFrom);
        if (kardexTo) q.set('to', kardexTo);
        const r = await api.get(`${BASE}/kardex/${kardexInsumo}${q.toString() ? `?${q}` : ''}`);
        if (!cancel) setKardexData(r);
      } catch (e) {
        if (!cancel) toast.error(e.message);
      }
    })();
    return () => { cancel = true; };
  }, [tab, kardexInsumo, kardexFrom, kardexTo]);

  const addInsumo = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${BASE}/insumos`, {
        nombre: insumoForm.nombre.trim(),
        unidad_medida: insumoForm.unidad_medida,
        stock_minimo: parseFloat(insumoForm.stock_minimo) || 0,
        activo: insumoForm.activo,
      });
      toast.success('Insumo creado');
      setInsumoForm({ nombre: '', unidad_medida: 'kg', stock_minimo: '0', activo: true });
      loadCore();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const runCompra = async (e) => {
    e.preventDefault();
    const items = compraLines
      .filter((l) => l.insumo_id && l.cantidad && l.costo_unitario)
      .map((l) => ({
        insumo_id: l.insumo_id,
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario),
      }));
    if (!items.length) {
      toast.error('Agrega líneas con insumo, cantidad y costo unitario');
      return;
    }
    try {
      await api.post(`${BASE}/compras`, { items });
      toast.success('Compra registrada en kardex');
      setCompraLines([{ insumo_id: '', cantidad: '', costo_unitario: '' }]);
      loadCore();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const saveReceta = async (e) => {
    e.preventDefault();
    if (!recetaForm.nombre_plato.trim() || !recetaForm.product_id) {
      toast.error('Nombre de plato y producto del menú son obligatorios');
      return;
    }
    const detalles = recetaForm.detalles
      .filter((d) => d.insumo_id && d.cantidad_usada !== '')
      .map((d) => ({
        insumo_id: d.insumo_id,
        cantidad_usada: Number(d.cantidad_usada),
      }));
    const body = {
      nombre_plato: recetaForm.nombre_plato.trim(),
      product_id: recetaForm.product_id,
      activo: recetaForm.activo,
      detalles,
    };
    try {
      if (editingRecetaId) {
        await api.put(`${BASE}/recetas/${editingRecetaId}`, body);
        toast.success('Receta actualizada');
      } else {
        await api.post(`${BASE}/recetas`, body);
        toast.success('Receta creada');
      }
      setEditingRecetaId('');
      setRecetaForm({
        nombre_plato: '', product_id: '', activo: true, detalles: [{ insumo_id: '', cantidad_usada: '' }],
      });
      loadCore();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadRecetaEdit = async (id) => {
    try {
      const r = await api.get(`${BASE}/recetas/${id}`);
      setEditingRecetaId(id);
      setRecetaForm({
        nombre_plato: r.nombre_plato || '',
        product_id: r.product_id || '',
        activo: Number(r.activo) === 1,
        detalles: (r.detalles && r.detalles.length
          ? r.detalles.map((d) => ({ insumo_id: d.insumo_id, cantidad_usada: String(d.cantidad_usada) }))
          : [{ insumo_id: '', cantidad_usada: '' }]),
      });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const crearInventarioFisico = async (e) => {
    e.preventDefault();
    const detalles = invDetalles
      .filter((d) => d.insumo_id && d.stock_real !== '')
      .map((d) => ({ insumo_id: d.insumo_id, stock_real: Number(d.stock_real) }));
    if (!detalles.length) {
      toast.error('Agrega al menos un insumo con stock real contado');
      return;
    }
    try {
      const res = await api.post(`${BASE}/inventario-fisico`, { detalles });
      toast.success(`Inventario físico ${res.id?.slice(0, 8) || ''} creado (pendiente de cierre)`);
      setInvDetalles([{ insumo_id: '', stock_real: '' }]);
      loadCore();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const cerrarInventario = async (id) => {
    if (!confirm('¿Cerrar este inventario? Se generarán entradas/salidas en kardex según las diferencias.')) return;
    try {
      await api.post(`${BASE}/inventario-fisico/${id}/cerrar`, {});
      toast.success('Inventario cerrado y kardex actualizado');
      loadCore();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const enviarAjuste = async (e) => {
    e.preventDefault();
    if (!ajusteForm.insumo_id || !ajusteForm.cantidad) {
      toast.error('Insumo y cantidad requeridos');
      return;
    }
    try {
      await api.post(`${BASE}/ajustes`, {
        insumo_id: ajusteForm.insumo_id,
        cantidad: Number(ajusteForm.cantidad),
        tipo: ajusteForm.tipo,
        referencia: ajusteForm.referencia || (ajusteForm.tipo === 'entrada' ? 'ajuste' : 'merma'),
      });
      toast.success('Ajuste registrado');
      setAjusteForm({ insumo_id: '', cantidad: '', tipo: 'salida', referencia: 'merma' });
      loadCore();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const descargarKardexCsv = async () => {
    if (!kardexInsumo) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}${BASE}/export/kardex/${kardexInsumo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t);
        throw new Error(j.error || t);
      } catch (_) {
        throw new Error('No se pudo exportar');
      }
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex-${kardexInsumo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const logisticsProductsFiltered = whProducts
    .filter((product) => {
      if (!cuadreWarehouseId) return true;
      return (product.warehouse_stocks || []).some((ws) => sameWarehouseId(ws.warehouse_id, cuadreWarehouseId));
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const getLogisticsCurrentStock = (product) => {
    if (!cuadreWarehouseId) return Number(product.stock || 0);
    return Number(
      (product.warehouse_stocks || []).find((ws) => sameWarehouseId(ws.warehouse_id, cuadreWarehouseId))?.quantity || 0
    );
  };

  const getLogisticsDiff = (product) => {
    const current = getLogisticsCurrentStock(product);
    const raw = logisticsCounted[product.id];
    if (raw === '' || raw === undefined) return null;
    const counted = Number(raw);
    if (Number.isNaN(counted)) return null;
    return counted - current;
  };

  const saveWarehouseReconciliation = async () => {
    if (!cuadreWarehouseId) {
      toast.error('Selecciona un almacén');
      return;
    }
    const selectedWarehouse = whWarehouses.find((w) => sameWarehouseId(w.id, cuadreWarehouseId));
    if (!selectedWarehouse) {
      toast.error('Almacén no válido');
      return;
    }
    const items = logisticsProductsFiltered
      .filter((product) => logisticsCounted[product.id] !== '' && logisticsCounted[product.id] !== undefined)
      .map((product) => {
        const current = getLogisticsCurrentStock(product);
        const counted = Number(logisticsCounted[product.id] || 0);
        const diff = counted - current;
        return {
          product_id: product.id,
          product_name: product.name,
          current_stock: current,
          counted_stock: counted,
          difference: diff,
          unit_cost: Number(product.price || 0),
          valuation: Number(product.price || 0) * current,
        };
      });
    if (!items.length) {
      toast.error('Ingresa cantidades contadas antes de guardar');
      return;
    }
    try {
      await api.post('/inventory/reconciliations', {
        warehouse_id: selectedWarehouse.id,
        items,
      });
      const history = await api.get('/inventory/reconciliations');
      setReconciliationHistory(history || []);
      setLogisticsCounted({});
      await loadWhData();
      toast.success('Cuadre de almacén guardado');
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar el cuadre');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500/80 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 text-[#F9FAFB]">
      <p className="text-sm text-[#9CA3AF]">
        Insumos, compras, recetas, kardex, inventario de transformables (insumos) y no transformables (cuadre en almacén).
        Las ventas en caja descuentan según recetas.
      </p>
      <div className="flex flex-wrap gap-1.5 border-b border-[#3B82F6]/25 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === t.id
                ? 'bg-[#2563EB] text-white shadow-sm border border-[#3B82F6]/40'
                : 'bg-[#1F2937] text-[#D1D5DB] hover:bg-[#374151] border border-[#3B82F6]/20'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && dashboard && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-[#1F2937] rounded-xl border border-[#3B82F6]/25 p-4">
            <p className="text-[#9CA3AF] text-sm">Valor total del inventario (insumos)</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(dashboard.valor_inventario_total)}</p>
            <p className="text-xs text-[#9CA3AF] mt-2">{dashboard.total_insumos} insumos activos</p>
          </div>
          <div className="bg-[#1F2937] rounded-xl border border-[#3B82F6]/25 p-4">
            <p className="text-amber-300/90 text-sm flex items-center gap-1.5">
              <MdWarning className="inline" /> Bajo mínimo
            </p>
            <p className="text-xl font-bold text-amber-400 mt-1">{dashboard.insumos_bajo_minimo?.length || 0}</p>
            <ul className="mt-2 max-h-28 overflow-y-auto text-sm space-y-0.5">
              {(dashboard.insumos_bajo_minimo || []).map((i) => (
                <li key={i.id} className="flex justify-between text-slate-300">
                  <span>{i.nombre}</span>
                  <span className="text-red-400">
                    {Number(i.stock_actual).toFixed(3)} / min {Number(i.stock_minimo).toFixed(3)} {i.unidad_medida}
                  </span>
                </li>
              ))}
            </ul>
            {(!dashboard.insumos_bajo_minimo || !dashboard.insumos_bajo_minimo.length) && (
              <p className="text-slate-500 text-sm mt-1">Ninguno por debajo del mínimo.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'insumos' && (
        <div className="space-y-4">
          <form onSubmit={addInsumo} className="flex flex-wrap gap-2 items-end bg-slate-800/40 p-3 rounded-lg border border-slate-600/40">
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Nombre</label>
              <input
                className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 w-48"
                value={insumoForm.nombre}
                onChange={(e) => setInsumoForm((f) => ({ ...f, nombre: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Unidad</label>
              <input
                className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 w-24"
                value={insumoForm.unidad_medida}
                onChange={(e) => setInsumoForm((f) => ({ ...f, unidad_medida: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-0.5">Stock mín.</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 w-24"
                value={insumoForm.stock_minimo}
                onChange={(e) => setInsumoForm((f) => ({ ...f, stock_minimo: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={insumoForm.activo}
                onChange={(e) => setInsumoForm((f) => ({ ...f, activo: e.target.checked }))}
              />
              Activo
            </label>
            <button type="submit" className="btn-primary flex items-center gap-1 text-sm">
              <MdAdd /> Agregar
            </button>
          </form>
          <div className="overflow-x-auto border border-slate-600/50 rounded-lg">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-slate-700/90 text-slate-100 text-left">
                  <th className="p-2.5">Insumo</th>
                  <th className="p-2.5">U.M.</th>
                  <th className="p-2.5 text-right">Stock</th>
                  <th className="p-2.5 text-right">Mín.</th>
                  <th className="p-2.5 text-right">C. prom.</th>
                  <th className="p-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((i) => {
                  const low = Number(i.stock_actual) < Number(i.stock_minimo);
                  return (
                    <tr key={i.id} className={`border-b border-slate-600/40 ${low ? 'bg-red-950/30' : ''}`}>
                      <td className="p-2.5 font-medium">{i.nombre}</td>
                      <td className="p-2.5 text-slate-400">{i.unidad_medida}</td>
                      <td className={`p-2.5 text-right ${low ? 'text-red-300 font-semibold' : 'text-slate-200'}`}>
                        {Number(i.stock_actual).toFixed(4)}
                      </td>
                      <td className="p-2.5 text-right text-slate-400">{Number(i.stock_minimo).toFixed(2)}</td>
                      <td className="p-2.5 text-right">{formatCurrency(i.costo_promedio || 0)}</td>
                      <td className="p-2.5 text-right text-emerald-400/90">
                        {formatCurrency((Number(i.stock_actual) * Number(i.costo_promedio)) || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'compras' && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">Registro de entradas con costo unitario. Actualiza stock y costo promedio ponderado.</p>
          <form onSubmit={runCompra} className="space-y-2">
            {compraLines.map((row, idx) => (
              <div key={idx} className="flex flex-wrap gap-2 items-center">
                <select
                  className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 min-w-[180px]"
                  value={row.insumo_id}
                  onChange={(e) => {
                    const n = [...compraLines];
                    n[idx] = { ...n[idx], insumo_id: e.target.value };
                    setCompraLines(n);
                  }}
                >
                  <option value="">— Insumo —</option>
                  {insumos.map((i) => (
                    <option key={i.id} value={i.id}>{i.nombre}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  placeholder="Cantidad"
                  className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 w-28"
                  value={row.cantidad}
                  onChange={(e) => {
                    const n = [...compraLines];
                    n[idx] = { ...n[idx], cantidad: e.target.value };
                    setCompraLines(n);
                  }}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Costo u."
                  className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 w-28"
                  value={row.costo_unitario}
                  onChange={(e) => {
                    const n = [...compraLines];
                    n[idx] = { ...n[idx], costo_unitario: e.target.value };
                    setCompraLines(n);
                  }}
                />
                {compraLines.length > 1 && (
                  <button
                    type="button"
                    className="text-red-400 text-sm"
                    onClick={() => setCompraLines((l) => l.filter((_, j) => j !== idx))}
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                className="text-sm text-amber-400/90"
                onClick={() => setCompraLines((l) => [...l, { insumo_id: '', cantidad: '', costo_unitario: '' }])}
              >
                + Línea
              </button>
              <button type="submit" className="btn-primary">Registrar compra</button>
            </div>
          </form>
        </div>
      )}

      {tab === 'recetas' && (
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">
            Vincula un plato del menú a insumos. Al cobrar en caja, se descuenta stock según receta × cantidad vendida.
          </p>
          <form onSubmit={saveReceta} className="bg-slate-800/50 p-4 rounded-xl border border-slate-600/50 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="block text-xs text-slate-500">Nombre receta / plato</label>
                <input
                  className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 w-48"
                  value={recetaForm.nombre_plato}
                  onChange={(e) => setRecetaForm((f) => ({ ...f, nombre_plato: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Producto menú</label>
                <select
                  className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 min-w-[200px]"
                  value={recetaForm.product_id}
                  onChange={(e) => setRecetaForm((f) => ({ ...f, product_id: e.target.value }))}
                >
                  <option value="">— Seleccionar —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-end gap-2 h-full pb-1 text-sm">
                <input
                  type="checkbox"
                  checked={recetaForm.activo}
                  onChange={(e) => setRecetaForm((f) => ({ ...f, activo: e.target.checked }))}
                />
                Activo
              </label>
            </div>
            <div className="space-y-2">
              <p className="text-slate-500 text-xs">Insumos por unidad de plato (1 servicio)</p>
              {recetaForm.detalles.map((d, di) => (
                <div key={di} className="flex flex-wrap gap-2 items-center">
                  <select
                    className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
                    value={d.insumo_id}
                    onChange={(e) => {
                      const n = [...recetaForm.detalles];
                      n[di] = { ...n[di], insumo_id: e.target.value };
                      setRecetaForm((f) => ({ ...f, detalles: n }));
                    }}
                  >
                    <option value="">— Insumo —</option>
                    {insumos.map((i) => (
                      <option key={i.id} value={i.id}>{i.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    placeholder="Cant. usada"
                    className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 w-32"
                    value={d.cantidad_usada}
                    onChange={(e) => {
                      const n = [...recetaForm.detalles];
                      n[di] = { ...n[di], cantidad_usada: e.target.value };
                      setRecetaForm((f) => ({ ...f, detalles: n }));
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-amber-400/90 text-sm"
                onClick={() => setRecetaForm((f) => ({
                  ...f,
                  detalles: [...f.detalles, { insumo_id: '', cantidad_usada: '' }],
                }))}
              >
                + Insumo
              </button>
            </div>
            <div className="flex gap-2">
              {editingRecetaId && (
                <button
                  type="button"
                  className="px-3 py-1.5 border border-slate-500 rounded-lg text-slate-300"
                  onClick={() => {
                    setEditingRecetaId('');
                    setRecetaForm({
                      nombre_plato: '', product_id: '', activo: true, detalles: [{ insumo_id: '', cantidad_usada: '' }],
                    });
                  }}
                >
                  Cancelar edición
                </button>
              )}
              <button type="submit" className="btn-primary">
                {editingRecetaId ? 'Guardar receta' : 'Crear receta'}
              </button>
            </div>
          </form>
          <div className="border border-slate-600/50 rounded-lg overflow-hidden">
            {recetas.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-2 border-b border-slate-600/40 last:border-0"
              >
                <div>
                  <span className="font-medium">{r.nombre_plato}</span>
                  <span className="text-slate-500 text-sm ml-2">· {r.product_name || r.product_id}</span>
                </div>
                <button type="button" className="text-amber-400/90 text-sm" onClick={() => loadRecetaEdit(r.id)}>
                  Editar
                </button>
              </div>
            ))}
            {!recetas.length && <p className="p-4 text-slate-500 text-sm">No hay recetas. Crea una y vincúlala a un plato.</p>}
          </div>
        </div>
      )}

      {tab === 'kardex' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-slate-500">Insumo</label>
              <select
                className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
                value={kardexInsumo}
                onChange={(e) => setKardexInsumo(e.target.value)}
              >
                <option value="">— Seleccionar —</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>{i.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500">Desde</label>
              <input
                type="date"
                className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
                value={kardexFrom}
                onChange={(e) => setKardexFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Hasta</label>
              <input
                type="date"
                className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
                value={kardexTo}
                onChange={(e) => setKardexTo(e.target.value)}
              />
            </div>
            {kardexInsumo && (
              <button
                type="button"
                onClick={() => descargarKardexCsv().catch((e) => toast.error(e.message))}
                className="flex items-center gap-1 text-sm bg-slate-700 hover:bg-slate-600 border border-slate-500 rounded-lg px-2 py-1.5"
              >
                <MdDownload /> Excel (CSV)
              </button>
            )}
          </div>
          {kardexData && (
            <div className="text-sm text-slate-400 mb-2">
              <MdInventory2 className="inline mr-1" />
              Valor inventario actual: <span className="text-emerald-400 font-medium">{formatCurrency(kardexData.valor_inventario)}</span>
              {' · '}
              Stock: {Number(kardexData.insumo?.stock_actual).toFixed(4)} {kardexData.insumo?.unidad_medida}
            </div>
          )}
          <div className="overflow-x-auto border border-slate-600/50 rounded-lg max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 bg-slate-700/95 z-10">
                <tr className="text-left text-slate-100">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Ref.</th>
                  <th className="p-2 text-right">Cant.</th>
                  <th className="p-2 text-right">C. unit.</th>
                  <th className="p-2 text-right">C. total</th>
                  <th className="p-2 text-right">Stock res.</th>
                </tr>
              </thead>
              <tbody>
                {(kardexData?.movimientos || []).map((m) => (
                  <tr key={m.id} className="border-b border-slate-600/40">
                    <td className="p-2 text-slate-300">{formatDateTime(m.fecha || m.created_at)}</td>
                    <td className="p-2">
                      <span
                        className={
                          m.tipo_movimiento === 'entrada'
                            ? 'text-emerald-400'
                            : m.tipo_movimiento === 'salida'
                              ? 'text-red-400'
                              : 'text-amber-300'
                        }
                      >
                        {m.tipo_movimiento}
                      </span>
                    </td>
                    <td className="p-2 text-slate-500 text-xs">{m.referencia} {m.referencia_id?.slice(0, 8)}</td>
                    <td className="p-2 text-right">{Number(m.cantidad).toFixed(4)}</td>
                    <td className="p-2 text-right">{formatCurrency(m.costo_unitario)}</td>
                    <td className="p-2 text-right">{formatCurrency(m.costo_total)}</td>
                    <td className="p-2 text-right font-medium text-slate-200">{Number(m.stock_resultante).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {kardexInsumo && kardexData && !(kardexData.movimientos || []).length && (
              <p className="p-6 text-slate-500 text-center">Sin movimientos en el rango.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'inv_fisico' && (
        <div className="space-y-4">
          <p className="text-[#9CA3AF] text-sm">
            <strong className="text-[#E5E7EB]">Inventario de transformables (insumos):</strong>{' '}
            conteo físico de materiales del kardex. Registra el conteo (pendiente) y luego <strong>cierra</strong> para generar movimientos valorizados.
          </p>
          <form onSubmit={crearInventarioFisico} className="space-y-2">
            {invDetalles.map((d, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <select
                  className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
                  value={d.insumo_id}
                  onChange={(e) => {
                    const n = [...invDetalles];
                    n[i] = { ...n[i], insumo_id: e.target.value };
                    setInvDetalles(n);
                  }}
                >
                  <option value="">— Insumo —</option>
                  {insumos.map((x) => (
                    <option key={x.id} value={x.id}>{x.nombre}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="Stock contado (real)"
                  className="bg-slate-900 border border-slate-500 rounded px-2 py-1.5 w-44"
                  value={d.stock_real}
                  onChange={(e) => {
                    const n = [...invDetalles];
                    n[i] = { ...n[i], stock_real: e.target.value };
                    setInvDetalles(n);
                  }}
                />
              </div>
            ))}
            <button type="button" className="text-amber-400/90 text-sm" onClick={() => setInvDetalles((l) => [...l, { insumo_id: '', stock_real: '' }])}>
              + Fila
            </button>
            <button type="submit" className="btn-primary block">Crear toma (pendiente)</button>
          </form>
          <div className="mt-4 space-y-2">
            <p className="text-slate-500 text-xs flex items-center gap-1"><MdList /> Últimos inventarios</p>
            {invList.map((iv) => (
              <div key={iv.id} className="flex items-center justify-between bg-slate-800/50 border border-slate-600/40 rounded-lg px-3 py-2">
                <div>
                  <span className="text-slate-200">{iv.id?.slice(0, 8)}</span>
                  <span className="text-slate-500 text-sm ml-2">{formatDateTime(iv.fecha || iv.created_at)}</span>
                  <span className={`ml-2 text-xs ${iv.estado === 'cerrado' ? 'text-slate-500' : 'text-amber-400'}`}>
                    {iv.estado}
                  </span>
                </div>
                {iv.estado === 'pendiente' && (
                  <button type="button" onClick={() => cerrarInventario(iv.id)} className="text-sm text-amber-400/90">
                    Cerrar y ajustar kardex
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'inv_no_transform' && (
        <div className="space-y-4">
          <p className="text-[#9CA3AF] text-sm">
            <strong className="text-[#E5E7EB]">Inventario de no transformables:</strong>{' '}
            productos de almacén (sin transformar) para cuadre físico por ubicación. Alinea el stock del almacén con el conteo real.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-[#D1D5DB]">
              Almacén:
              <select
                value={cuadreWarehouseId}
                onChange={(e) => {
                  setCuadreWarehouseId(e.target.value);
                  setLogisticsCounted({});
                }}
                className="bg-[#1F2937] border border-[#3B82F6]/35 rounded-lg px-2 py-1.5 text-[#F9FAFB] text-sm"
              >
                {whWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowReconciliationsModal(true)}
              className="text-sm px-3 py-1.5 rounded-lg border border-[#3B82F6]/35 bg-[#1F2937] text-[#E5E7EB] hover:bg-[#374151]"
            >
              Historial de cuadres
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#3B82F6]/25 bg-[#111827]/50">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-[#1F2937] border-b border-[#3B82F6]/20 text-left text-[#E5E7EB]">
                  <th className="p-2.5 font-medium w-20">#</th>
                  <th className="p-2.5 font-medium">Producto</th>
                  <th className="p-2.5 font-medium">Categoría</th>
                  <th className="p-2.5 font-medium text-right">Stock sistema</th>
                  <th className="p-2.5 font-medium text-right">Cantidad contada</th>
                  <th className="p-2.5 font-medium text-right">Diferencia</th>
                  <th className="p-2.5 font-medium text-right">Costo UM</th>
                  <th className="p-2.5 font-medium text-right">Valorización</th>
                </tr>
              </thead>
              <tbody>
                {logisticsProductsFiltered.map((product, idx) => {
                  const diff = getLogisticsDiff(product);
                  const unitCost = Number(product.price || 0);
                  const stock = getLogisticsCurrentStock(product);
                  const valuation = unitCost * stock;
                  return (
                    <tr key={product.id} className="border-b border-[#3B82F6]/15 hover:bg-[#1F2937]/40">
                      <td className="p-2.5 text-[#9CA3AF]">#{String(idx + 1).padStart(3, '0')}</td>
                      <td className="p-2.5 font-medium text-[#F9FAFB]">{product.name}</td>
                      <td className="p-2.5 text-[#9CA3AF]">{product.category_name || '—'}</td>
                      <td className="p-2.5 text-right">{stock}</td>
                      <td className="p-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          value={logisticsCounted[product.id] ?? ''}
                          onChange={(e) => setLogisticsCounted((prev) => ({ ...prev, [product.id]: e.target.value }))}
                          className="w-24 ml-auto rounded-lg border border-[#3B82F6]/35 bg-[#1F2937] py-1.5 px-2 text-right text-sm text-[#F9FAFB]"
                          placeholder="0"
                        />
                      </td>
                      <td
                        className={`p-2.5 text-right font-medium ${
                          diff === null ? 'text-[#6B7280]' : diff === 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-sky-400'
                        }`}
                      >
                        {diff === null ? '—' : diff}
                      </td>
                      <td className="p-2.5 text-right">{formatCurrency(unitCost)}</td>
                      <td className="p-2.5 text-right">{formatCurrency(valuation)}</td>
                    </tr>
                  );
                })}
                {logisticsProductsFiltered.length === 0 && (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-[#9CA3AF]">
                      No hay productos no transformados en este almacén. Usa Movimiento interno en Almacén para stock.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={saveWarehouseReconciliation} className="btn-primary">
              Guardar cuadre de almacén
            </button>
          </div>
        </div>
      )}

      {tab === 'ajustes' && (
        <form onSubmit={enviarAjuste} className="max-w-md space-y-3">
          <p className="text-slate-400 text-sm">Entrada manual o salida por merma (al costo promedio al salir).</p>
          <div>
            <label className="block text-xs text-slate-500">Insumo</label>
            <select
              className="w-full bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
              value={ajusteForm.insumo_id}
              onChange={(e) => setAjusteForm((f) => ({ ...f, insumo_id: e.target.value }))}
            >
              <option value="">—</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre} ({Number(i.stock_actual).toFixed(2)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500">Cantidad &gt; 0</label>
            <input
              type="number"
              min="0.0001"
              step="0.0001"
              className="w-full bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
              value={ajusteForm.cantidad}
              onChange={(e) => setAjusteForm((f) => ({ ...f, cantidad: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Tipo</label>
            <select
              className="w-full bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
              value={ajusteForm.tipo}
              onChange={(e) => setAjusteForm((f) => ({ ...f, tipo: e.target.value }))}
            >
              <option value="salida">Salida (merma / pérdida)</option>
              <option value="entrada">Entrada (ajuste a favor)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500">Referencia (merma, ajuste, etc.)</label>
            <input
              className="w-full bg-slate-900 border border-slate-500 rounded px-2 py-1.5"
              value={ajusteForm.referencia}
              onChange={(e) => setAjusteForm((f) => ({ ...f, referencia: e.target.value }))}
            />
          </div>
          <button type="submit" className="btn-primary">Registrar ajuste</button>
        </form>
      )}

      <Modal
        isOpen={showReconciliationsModal}
        onClose={() => setShowReconciliationsModal(false)}
        title="Historial de cuadres de almacén"
        size="lg"
      >
        <div className="modal-sheet-body space-y-3 max-h-[70vh] overflow-y-auto">
          {reconciliationHistory.length === 0 && (
            <p className="text-sm text-[#9CA3AF]">No hay cuadres guardados.</p>
          )}
          {reconciliationHistory.map((rec) => (
            <div key={rec.id} className="border border-[#3B82F6]/25 rounded-lg p-3 bg-[#1F2937]/80">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-[#F9FAFB]">{rec.warehouse_name || 'Almacén'}</p>
                <p className="text-xs text-[#9CA3AF]">{formatDateTime(rec.created_at)}</p>
              </div>
              <p className="text-xs text-[#9CA3AF] mb-2">
                Items: {rec.total_items} · Faltante: {rec.total_shortage} · Sobrante: {rec.total_surplus}
              </p>
              <div className="space-y-1">
                {(rec.items || []).map((item) => (
                  <div key={item.id} className="text-sm flex items-center justify-between border-b border-[#3B82F6]/15 pb-1 text-[#E5E7EB]">
                    <span>{item.product_name}</span>
                    <span
                      className={`font-medium ${
                        Number(item.difference || 0) < 0
                          ? 'text-red-400'
                          : Number(item.difference || 0) > 0
                            ? 'text-sky-400'
                            : 'text-emerald-400'
                      }`}
                    >
                      {Number(item.difference || 0) === 0
                        ? 'Cuadrado'
                        : Number(item.difference || 0) < 0
                          ? `Falta ${Math.abs(Number(item.difference || 0))}`
                          : `Sobra ${Number(item.difference || 0)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
