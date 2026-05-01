import { useState, useEffect } from 'react';
import { api, formatCurrency, formatInsumoQty, formatInsumoWithUnit } from '../../utils/api';
import { showStockInOrderingUI } from '../../utils/productStockDisplay';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import {
  MdAdd, MdEdit, MdDelete, MdSearch, MdRestaurantMenu, MdLunchDining,
  MdTune, MdClose, MdCheck, MdToggleOn, MdToggleOff, MdDownload
} from 'react-icons/md';

const TABS = [
  { id: 'platos', label: 'Platos y bebidas', icon: MdRestaurantMenu },
  { id: 'combos', label: 'Combos', icon: MdLunchDining },
  { id: 'modificadores', label: 'Modificadores', icon: MdTune },
];
const HIDDEN_PRODUCT_CATEGORY_NAMES = new Set(['PRODUCTOS ALMACEN', 'INSUMOS']);

export default function Productos() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('platos');
  const [selectedCat, setSelectedCat] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [expandedCats, setExpandedCats] = useState({});

  const [showProductModal, setShowProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    category_id: '',
    stock: 0,
    is_active: 1,
    process_type: 'transformed',
    stock_warehouse_id: '',
    production_area: 'cocina',
    tax_type: 'inafecto',
    modifier_id: '',
    note_required: 0,
    kardex_insumo_id: '',
    kardex_insumo_num: '1',
    kardex_insumo_den: '1',
    kardex_insumo_modo: '',
    kardex_insumo_gramos: '0',
  });

  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  const [combos, setCombos] = useState([]);
  const [showComboModal, setShowComboModal] = useState(false);
  const [comboForm, setComboForm] = useState({ name: '', description: '', price: '', items: [] });

  const [modifiers, setModifiers] = useState([]);
  const [showModModal, setShowModModal] = useState(false);
  const [modForm, setModForm] = useState({ name: '', options: '', required: false });
  const [insumosKardex, setInsumosKardex] = useState([]);

  const defaultWarehouseId =
    warehouses.find(w => (w.name || '').toLowerCase() === 'almacen principal')?.id ||
    warehouses[0]?.id ||
    '';

  const load = () => {
    Promise.all([
      api.get('/products'),
      api.get('/categories'),
      api.get('/inventory/warehouses'),
      api.get('/admin-modules/combos'),
      api.get('/admin-modules/modifiers'),
      api.get('/kardex-inventory/insumos').catch(() => []),
    ])
      .then(([p, c, w, combosData, modifiersData, ins]) => {
        setProducts(p);
        setCategories(c);
        setWarehouses(w || []);
        setCombos(combosData || []);
        setModifiers(modifiersData || []);
        setInsumosKardex(Array.isArray(ins) ? ins : []);
      })
      .catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const hiddenCategoryIds = new Set(
    categories
      .filter(c => HIDDEN_PRODUCT_CATEGORY_NAMES.has((c.name || '').toUpperCase()))
      .map(c => c.id)
  );
  const visibleCategories = categories
    .filter(c => !hiddenCategoryIds.has(c.id))
    .filter(c => !categoryFilter || (c.name || '').toLowerCase().includes(categoryFilter.toLowerCase()));
  const visibleProducts = products.filter(p => !hiddenCategoryIds.has(p.category_id) && !!p.category_id);

  useEffect(() => {
    if (!selectedCat) return;
    const exists = visibleCategories.some(c => c.id === selectedCat);
    if (!exists) setSelectedCat('');
  }, [selectedCat, visibleCategories]);

  const filtered = visibleProducts.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !selectedCat || p.category_id === selectedCat;
    const matchActive = showInactive ? true : p.is_active !== 0;
    return matchSearch && matchCat && matchActive;
  });

  const openNewProduct = () => {
    setEditProduct(null);
    setProductForm({
      name: '',
      description: '',
      price: '',
      category_id: selectedCat || (visibleCategories[0]?.id || ''),
      stock: 0,
      is_active: 1,
      process_type: 'transformed',
      stock_warehouse_id: defaultWarehouseId,
      production_area: 'cocina',
      tax_type: 'inafecto',
      modifier_id: '',
      note_required: 0,
      kardex_insumo_id: '',
      kardex_insumo_num: '1',
      kardex_insumo_den: '1',
      kardex_insumo_modo: '',
      kardex_insumo_gramos: '0',
    });
    setShowProductModal(true);
  };

  const openEditProduct = (p) => {
    setEditProduct(p);
    setProductForm({
      name: p.name,
      description: p.description || '',
      price: p.price,
      category_id: p.category_id || '',
      stock: p.stock,
      is_active: p.is_active,
      process_type: p.process_type === 'non_transformed' ? 'non_transformed' : 'transformed',
      stock_warehouse_id: p.stock_warehouse_id || defaultWarehouseId,
      production_area: p.production_area === 'bar' ? 'bar' : 'cocina',
      tax_type: ['igv', 'exonerado', 'inafecto'].includes(String(p.tax_type || '').toLowerCase())
        ? String(p.tax_type).toLowerCase()
        : 'igv',
      modifier_id: p.modifier_id || '',
      note_required: Number(p.note_required || 0) === 1 ? 1 : 0,
      kardex_insumo_id: p.kardex_insumo_id || '',
      kardex_insumo_num: p.kardex_insumo_num != null && p.kardex_insumo_num !== '' ? String(p.kardex_insumo_num) : '1',
      kardex_insumo_den: p.kardex_insumo_den != null && p.kardex_insumo_den !== '' ? String(p.kardex_insumo_den) : '1',
      kardex_insumo_modo: (p.kardex_insumo_id && String(p.kardex_insumo_id).trim()
        ? (String(p.kardex_insumo_modo || 'unidad').toLowerCase() === 'peso' ? 'peso' : 'unidad')
        : ''),
      kardex_insumo_gramos: p.kardex_insumo_gramos != null && p.kardex_insumo_gramos !== ''
        ? String(p.kardex_insumo_gramos)
        : '0',
    });
    setShowProductModal(true);
  };

  useEffect(() => {
    if (!showProductModal) return;
    if (productForm.process_type !== 'non_transformed') return;
    if (productForm.stock_warehouse_id) return;
    if (!defaultWarehouseId) return;
    setProductForm(prev => ({ ...prev, stock_warehouse_id: defaultWarehouseId }));
  }, [showProductModal, productForm.process_type, productForm.stock_warehouse_id, defaultWarehouseId]);

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const isNonTransformed = productForm.process_type === 'non_transformed';
      const stockAmount = Math.max(0, Number(productForm.stock || 0));
      const warehouseId = productForm.stock_warehouse_id || '';

      if (isNonTransformed && !warehouseId) {
        toast.error('Selecciona un almacén destino');
        return;
      }
      if (!String(productForm.category_id || '').trim()) {
        toast.error('Selecciona una categoría para el producto');
        return;
      }
      if (
        !isNonTransformed
        && (productForm.kardex_insumo_modo === 'unidad' || productForm.kardex_insumo_modo === 'peso')
        && !String(productForm.kardex_insumo_id || '').trim()
      ) {
        toast.error('Selecciona un insumo o, en la primera lista, deja el valor en blanco para no vincular kardex');
        return;
      }

      const kn = parseFloat(productForm.kardex_insumo_num) || 1;
      const kd = parseFloat(productForm.kardex_insumo_den) || 1;
      const kg = parseFloat(productForm.kardex_insumo_gramos) || 0;
      const hasK = !isNonTransformed && String(productForm.kardex_insumo_id || '').trim();
      const modoPeso = hasK && productForm.kardex_insumo_modo === 'peso';
      if (modoPeso && kg <= 0) {
        toast.error('Indica gramos de insumo por plato (mayor a 0).');
        return;
      }
      const payload = {
        ...productForm,
        stock: isNonTransformed ? stockAmount : 0,
        stock_warehouse_id: isNonTransformed ? warehouseId : '',
        kardex_insumo_id: !isNonTransformed ? (productForm.kardex_insumo_id || '').trim() : '',
        kardex_insumo_num: !isNonTransformed && hasK && !modoPeso ? kn : 1,
        kardex_insumo_den: !isNonTransformed && hasK && !modoPeso ? kd : 1,
        kardex_insumo_modo: hasK ? (modoPeso ? 'peso' : 'unidad') : 'unidad',
        kardex_insumo_gramos: hasK && modoPeso ? kg : 0,
      };
      if (editProduct) {
        const updated = await api.put(`/products/${editProduct.id}`, payload);
        if (isNonTransformed) {
          await api.post('/inventory/warehouse-stock', {
            product_id: updated.id,
            warehouse_id: warehouseId,
            quantity: stockAmount,
          });
        }
        toast.success('Producto actualizado');
      } else {
        const created = await api.post('/products', payload);
        if (isNonTransformed) {
          await api.post('/inventory/warehouse-stock', {
            product_id: created.id,
            warehouse_id: warehouseId,
            quantity: stockAmount,
          });
        }
        toast.success('Producto creado');
      }
      setShowProductModal(false);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const toggleProductActive = async (p) => {
    try {
      await api.put(`/products/${p.id}`, { is_active: p.is_active ? 0 : 1 });
      toast.success(p.is_active ? 'Producto desactivado' : 'Producto activado');
      load();
    } catch (err) { toast.error(err.message); }
  };

  const deleteProduct = async (p) => {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    try { await api.delete(`/products/${p.id}`); toast.success('Eliminado'); load(); } catch (err) { toast.error(err.message); }
  };

  const openNewCat = () => { setEditCat(null); setCatForm({ name: '', description: '' }); setShowCatModal(true); };
  const openEditCat = (c) => { setEditCat(c); setCatForm({ name: c.name, description: c.description || '' }); setShowCatModal(true); };

  const handleCatSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editCat) {
        await api.put(`/categories/${editCat.id}`, catForm);
        toast.success('Categoría actualizada');
      } else {
        await api.post('/categories', catForm);
        toast.success('Categoría creada');
      }
      setShowCatModal(false);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const deleteCat = async (c) => {
    if (!confirm(`¿Eliminar categoría "${c.name}"?`)) return;
    try { await api.delete(`/categories/${c.id}`); toast.success('Eliminada'); load(); } catch (err) { toast.error(err.message); }
  };

  const getCatName = (id) => visibleCategories.find(c => c.id === id)?.name || '-';
  const getCatProductCount = (catId) => visibleProducts.filter(p => p.category_id === catId && p.is_active !== 0).length;

  const handleModSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin-modules/modifiers', {
        name: modForm.name,
        options: modForm.options.split(',').map(o => o.trim()).filter(Boolean),
        required: modForm.required,
        active: true,
      });
      setShowModModal(false);
      setModForm({ name: '', options: '', required: false });
      toast.success('Modificador creado');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[var(--ui-body-text)]">Categorías</h1>
        <div />
      </div>

      <div className="flex gap-3 mb-5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 px-6 py-3 rounded-xl border-2 transition-all ${
                activeTab === tab.id
                  ? 'bg-gold-500 border-gold-500 text-white shadow-md shadow-gold-500/20'
                  : 'bg-[var(--ui-surface)] border-[color:var(--ui-border)] text-[var(--ui-body-text)] hover:border-gold-300 hover:text-gold-600'
              }`}
            >
              <Icon className="text-2xl" />
              <span className="text-xs font-medium">{tab.label}</span>
              {tab.id !== activeTab && <MdAdd className="text-sm opacity-50" />}
            </button>
          );
        })}
      </div>

      {activeTab === 'platos' && (
        <div className="flex gap-5">
          <div className="w-56 flex-shrink-0">
            <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface)] overflow-hidden">
              <div className="p-2.5 border-b border-[color:var(--ui-border)]">
                <input
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  placeholder="Filtrar categorías"
                  className="input-field w-full text-sm py-1.5 px-3"
                />
              </div>
              <div className="p-2">
                <button
                  type="button"
                  onClick={openNewCat}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm btn-primary mb-1 justify-center"
                >
                  <MdAdd className="text-base" /> Añadir nueva categoría
                </button>
              </div>
              <nav className="max-h-[60vh] overflow-y-auto">
                {visibleCategories.map(cat => (
                  <div key={cat.id} className="m-1 border border-[color:var(--ui-border)] rounded-lg bg-[var(--ui-surface-2)] overflow-hidden">
                    <div className="flex items-center group">
                      <button
                        type="button"
                        onClick={() => setSelectedCat(cat.id)}
                        className={`flex-1 text-left px-3 py-1.5 text-sm transition-colors ${
                          selectedCat === cat.id
                            ? 'bg-[var(--ui-accent)] text-white font-semibold'
                            : 'text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]'
                        }`}
                      >
                        {cat.name}
                        <span className={`text-xs ml-1 ${selectedCat === cat.id ? 'text-white/90' : 'text-[var(--ui-muted)]'}`}>
                          ({getCatProductCount(cat.id)})
                        </span>
                      </button>
                      <div className="hidden group-hover:flex items-center pr-2 gap-0.5">
                        <button type="button" onClick={() => openEditCat(cat)} className="p-1 hover:bg-[var(--ui-sidebar-hover)] rounded text-[var(--ui-accent)] text-xs" title="Editar">
                          <MdEdit />
                        </button>
                        <button type="button" onClick={() => deleteCat(cat)} className="p-1 hover:bg-[var(--ui-sidebar-hover)] rounded text-[var(--ui-accent)] hover:text-red-500 text-xs" title="Eliminar">
                          <MdDelete />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </nav>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <button type="button" onClick={openNewProduct} className="w-full py-3.5 btn-primary font-semibold rounded-xl mb-4 flex items-center justify-center gap-2 transition-colors shadow-sm">
              <MdAdd className="text-xl" /> Nuevo producto
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-muted)]" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar producto" className="input-field pl-9 py-2" />
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--ui-body-text)] cursor-pointer whitespace-nowrap">
                Ver Anulados
                <button type="button" onClick={() => setShowInactive(!showInactive)} className="text-2xl">
                  {showInactive ? <MdToggleOn className="text-gold-500" /> : <MdToggleOff className="text-[var(--ui-muted)]" />}
                </button>
              </label>
            </div>

            <p className="text-sm text-[var(--ui-muted)] mb-3 font-medium">
              Mostrando {selectedCat ? getCatName(selectedCat) : 'sin categoría seleccionada'} · {filtered.length} productos
            </p>

            <div className="bg-[var(--ui-surface)] rounded-xl border border-[color:var(--ui-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]">
                    <th className="text-left p-3 font-semibold text-[var(--ui-body-text)]">Producto</th>
                    <th className="text-left p-3 font-semibold text-[var(--ui-body-text)] w-20">Cód.</th>
                    <th className="text-left p-3 font-semibold text-[var(--ui-body-text)] w-28">Categoría</th>
                    <th className="text-right p-3 font-semibold text-[var(--ui-body-text)] w-24">Precio</th>
                    <th className="text-center p-3 font-semibold text-[var(--ui-body-text)] w-24">Stock</th>
                    <th className="text-center p-3 font-semibold text-[var(--ui-body-text)] w-24">¿Activo?</th>
                    <th className="text-center p-3 font-semibold text-[var(--ui-body-text)] w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => (
                    <tr key={p.id} className={`border-b border-[color:var(--ui-border)] hover:bg-[var(--ui-sidebar-hover)] transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                      <td className="p-3">
                        <p className="font-medium text-[var(--ui-body-text)] hover:text-gold-600 cursor-pointer" onClick={() => openEditProduct(p)}>{p.name}</p>
                        {p.description && <p className="text-xs text-[var(--ui-muted)] mt-0.5 line-clamp-1">{p.description}</p>}
                      </td>
                      <td className="p-3 text-[var(--ui-muted)]">#{String(idx + 1).padStart(2, '0')}</td>
                      <td className="p-3"><span className="text-xs px-2 py-0.5 bg-[var(--ui-surface-2)] rounded-full text-[var(--ui-body-text)] border border-[color:var(--ui-border)]">{getCatName(p.category_id)}</span></td>
                      <td className="p-3 text-right font-bold text-[var(--ui-body-text)]">{formatCurrency(p.price)}</td>
                      <td className="p-3 text-center">
                        {showStockInOrderingUI(p) ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.stock > 10 ? 'bg-emerald-100 text-emerald-700' : p.stock > 0 ? 'bg-gold-100 text-gold-700' : 'bg-red-100 text-red-700'}`}>{p.stock}</span>
                        ) : null}
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => toggleProductActive(p)}>
                          {p.is_active ? (
                            <span className="text-emerald-600 flex items-center justify-center gap-1 text-xs font-medium"><MdCheck /> Sí</span>
                          ) : (
                            <span className="text-red-500 flex items-center justify-center gap-1 text-xs font-medium"><MdClose /> No</span>
                          )}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditProduct(p)}
                            className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1"
                          >
                            <MdEdit className="text-sm" /> Editar
                          </button>
                          <button
                            onClick={() => deleteProduct(p)}
                            className="px-2.5 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1"
                          >
                            <MdDelete className="text-sm" /> Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan="7" className="p-8 text-center text-slate-400">
                      <MdRestaurantMenu className="text-4xl mx-auto mb-2 opacity-30" />
                      <p>No se encontraron productos</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'combos' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">{combos.length} combos registrados</p>
            <button onClick={() => { setComboForm({ name: '', description: '', price: '', items: [] }); setShowComboModal(true); }} className="btn-primary flex items-center gap-2 text-sm"><MdAdd /> Nuevo Combo</button>
          </div>
          {combos.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <MdLunchDining className="text-5xl mx-auto mb-3 opacity-30" />
              <p className="font-medium">No hay combos creados</p>
              <p className="text-sm mt-1">Crea combos para ofrecer paquetes de productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {combos.map(c => (
                <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-800">{c.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{c.description}</p>
                  <p className="text-xl font-bold text-gold-600 mt-2">{formatCurrency(c.price)}</p>
                  <p className="text-xs text-slate-400 mt-2">Incluye: {(Array.isArray(c.items) ? c.items.map(i => i.product_name || i.name).filter(Boolean).join(', ') : '') || '-'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'modificadores' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">{modifiers.length} modificadores</p>
            <button onClick={() => { setModForm({ name: '', options: '', required: false }); setShowModModal(true); }} className="btn-primary flex items-center gap-2 text-sm"><MdAdd /> Nuevo Modificador</button>
          </div>
          <div className="space-y-3">
            {modifiers.map(m => (
              <div key={m.id} className={`bg-white rounded-xl border border-slate-200 p-5 ${!m.active ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-slate-800">{m.name}</h3>
                    {m.required && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Obligatorio</span>}
                    <span className={`px-2 py-0.5 text-xs rounded-full ${m.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{m.active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      try {
                        await api.put(`/admin-modules/modifiers/${m.id}`, { active: m.active ? 0 : 1 });
                        load();
                      } catch (err) {
                        toast.error(err.message);
                      }
                    }} className="text-xs px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600">{m.active ? 'Desactivar' : 'Activar'}</button>
                    <button onClick={async () => {
                      try {
                        await api.delete(`/admin-modules/modifiers/${m.id}`);
                        load();
                      } catch (err) {
                        toast.error(err.message);
                      }
                    }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"><MdDelete /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.options.map((opt, i) => (
                    <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 text-sm rounded-lg">{opt}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showProductModal} onClose={() => setShowProductModal(false)} title={editProduct ? 'Editar Producto' : 'Nuevo Producto'} size="lg">
        <form onSubmit={handleProductSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Producto</label><input value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} className="input-field" required placeholder="Ej: Lomo Saltado" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setProductForm({
                ...productForm,
                process_type: 'transformed',
                stock: 0,
                stock_warehouse_id: '',
                kardex_insumo_id: productForm.kardex_insumo_id || '',
                kardex_insumo_num: productForm.kardex_insumo_num || '1',
                kardex_insumo_den: productForm.kardex_insumo_den || '1',
                kardex_insumo_modo: (productForm.kardex_insumo_id && productForm.kardex_insumo_modo) ? productForm.kardex_insumo_modo : '',
                kardex_insumo_gramos: productForm.kardex_insumo_gramos || '0',
              })}
              className={`py-2 rounded-lg border text-sm font-medium ${
                productForm.process_type === 'transformed'
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              Transformado
            </button>
            <button
              type="button"
              onClick={() => setProductForm({
                ...productForm,
                process_type: 'non_transformed',
                stock_warehouse_id: productForm.stock_warehouse_id || defaultWarehouseId,
                kardex_insumo_id: '',
                kardex_insumo_num: '1',
                kardex_insumo_den: '1',
                kardex_insumo_modo: '',
                kardex_insumo_gramos: '0',
              })}
              className={`py-2 rounded-lg border text-sm font-medium ${
                productForm.process_type === 'non_transformed'
                  ? 'bg-sky-600 border-sky-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              No transformado
            </button>
          </div>
          {productForm.process_type === 'non_transformed' && (
            <p className="text-xs text-slate-500 -mt-2">
              Producto no transformado: se gestiona como inventario vendible en Movimiento interno según su categoría.
            </p>
          )}
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea value={productForm.description} onChange={e => setProductForm({ ...productForm, description: e.target.value })} className="input-field" rows="2" placeholder="Descripción del producto..." /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Precio (S/)</label><input type="number" step="0.01" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} className="input-field" required placeholder="0.00" /></div>
            <div>
              {productForm.process_type === 'non_transformed' ? (
                <>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock inicial</label>
                  <input
                    type="number"
                    value={productForm.stock}
                    onChange={e => setProductForm({ ...productForm, stock: e.target.value })}
                    className="input-field"
                    placeholder="0"
                    min="0"
                  />
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Insumo a descontar</label>
                  <select
                    className="input-field text-sm"
                    value={
                      productForm.kardex_insumo_modo === 'unidad' || productForm.kardex_insumo_modo === 'peso'
                        ? productForm.kardex_insumo_modo
                        : ''
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        setProductForm({
                          ...productForm,
                          kardex_insumo_modo: '',
                          kardex_insumo_id: '',
                          kardex_insumo_num: '1',
                          kardex_insumo_den: '1',
                          kardex_insumo_gramos: '0',
                        });
                        return;
                      }
                      setProductForm({
                        ...productForm,
                        kardex_insumo_modo: v,
                        kardex_insumo_id: '',
                        kardex_insumo_num: v === 'unidad' ? '1' : '1',
                        kardex_insumo_den: v === 'unidad' ? '1' : '1',
                        kardex_insumo_gramos: v === 'peso' ? (productForm.kardex_insumo_gramos && productForm.kardex_insumo_gramos !== '0' ? productForm.kardex_insumo_gramos : '') : '0',
                      });
                    }}
                  >
                    <option value="">&nbsp;</option>
                    <option value="unidad">Fracción por unidad</option>
                    <option value="peso">Peso fijo</option>
                  </select>
                  {(productForm.kardex_insumo_modo === 'unidad' || productForm.kardex_insumo_modo === 'peso') && (
                    <>
                      <label className="block text-xs text-slate-500 mt-2 mb-0.5">Insumo</label>
                      <select
                        value={productForm.kardex_insumo_id}
                        onChange={e => setProductForm({ ...productForm, kardex_insumo_id: e.target.value })}
                        className="input-field text-sm"
                      >
                        <option value="">— Elija insumo —</option>
                        {insumosKardex.filter((i) => Number(i.activo) !== 0).map((i) => {
                          const um = String(i.unidad_medida || 'kg')
                            .replace(/[0-9]/g, '')
                            .trim() || 'kg';
                          if (productForm.kardex_insumo_modo === 'peso') {
                            return (
                              <option key={i.id} value={i.id}>
                                {i.nombre} (U.M. {um})
                              </option>
                            );
                          }
                          const uS = i.stock_unidades != null ? Number(i.stock_unidades) : 0;
                          return (
                            <option key={i.id} value={i.id}>
                              {i.nombre} — {formatInsumoQty(uS)} U, {formatInsumoWithUnit(i.stock_actual, um)}
                            </option>
                          );
                        })}
                      </select>
                    </>
                  )}
                  {productForm.kardex_insumo_id && productForm.kardex_insumo_modo === 'unidad' ? (
                    <div className="mt-2">
                      <label className="block text-xs text-slate-500 mb-0.5">Fracción (a / b) por plato</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={productForm.kardex_insumo_num}
                          onChange={e => setProductForm({ ...productForm, kardex_insumo_num: e.target.value })}
                          className="input-field w-16 text-sm py-1.5"
                        />
                        <span className="text-slate-500 font-medium">/</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={productForm.kardex_insumo_den}
                          onChange={e => setProductForm({ ...productForm, kardex_insumo_den: e.target.value })}
                          className="input-field w-16 text-sm py-1.5"
                        />
                      </div>
                    </div>
                  ) : null}
                  {productForm.kardex_insumo_id && productForm.kardex_insumo_modo === 'peso' ? (
                    <div className="mt-2">
                      <label className="block text-xs text-slate-500 mb-0.5">Gramos por plato</label>
                      <input
                        type="number"
                        min="0.1"
                        step="1"
                        value={productForm.kardex_insumo_gramos}
                        onChange={e => setProductForm({ ...productForm, kardex_insumo_gramos: e.target.value })}
                        className="input-field text-sm py-1.5 w-full"
                        placeholder="ej. 250"
                        title="Gramos de insumo (descuento en kg al cobrar)"
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Categoría *</label>
              <select
                required
                value={productForm.category_id}
                onChange={e => setProductForm({ ...productForm, category_id: e.target.value })}
                className="input-field"
              >
                <option value="" disabled>
                  {visibleCategories.length ? '— Elija categoría —' : 'Cree una categoría primero'}
                </option>
                {visibleCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Área de producción</label>
              <select
                value={productForm.production_area}
                onChange={e => setProductForm({ ...productForm, production_area: e.target.value })}
                className="input-field"
              >
                <option value="cocina">Cocina</option>
                <option value="bar">Bar</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Impuesto</label>
              <select
                value={productForm.tax_type}
                onChange={e => setProductForm({ ...productForm, tax_type: e.target.value })}
                className="input-field"
              >
                <option value="igv">IGV</option>
                <option value="exonerado">Exonerado</option>
                <option value="inafecto">Inafecto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Modificador</label>
              <select
                value={productForm.modifier_id}
                onChange={e => setProductForm({ ...productForm, modifier_id: e.target.value })}
                className="input-field"
              >
                <option value="">Sin modificador</option>
                {(modifiers || [])
                  .filter(m => Number(m.active ?? 1) === 1)
                  .map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          {productForm.process_type === 'non_transformed' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Almacén destino</label>
              <select
                value={productForm.stock_warehouse_id}
                onChange={e => setProductForm({ ...productForm, stock_warehouse_id: e.target.value })}
                className="input-field"
              >
                {warehouses.length === 0 && <option value="">No hay almacenes disponibles</option>}
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={productForm.is_active === 1 || productForm.is_active === true} onChange={e => setProductForm({ ...productForm, is_active: e.target.checked ? 1 : 0 })} className="rounded text-gold-500" />
              <span className="font-medium text-slate-700">Producto activo</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Number(productForm.note_required || 0) === 1}
                onChange={e => setProductForm({ ...productForm, note_required: e.target.checked ? 1 : 0 })}
                className="rounded text-gold-500"
              />
              <span className="font-medium text-slate-700">Nota obligatoria al pedir</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowProductModal(false)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">{editProduct ? 'Guardar Cambios' : 'Crear Producto'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showCatModal} onClose={() => setShowCatModal(false)} title={editCat ? 'Editar Categoría' : 'Nueva Categoría'} size="sm">
        <form onSubmit={handleCatSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label><input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} className="input-field" required placeholder="Ej: Entradas" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} className="input-field" rows="2" placeholder="Descripción..." /></div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowCatModal(false)} className="btn-secondary flex-1">Cancelar</button><button type="submit" className="btn-primary flex-1">{editCat ? 'Guardar' : 'Crear'}</button></div>
        </form>
      </Modal>

      <Modal isOpen={showComboModal} onClose={() => setShowComboModal(false)} title="Nuevo Combo" size="md">
        <form onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post('/admin-modules/combos', {
              name: comboForm.name,
              description: comboForm.description,
              price: parseFloat(comboForm.price),
              items: comboForm.items
                .map(name => products.find(p => p.name === name))
                .filter(Boolean)
                .map(p => ({ product_id: p.id, quantity: 1 })),
            });
            setShowComboModal(false);
            toast.success('Combo creado');
            load();
          } catch (err) {
            toast.error(err.message);
          }
        }} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Combo</label><input value={comboForm.name} onChange={e => setComboForm({ ...comboForm, name: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea value={comboForm.description} onChange={e => setComboForm({ ...comboForm, description: e.target.value })} className="input-field" rows="2" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Precio</label><input type="number" step="0.01" value={comboForm.price} onChange={e => setComboForm({ ...comboForm, price: e.target.value })} className="input-field" required /></div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Productos incluidos</label>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
              {products.filter(p => p.is_active).map(p => (
                <label key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-sm">
                  <input type="checkbox" checked={comboForm.items.includes(p.name)} onChange={e => {
                    if (e.target.checked) setComboForm({ ...comboForm, items: [...comboForm.items, p.name] });
                    else setComboForm({ ...comboForm, items: comboForm.items.filter(i => i !== p.name) });
                  }} className="rounded text-gold-500" />
                  {p.name} <span className="text-slate-400 ml-auto">{formatCurrency(p.price)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowComboModal(false)} className="btn-secondary flex-1">Cancelar</button><button type="submit" className="btn-primary flex-1">Crear Combo</button></div>
        </form>
      </Modal>

      <Modal isOpen={showModModal} onClose={() => setShowModModal(false)} title="Nuevo Modificador" size="sm">
        <form onSubmit={handleModSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Grupo</label><input value={modForm.name} onChange={e => setModForm({ ...modForm, name: e.target.value })} className="input-field" required placeholder="Ej: Tamaño, Cocción, Extras" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Opciones (separadas por coma)</label><textarea value={modForm.options} onChange={e => setModForm({ ...modForm, options: e.target.value })} className="input-field" rows="2" required placeholder="Pequeño, Mediano, Grande" /></div>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={modForm.required} onChange={e => setModForm({ ...modForm, required: e.target.checked })} className="rounded text-gold-500" /><span>Selección obligatoria</span></label>
          <div className="flex gap-3"><button type="button" onClick={() => setShowModModal(false)} className="btn-secondary flex-1">Cancelar</button><button type="submit" className="btn-primary flex-1">Crear</button></div>
        </form>
      </Modal>

    </div>
  );
}
