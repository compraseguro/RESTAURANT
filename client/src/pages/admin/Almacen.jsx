import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, formatCurrency } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { MdSearch, MdWarning, MdAdd, MdRemove, MdDownload } from 'react-icons/md';
import Modal from '../../components/Modal';
import LogisticaKardexModule from '../../components/LogisticaKardexModule';

const WAREHOUSE_CATEGORY_NAMES = {
  products: 'PRODUCTOS ALMACEN',
  supplies: 'INSUMOS',
};

const DEFAULT_STOCK_WAREHOUSE = '';

function parseWarehouseMeta(description, fallbackStock) {
  const raw = description || '';
  const transformedMatch = raw.match(/\[WAREHOUSE_PROCESS:(transformed|non_transformed)\]/);
  const mainMatch = raw.match(/\[STOCK_MAIN:(-?\d+)\]/);
  const kitchenMatch = raw.match(/\[STOCK_KITCHEN:(-?\d+)\]/);
  const notes = raw.replace(/\[(WAREHOUSE_PROCESS|STOCK_MAIN|STOCK_KITCHEN):[^\]]+\]\s*/g, '').trim();

  const fallback = Math.max(0, Number(fallbackStock || 0));
  let stockMain = mainMatch ? Math.max(0, parseInt(mainMatch[1], 10) || 0) : fallback;
  let stockKitchen = kitchenMatch ? Math.max(0, parseInt(kitchenMatch[1], 10) || 0) : 0;

  if (!mainMatch && kitchenMatch) {
    stockMain = Math.max(0, fallback - stockKitchen);
  }
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

function buildWarehouseDescription(notes, process, stockMain, stockKitchen) {
  const cleanNotes = (notes || '').trim();
  const tags = [
    `[WAREHOUSE_PROCESS:${process}]`,
    `[STOCK_MAIN:${Math.max(0, parseInt(stockMain, 10) || 0)}]`,
    `[STOCK_KITCHEN:${Math.max(0, parseInt(stockKitchen, 10) || 0)}]`,
  ].join('\n');
  return cleanNotes ? `${tags}\n${cleanNotes}` : tags;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ALMACEN_VIEWS = [
  { id: 'movimiento_interno', label: 'Movimiento interno' },
  { id: 'ir_modulo_logistica', label: 'Inventario y kardex' },
  { id: 'requerimiento', label: 'Requerimiento' },
  { id: 'recepcion', label: 'Recepción' },
  { id: 'ir_modulo_gastos', label: 'Ir a módulo de gastos' },
];

export default function Almacen() {
  const { user } = useAuth();
  const planAllowsAlmacenAvanzado = user?.service_plan !== 'basico';
  const almacenViewsForPlan = planAllowsAlmacenAvanzado
    ? ALMACEN_VIEWS
    : ALMACEN_VIEWS.filter((v) => !['requerimiento', 'recepcion'].includes(v.id));

  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState(searchParams.get('view') || 'movimiento_interno');
  const [selectedWarehouseView, setSelectedWarehouseView] = useState('');
  const [search, setSearch] = useState('');
  const [stockModal, setStockModal] = useState(null);
  const [stockChange, setStockChange] = useState('');
  const [stockReason, setStockReason] = useState('');
  const [showDeleteFlow, setShowDeleteFlow] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [stockWarehouse, setStockWarehouse] = useState(DEFAULT_STOCK_WAREHOUSE);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showRequirementModal, setShowRequirementModal] = useState(false);
  const [selectedRequirementIds, setSelectedRequirementIds] = useState([]);
  const [latestRequirement, setLatestRequirement] = useState(null);
  const [receptionForm, setReceptionForm] = useState({});
  const [receptionNotes, setReceptionNotes] = useState('');
  const [expenseHistory, setExpenseHistory] = useState([]);
  const [kardexBajoMin, setKardexBajoMin] = useState([]);
  const [kardexInsumos, setKardexInsumos] = useState([]);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', description: '' });
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    price: '',
    stock: '0',
    category_id: '',
    stock_warehouse: DEFAULT_STOCK_WAREHOUSE,
    note_required: 0,
  });

  const getCategoryIdByType = (type) => categories.find(c => c.name === WAREHOUSE_CATEGORY_NAMES[type])?.id || '';
  const productCategoryOptions = categories.filter(c => {
    const name = (c.name || '').toUpperCase();
    return name !== WAREHOUSE_CATEGORY_NAMES.supplies && name !== WAREHOUSE_CATEGORY_NAMES.products;
  });
  const categoryOptionsForCreate = [
    ...categories.filter(c => c.id === getCategoryIdByType('products')),
    ...productCategoryOptions,
    ...categories.filter(c => (c.name || '').toUpperCase() === WAREHOUSE_CATEGORY_NAMES.supplies),
  ];
  const principalWarehouse = warehouses.find(w => w.name === 'Almacen Principal') || warehouses[0];
  const sameWarehouseId = (a, b) => String(a || '') === String(b || '');
  const isInsumosWarehouseName = (name) => String(name || '').toLowerCase().includes('insumos');
  const getDefaultCreateWarehouseId = () => {
    if (selectedWarehouseView && warehouses.some(w => sameWarehouseId(w.id, selectedWarehouseView))) {
      return String(selectedWarehouseView);
    }
    if (stockWarehouse && warehouses.some(w => sameWarehouseId(w.id, stockWarehouse))) {
      return String(stockWarehouse);
    }
    return String(principalWarehouse?.id || warehouses[0]?.id || '');
  };

  const load = async () => {
    try {
      const [currentCategories, warehouseData, dashK, insK] = await Promise.all([
        api.get('/categories'),
        api.get('/inventory/warehouse-stock'),
        planAllowsAlmacenAvanzado
          ? api.get('/kardex-inventory/dashboard').catch(() => null)
          : Promise.resolve(null),
        api.get('/kardex-inventory/insumos').catch(() => []),
      ]);
      setKardexBajoMin(dashK?.insumos_bajo_minimo && Array.isArray(dashK.insumos_bajo_minimo) ? dashK.insumos_bajo_minimo : []);
      setKardexInsumos(Array.isArray(insK) ? insK : []);
      setCategories(currentCategories);
      setWarehouses(warehouseData.warehouses || []);
      const warehouseProducts = (warehouseData.products || [])
        .filter(p => {
          const categoryName = (p.category_name || '').toUpperCase();
          const isSupply = categoryName === WAREHOUSE_CATEGORY_NAMES.supplies;
          const isNonTransformed = p.process_type === 'non_transformed';
          return isSupply || isNonTransformed;
        })
        .map(p => {
          const parsed = parseWarehouseMeta(p.description, p.stock);
          return {
            ...p,
            process: p.process_type === 'non_transformed' ? 'non_transformed' : (p.process_type === 'transformed' ? 'transformed' : parsed.process),
            stock_main: Number((p.warehouse_stocks || []).find(ws => ws.warehouse_name === 'Almacen Principal')?.quantity || 0),
            stock_kitchen: Number((p.warehouse_stocks || []).find(ws => ws.warehouse_name === 'Almacen Cocina')?.quantity || 0),
            stock: Number(p.total_stock || 0),
            notes: parsed.notes,
            warehouse_stocks: p.warehouse_stocks || [],
          };
        });
      setProducts(warehouseProducts);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo cargar almacén');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const loadViewData = async () => {
      try {
        if (activeView === 'recepcion') {
          const requirement = await api.get('/inventory/requirements/latest?status=pending');
          setLatestRequirement(requirement);
          const nextForm = {};
          (requirement?.items || []).forEach(item => {
            nextForm[item.product_id] = {
              quantity: String(Number(item.suggested_qty || 0)),
              unit_cost: String(Number(item.unit_cost || 0)),
              warehouse_id: item.warehouse_id || '',
            };
          });
          setReceptionForm(nextForm);
        }
        if (activeView === 'ir_modulo_gastos') {
          const expenses = await api.get('/inventory/expenses');
          setExpenseHistory(expenses || []);
        }
      } catch (err) {
        toast.error(err.message || 'No se pudo cargar la información');
      }
    };
    loadViewData();
  }, [activeView]);
  useEffect(() => {
    if (!warehouses.length) return;
    if (!itemForm.stock_warehouse) {
      setItemForm(prev => ({ ...prev, stock_warehouse: getDefaultCreateWarehouseId() }));
    }
    if (!stockWarehouse) {
      setStockWarehouse(principalWarehouse?.id || warehouses[0].id);
    }
  }, [warehouses, selectedWarehouseView]);
  useEffect(() => {
    if (!showCreateModal) return;
    const defaultWarehouseId = getDefaultCreateWarehouseId();
    if (!defaultWarehouseId) return;
    setItemForm(prev => ({ ...prev, stock_warehouse: defaultWarehouseId }));
  }, [showCreateModal, selectedWarehouseView, stockWarehouse, warehouses]);
  useEffect(() => {
    if (!categories.length) return;
    if (itemForm.category_id) return;
    setItemForm(prev => ({ ...prev, category_id: '' }));
  }, [categories]);
  useEffect(() => {
    if (!planAllowsAlmacenAvanzado && (activeView === 'requerimiento' || activeView === 'recepcion')) {
      setActiveView('movimiento_interno');
      setSearchParams({ view: 'movimiento_interno' }, { replace: true });
    }
  }, [planAllowsAlmacenAvanzado, activeView, setSearchParams]);

  useEffect(() => {
    const requestedView = searchParams.get('view');
    const isValidView = almacenViewsForPlan.some(option => option.id === requestedView);
    if (isValidView && requestedView !== activeView) {
      setActiveView(requestedView);
      return;
    }
    if (!isValidView && activeView !== 'movimiento_interno') {
      setSearchParams({ view: activeView }, { replace: true });
      return;
    }
    if (!isValidView && !requestedView) {
      setSearchParams({ view: 'movimiento_interno' }, { replace: true });
    }
  }, [activeView, searchParams, setSearchParams, almacenViewsForPlan]);

  const scopedProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });
  const lowFromWarehouse = products.filter(
    (p) => p.process === 'non_transformed' && Number(p.stock || 0) <= 10
  );
  const lowFromKardex = (kardexBajoMin || []).map((i) => {
    const uMin = Number(i.minimo_unidades) || 0;
    const sMin = Number(i.stock_minimo) || 0;
    const uAct = Number(i.stock_unidades) || 0;
    const sAct = Number(i.stock_actual) || 0;
    const bajoU = uMin > 0 && uAct < uMin;
    return {
      id: i.id,
      name: i.nombre,
      stock: bajoU ? uAct : sAct,
      minimo: bajoU ? uMin : sMin,
      isKardex: true,
      kardexPorU: bajoU,
      umed: String(i.unidad_medida || 'kg').replace(/[0-9]/g, '').trim() || 'kg',
    };
  });
  const lowStockGlobal = [...lowFromWarehouse, ...lowFromKardex];
  const productsForSelectedWarehouse = selectedWarehouseView
    ? scopedProducts.filter(p =>
      (p.warehouse_stocks || []).some(ws => sameWarehouseId(ws.warehouse_id, selectedWarehouseView))
    )
    : [];

  const warehouseUsageMap = products.reduce((acc, product) => {
    (product.warehouse_stocks || []).forEach(ws => {
      const qty = Number(ws.quantity || 0);
      if (!acc[ws.warehouse_id]) acc[ws.warehouse_id] = 0;
      if (qty > 0) acc[ws.warehouse_id] += 1;
    });
    return acc;
  }, {});

  const lowStock = productsForSelectedWarehouse.filter(
    (p) => p.process === 'non_transformed' && Number(p.stock || 0) <= 10
  );
  const selectedWarehouse = warehouses.find((w) => sameWarehouseId(w.id, selectedWarehouseView));
  const selectedIsInsumosWarehouse = isInsumosWarehouseName(selectedWarehouse?.name);
  const insumosActivos = (kardexInsumos || []).filter((i) => Number(i.activo) !== 0);
  const insumosTotalValue = insumosActivos.reduce(
    (s, i) => s + Number(i.stock_actual || 0) * Number(i.costo_promedio || 0),
    0
  );
  const insumosLowCount = insumosActivos.filter((i) => {
    const uMin = Number(i.minimo_unidades || 0);
    const uAct = Number(i.stock_unidades || 0);
    const sMin = Number(i.stock_minimo || 0);
    const sAct = Number(i.stock_actual || 0);
    return (uMin > 0 && uAct < uMin) || (sMin > 0 && sAct < sMin);
  }).length;
  const insumosTotalUnits = insumosActivos.reduce((s, i) => s + Number(i.stock_unidades || 0), 0);
  const totalValue = selectedIsInsumosWarehouse
    ? insumosTotalValue
    : productsForSelectedWarehouse.reduce((s, p) => s + (p.price * p.stock), 0);
  const expenseGroups = Object.values(
    (expenseHistory || []).reduce((acc, expense) => {
      const key = expense.requirement_id || expense.id;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          requirement_id: expense.requirement_id || null,
          created_at: expense.created_at,
          notes: expense.notes || '',
          total: 0,
          items: [],
        };
      }
      acc[key].items.push(expense);
      acc[key].total += Number(expense.total_cost || 0);
      if (expense.created_at && expense.created_at > acc[key].created_at) {
        acc[key].created_at = expense.created_at;
      }
      return acc;
    }, {})
  ).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const handleStock = async (type) => {
    const amount = parseInt(stockChange);
    if (!amount || amount <= 0) return toast.error('Cantidad inválida');
    const selectedWarehouse = warehouses.find(w => w.id === stockWarehouse);
    if (!selectedWarehouse) return toast.error('Selecciona un almacén válido');
    const signedQty = type === 'add' ? amount : -amount;
    try {
      await api.put(`/inventory/warehouse-adjust/${stockModal.id}`, {
        warehouse_id: selectedWarehouse.id,
        quantity_change: signedQty,
        reason: stockReason || (type === 'add' ? 'Ingreso manual' : 'Descuento manual'),
      });
      toast.success(`Stock ${type === 'add' ? 'agregado' : 'reducido'} en ${selectedWarehouse.name}`);
      setStockModal(null); setStockChange(''); setStockReason(''); setStockWarehouse(principalWarehouse?.id || ''); load();
    } catch (err) { toast.error(err.message); }
  };

  const closeStockModal = () => {
    setStockModal(null);
    setStockChange('');
    setStockReason('');
    setShowDeleteFlow(false);
    setDeleteReason('');
  };

  const handleDeleteProductFromAdjust = async () => {
    if (!stockModal) return;
    const reason = (deleteReason || '').trim();
    if (!reason) return;
    try {
      await api.delete(`/products/${stockModal.id}`);
      closeStockModal();
      load();
    } catch {}
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    try {
      const initialStock = parseInt(itemForm.stock || '0') || 0;
      const selectedWarehouseId = itemForm.stock_warehouse;

      const created = await api.post('/products', {
        name: itemForm.name,
        description: buildWarehouseDescription(itemForm.description, 'non_transformed', initialStock, 0),
        price: parseFloat(itemForm.price || '0'),
        stock: 0,
        category_id: itemForm.category_id || null,
        process_type: 'non_transformed',
        stock_warehouse_id: selectedWarehouseId || '',
        note_required: Number(itemForm.note_required || 0) === 1 ? 1 : 0,
      });

      if (selectedWarehouseId) {
        await api.post('/inventory/warehouse-stock', {
          product_id: created.id,
          warehouse_id: selectedWarehouseId,
          quantity: initialStock,
        });
      }
      toast.success('Producto creado');
      setShowCreateModal(false);
      setItemForm({
        name: '',
        description: '',
        price: '',
        stock: '0',
        category_id: '',
        stock_warehouse: getDefaultCreateWarehouseId(),
        note_required: 0,
      });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateWarehouse = async (e) => {
    e.preventDefault();
    if (!warehouseForm.name.trim()) return toast.error('Ingresa nombre de almacén');
    try {
      await api.post('/inventory/warehouses', {
        name: warehouseForm.name.trim(),
        description: warehouseForm.description,
      });
      toast.success('Almacén creado');
      setShowWarehouseModal(false);
      setWarehouseForm({ name: '', description: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteWarehouse = async (warehouse) => {
    if (!warehouse) return;
    if ((warehouseUsageMap[warehouse.id] || 0) > 0) {
      return toast.error('No se puede eliminar: el almacén tiene productos con stock');
    }
    if (!confirm(`¿Eliminar almacén "${warehouse.name}"?`)) return;
    try {
      await api.delete(`/inventory/warehouses/${warehouse.id}`);
      toast.success('Almacén eliminado');
      if (stockWarehouse === warehouse.id) {
        setStockWarehouse(principalWarehouse?.id || '');
      }
      if (itemForm.stock_warehouse === warehouse.id) {
        setItemForm(prev => ({ ...prev, stock_warehouse: principalWarehouse?.id || '' }));
      }
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openNewRequirement = () => {
    if (!lowStockGlobal.length) {
      toast('No hay productos con stock bajo');
      return;
    }
    setSelectedRequirementIds(lowStockGlobal.map(p => p.id));
    setShowRequirementModal(true);
  };

  const toggleRequirementItem = (productId) => {
    setSelectedRequirementIds(prev => (
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    ));
  };

  const downloadRequirementTemplate = async () => {
    if (!selectedRequirementIds.length) {
      toast.error('Selecciona al menos un producto');
      return;
    }
    try {
      const pIds = selectedRequirementIds.filter((id) => {
        const row = lowStockGlobal.find((x) => x.id === id);
        return row && !row.isKardex;
      });
      const inIds = selectedRequirementIds.filter((id) => {
        const row = lowStockGlobal.find((x) => x.id === id);
        return row && row.isKardex;
      });
      const requirement = await api.post('/inventory/requirements/low-stock', {
        product_ids: pIds,
        insumo_ids: inIds,
      });
      setLatestRequirement(requirement);
      const nextForm = {};
      (requirement.items || []).forEach(item => {
        nextForm[item.product_id] = {
          quantity: String(Number(item.suggested_qty || 0)),
          unit_cost: '0',
          warehouse_id: item.warehouse_id || '',
        };
      });
      setReceptionForm(nextForm);

      const rows = (requirement.items || []).map((p) => {
        const suggested = Math.max(0, Number(p.suggested_qty || 0));
        return [
          p.product_name || '',
          p.category_name || 'Sin categoría',
          String(Number(p.current_stock || 0)),
          '20',
          String(suggested),
          String(Number(p.price || 0)),
          '',
        ];
      });
      const header = [
        'Producto',
        'Categoría',
        'Stock actual',
        'Stock mínimo sugerido',
        'Cantidad sugerida',
        'Precio unitario',
        'Observación',
      ];
      const escapeCsv = (value) => `"${String(value || '').replace(/"/g, '""')}"`;
      const csvContent = [header, ...rows]
        .map(cols => cols.map(escapeCsv).join(','))
        .join('\n');
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const date = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `requerimiento-stock-bajo-${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      setShowRequirementModal(false);
      toast.success('Plantilla descargada y requerimiento guardado');
    } catch (err) {
      toast.error(err.message || 'No se pudo generar requerimiento');
    }
  };

  const updateReceptionField = (productId, field, value) => {
    setReceptionForm(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [field]: value,
      },
    }));
  };

  const registerReception = async () => {
    if (!latestRequirement?.id) {
      toast.error('No hay requerimiento disponible');
      return;
    }
    const payloadItems = (latestRequirement.items || [])
      .map(item => {
        const draft = receptionForm[item.product_id] || {};
        return {
          product_id: item.product_id,
          warehouse_id: draft.warehouse_id || item.warehouse_id || '',
          quantity: Number(draft.quantity || 0),
          unit_cost: Number(draft.unit_cost || 0),
        };
      })
      .filter(item => item.quantity > 0);

    if (!payloadItems.length) {
      toast.error('Ingresa cantidades para recepcionar');
      return;
    }
    const invalidCost = payloadItems.some(item => Number(item.unit_cost || 0) <= 0);
    if (invalidCost) {
      toast.error('Debes colocar el precio de compra en todos los productos recepcionados');
      return;
    }

    try {
      await api.post('/inventory/receptions/receive', {
        requirement_id: latestRequirement.id,
        notes: receptionNotes,
        items: payloadItems,
      });
      toast.success('Recepción registrada');
      setReceptionNotes('');
      const [requirement, expenses] = await Promise.all([
        api.get('/inventory/requirements/latest?status=pending'),
        api.get('/inventory/expenses'),
      ]);
      setLatestRequirement(requirement);
      setExpenseHistory(expenses || []);
      await load();
    } catch (err) {
      toast.error(err.message || 'No se pudo registrar recepción');
    }
  };

  const calcReceptionTotal = (productId) => {
    const row = receptionForm[productId] || {};
    const qty = Number(row.quantity || 0);
    const cost = Number(row.unit_cost || 0);
    return qty * cost;
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;
  const activeViewLabel = almacenViewsForPlan.find(option => option.id === activeView)?.label || 'Movimiento interno';

  if (activeView !== 'movimiento_interno') {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-slate-100">Almacenes e Inventario · {activeViewLabel}</h1>
        </div>

        {activeView === 'requerimiento' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <h3 className="font-bold text-slate-800 mb-2">Requerimiento interno</h3>
            <p className="text-slate-500 mb-4">Nuevo requerimiento tomará todos los productos con stock bajo para descargar plantilla en Excel.</p>
            <button className="btn-primary" onClick={openNewRequirement}>
              Nuevo requerimiento
            </button>
          </div>
        )}

        {activeView === 'recepcion' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <h3 className="font-bold text-slate-800 mb-2">Recepción de mercadería</h3>
            <p className="text-slate-500 mb-4">Se usa el último requerimiento descargado. Ingresa cantidad y costo para recepcionar compra.</p>
            {!latestRequirement?.items?.length ? (
              <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
                No hay requerimientos descargados. Primero crea uno en Requerimiento.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs text-slate-500">
                  Requerimiento: <strong>{latestRequirement.id?.slice(0, 8)}</strong> · Estado: <strong>{latestRequirement.status}</strong>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left p-2.5 font-medium">Producto</th>
                        <th className="text-left p-2.5 font-medium">Stock</th>
                        <th className="text-left p-2.5 font-medium">Almacén</th>
                        <th className="text-left p-2.5 font-medium">Cantidad compra</th>
                        <th className="text-left p-2.5 font-medium">Costo compra</th>
                        <th className="text-left p-2.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestRequirement.items.map(item => (
                        <tr key={item.id} className="border-b border-slate-100">
                          <td className="p-2.5 font-medium text-slate-700">{item.product_name}</td>
                          <td className="p-2.5 text-red-600 font-semibold">{item.current_stock}</td>
                          <td className="p-2.5 text-slate-600">{item.warehouse_name || '-'}</td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min="0"
                              value={receptionForm[item.product_id]?.quantity || '0'}
                              onChange={e => updateReceptionField(item.product_id, 'quantity', e.target.value)}
                              className="input-field py-1.5"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={receptionForm[item.product_id]?.unit_cost || '0'}
                              onChange={e => updateReceptionField(item.product_id, 'unit_cost', e.target.value)}
                              className="input-field py-1.5"
                            />
                          </td>
                          <td className="p-2.5 font-semibold text-slate-700">{formatCurrency(calcReceptionTotal(item.product_id))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                  <input
                    value={receptionNotes}
                    onChange={e => setReceptionNotes(e.target.value)}
                    className="input-field"
                    placeholder="Observaciones de compra (opcional)"
                  />
                </div>
                <button className="btn-primary" onClick={registerReception}>
                  Registrar recepción
                </button>
              </div>
            )}
          </div>
        )}

        {activeView === 'ir_modulo_gastos' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <h3 className="font-bold text-slate-800 mb-2">Módulo de gastos</h3>
            <p className="text-slate-500 mb-4">Gastos separados por compra, con fecha y detalle de productos recepcionados.</p>
            <div className="space-y-4">
              {expenseGroups.length === 0 && (
                <p className="text-sm text-slate-500">Aún no hay gastos registrados.</p>
              )}
              {expenseGroups.map(group => (
                <div key={group.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
                  <div className="flex items-start justify-between mb-3">
                    <p className="font-semibold text-slate-800">
                      Compra {group.requirement_id ? `· Req ${group.requirement_id.slice(0, 8)}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(group.created_at)}</p>
                  </div>
                  <div className="grid grid-cols-12 text-xs text-slate-500 border-b border-slate-200 pb-1 mb-1.5">
                    <div className="col-span-7">Lista de productos</div>
                    <div className="col-span-3 text-right">Precio por unidad</div>
                    <div className="col-span-2 text-right">Cantidad comprada</div>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map(item => (
                      <div key={item.id} className="text-sm grid grid-cols-12 items-center border-b border-slate-200/70 pb-1">
                        <span className="col-span-7 text-slate-700">{item.product_name || 'Producto'}</span>
                        <span className="col-span-3 text-right text-slate-700">{formatCurrency(item.unit_cost)}</span>
                        <span className="col-span-2 text-right text-slate-700">{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <p className="font-bold text-red-700">Total compra: {formatCurrency(group.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'ir_modulo_logistica' && <LogisticaKardexModule />}
        <Modal
          isOpen={showRequirementModal}
          onClose={() => setShowRequirementModal(false)}
          title="Nuevo requerimiento · Stock bajo"
          size="lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Incluye productos de almacén (stock ≤ 10) e <strong>insumos kardex</strong> bajo el mínimo (en U o en kg/L,
              según se configuró al crear el insumo). Puedes desmarcar filas.
            </p>
            <div className="max-h-[340px] overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left p-2.5 font-medium">Incluir</th>
                    <th className="text-left p-2.5 font-medium">Producto</th>
                    <th className="text-left p-2.5 font-medium">Categoría</th>
                    <th className="text-left p-2.5 font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockGlobal.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="p-2.5">
                        <input
                          type="checkbox"
                          checked={selectedRequirementIds.includes(p.id)}
                          onChange={() => toggleRequirementItem(p.id)}
                        />
                      </td>
                      <td className="p-2.5 font-medium text-slate-700">
                        {p.name}
                        {p.isKardex && <span className="ml-1 text-xs text-amber-700">(Kardex)</span>}
                      </td>
                      <td className="p-2.5 text-slate-500">
                        {p.isKardex ? 'Kardex insumos' : (p.category_name || 'Sin categoría')}
                      </td>
                      <td className="p-2.5 text-red-600 font-semibold">
                        {p.isKardex
                          ? (p.kardexPorU
                            ? `${p.stock} U (mín. ${p.minimo} U)`
                            : `${p.stock} ${p.umed} (mín. ${p.minimo} ${p.umed})`)
                          : p.stock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowRequirementModal(false)}
                className="btn-secondary flex-1"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={downloadRequirementTemplate}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <MdDownload /> Descargar plantilla
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Almacenes e Inventario</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowWarehouseModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <MdAdd /> Nuevo almacén
          </button>
          <button
            onClick={() => {
              setItemForm(prev => ({
                ...prev,
                category_id: '',
                stock_warehouse: getDefaultCreateWarehouseId(),
                note_required: 0,
              }));
              setShowCreateModal(true);
            }}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <MdAdd /> Nuevo producto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {warehouses.map(w => {
          const linkedProducts = isInsumosWarehouseName(w.name)
            ? insumosActivos.length
            : (warehouseUsageMap[w.id] || 0);
          const canDelete = linkedProducts === 0;
          return (
            <div
              key={w.id}
              onClick={() => setSelectedWarehouseView(String(w.id))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedWarehouseView(String(w.id));
                }
              }}
              role="button"
              tabIndex={0}
              className={`bg-white rounded-xl border p-3 flex flex-col min-h-28 text-left transition-colors ${
                sameWarehouseId(selectedWarehouseView, w.id)
                  ? 'border-gold-500 ring-2 ring-gold-200'
                  : 'border-slate-200 hover:border-gold-300'
              }`}
            >
              <p className="font-semibold text-slate-800">{w.name}</p>
              {w.description && <p className="text-xs text-slate-500 mt-1">{w.description}</p>}
              <p className="text-xs text-slate-500 mt-2">
                {isInsumosWarehouseName(w.name) ? 'Insumos vinculados: ' : 'Productos con stock: '}
                <strong>{linkedProducts}</strong>
              </p>
              <div className="mt-auto flex justify-end">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteWarehouse(w);
                  }}
                  disabled={!canDelete}
                  className={`text-xs px-3 py-1.5 rounded-lg ${
                    canDelete
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Eliminar almacén
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <div className="card"><p className="text-xs text-slate-500">Total Ítems</p><p className="text-xl font-bold">{selectedIsInsumosWarehouse ? insumosActivos.length : productsForSelectedWarehouse.length}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Valor del Inventario</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(totalValue)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Stock Bajo</p><p className="text-xl font-bold text-red-600">{selectedIsInsumosWarehouse ? insumosLowCount : lowStock.length}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Unidades Totales</p><p className="text-xl font-bold">{selectedIsInsumosWarehouse ? insumosTotalUnits : productsForSelectedWarehouse.reduce((s, p) => s + p.stock, 0)}</p></div>
      </div>
      {selectedIsInsumosWarehouse && (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Este almacén está vinculado al módulo <strong>Inventario y kardex</strong>. Los indicadores de arriba se
          calculan con los insumos (kardex), no con productos no transformados.
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <p className="font-bold text-red-700 flex items-center gap-2 mb-2"><MdWarning /> Productos con stock bajo</p>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(p => (
              <span key={p.id} className="px-3 py-1 bg-white rounded-full text-sm border border-red-200 text-red-700">{p.name}: <strong>{p.stock}</strong></span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="relative mb-4">
          <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto o insumo..." className="input-field pl-9" />
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500 border-b">
            <th className="pb-2 font-medium">Producto</th>
            <th className="pb-2 font-medium">Tipo</th>
            <th className="pb-2 font-medium">Precio Unit.</th>
            <th className="pb-2 font-medium">Principal</th>
            <th className="pb-2 font-medium">Cocina</th>
            <th className="pb-2 font-medium">Stock Total</th>
            <th className="pb-2 font-medium">Valor</th>
            <th className="pb-2 font-medium">Estado</th>
            <th className="pb-2 font-medium"></th>
          </tr></thead>
          <tbody>
            {productsForSelectedWarehouse.map(p => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="py-3 font-medium">{p.name}</td>
                <td className="py-3 text-slate-500">{p.category_name || '-'}</td>
                <td className="py-3">{formatCurrency(p.price)}</td>
                <td className="py-3 font-bold">{p.stock_main || 0}</td>
                <td className="py-3 font-bold">{p.stock_kitchen || 0}</td>
                <td className="py-3 font-bold">{p.stock}</td>
                <td className="py-3">{formatCurrency(p.price * p.stock)}</td>
                <td className="py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.stock > 10 ? 'bg-emerald-100 text-emerald-700' : p.stock > 0 ? 'bg-gold-100 text-gold-700' : 'bg-red-100 text-red-700'}`}>{p.stock > 10 ? 'Normal' : p.stock > 0 ? 'Bajo' : 'Agotado'}</span></td>
                <td className="py-3">
                  <button
                    onClick={() => {
                      setStockModal(p);
                      setStockWarehouse(principalWarehouse?.id || '');
                      setShowDeleteFlow(false);
                      setDeleteReason('');
                    }}
                    className="text-xs px-3 py-1.5 bg-sky-50 text-sky-600 rounded-lg hover:bg-sky-100"
                  >
                    Ajustar
                  </button>
                </td>
              </tr>
            ))}
            {productsForSelectedWarehouse.length === 0 && (
              <tr>
                <td colSpan="9" className="py-10 text-center text-slate-400">
                  {selectedWarehouseView
                    ? 'No hay productos en este almacén'
                    : 'Selecciona un almacén para ver sus productos'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={!!stockModal} onClose={closeStockModal} title={`Ajustar Stock - ${stockModal?.name}`} size="sm">
        <div className="space-y-4">
          <div className="text-sm text-slate-500 space-y-1">
            <p>Stock total: <strong>{stockModal?.stock}</strong> unidades</p>
            <p>Almacén principal: <strong>{stockModal?.stock_main || 0}</strong></p>
            <p>Almacén cocina: <strong>{stockModal?.stock_kitchen || 0}</strong></p>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Cantidad</label><input type="number" min="1" value={stockChange} onChange={e => setStockChange(e.target.value)} className="input-field" placeholder="0" /></div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Almacén</label>
            <select value={stockWarehouse} onChange={e => setStockWarehouse(e.target.value)} className="input-field">
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Motivo</label><input value={stockReason} onChange={e => setStockReason(e.target.value)} className="input-field" placeholder="Motivo del ajuste" /></div>
          <div className="flex gap-3">
            <button onClick={() => handleStock('remove')} className="flex-1 btn-danger flex items-center justify-center gap-1"><MdRemove /> Descontar</button>
            <button onClick={() => handleStock('add')} className="flex-1 btn-success flex items-center justify-center gap-1"><MdAdd /> Agregar</button>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteFlow(true)}
            className="w-full px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
          >
            Eliminar producto
          </button>
          {showDeleteFlow && (
            <div className="space-y-3 border border-red-200 bg-red-50 rounded-lg p-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de eliminación</label>
                <input
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  className="input-field"
                  placeholder="Escribe el motivo"
                />
              </div>
              <button
                type="button"
                onClick={handleDeleteProductFromAdjust}
                disabled={!deleteReason.trim()}
                className={`w-full px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  deleteReason.trim()
                    ? 'bg-red-700 text-white hover:bg-red-800'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Nuevo producto"
        size="sm"
        placement="right"
      >
        <form onSubmit={handleCreateItem} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              value={itemForm.name}
              onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
              className="input-field"
              required
              placeholder="Ej: Gaseosa 500ml o Harina x Kg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <input
              value={itemForm.description}
              onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
              className="input-field"
              placeholder="Descripción breve"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Precio</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={itemForm.price}
                onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stock</label>
              <input
                type="number"
                min="0"
                value={itemForm.stock}
                onChange={e => setItemForm({ ...itemForm, stock: e.target.value })}
                className="input-field"
                required
              />
            </div>
          </div>
          <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoría de producto</label>
              <select
                value={itemForm.category_id}
                onChange={e => setItemForm({ ...itemForm, category_id: e.target.value })}
                className="input-field"
              >
                <option value="">Sin categoría (solo almacén)</option>
                {categoryOptionsForCreate.length === 0 && (
                  <option value="">No hay categorías disponibles</option>
                )}
                {categoryOptionsForCreate.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.id === getCategoryIdByType('products') ? 'PRODUCTOS ALMACEN (solo almacén)' : c.name}
                  </option>
                ))}
              </select>
          </div>
          <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Almacén destino</label>
              <select
                value={itemForm.stock_warehouse}
                onChange={e => setItemForm({ ...itemForm, stock_warehouse: e.target.value })}
                className="input-field"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={Number(itemForm.note_required || 0) === 1}
              onChange={(e) => setItemForm({ ...itemForm, note_required: e.target.checked ? 1 : 0 })}
              className="rounded"
            />
            <span>Nota obligatoria al pedir</span>
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">Guardar</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showWarehouseModal}
        onClose={() => setShowWarehouseModal(false)}
        title="Nuevo almacén"
        size="sm"
      >
        <form onSubmit={handleCreateWarehouse} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del almacén</label>
            <input
              value={warehouseForm.name}
              onChange={e => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
              className="input-field"
              placeholder="Ej: Almacen Barra"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              value={warehouseForm.description}
              onChange={e => setWarehouseForm({ ...warehouseForm, description: e.target.value })}
              className="input-field"
              rows="2"
              placeholder="Descripción opcional"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowWarehouseModal(false)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">Crear almacén</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
