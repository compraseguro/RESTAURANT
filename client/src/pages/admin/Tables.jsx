import { useState, useEffect, useMemo } from 'react';
import { api, formatCurrency } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';
import {
  MdTableRestaurant, MdAdd, MdRemove, MdDelete, MdReceipt,
  MdSearch, MdClose, MdRestaurantMenu, MdShoppingCart
} from 'react-icons/md';

export default function Tables() {
  const { user } = useAuth();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [selectedSalon, setSelectedSalon] = useState('all');
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [sourceTableId, setSourceTableId] = useState('');
  const [targetTableId, setTargetTableId] = useState('');

  const loadTables = () => {
    api.get('/tables').then(data => {
      setTables(data);
      if (selectedTable) setSelectedTable(data.find(t => t.id === selectedTable.id) || null);
    }).catch(console.error).finally(() => setLoading(false));
  };

  const loadProducts = () => {
    Promise.all([
      api.get('/products?active_only=true'),
      api.get('/categories/active'),
    ]).then(([prods, cats, cfg]) => {
      setProducts(prods);
      setCategories(cats);
    }).catch(console.error);
  };

  useEffect(() => {
    loadTables();
    loadProducts();
    const timer = setInterval(loadTables, 10000);
    return () => clearInterval(timer);
  }, []);
  useSocket('order-update', loadTables);
  useSocket('table-update', loadTables);

  const openMenuForTable = (table) => {
    setSelectedTable(table);
    setShowMenu(true);
    setCart([]);
    setSearch('');
    setSelectedCat('all');
  };

  const closeMenuPanel = () => {
    setShowMenu(false);
    setCart([]);
    setSearch('');
    setSelectedCat('all');
  };

  const openAction = (type) => {
    if (!type) return;
    const initialSourceId = selectedTable?.id || '';
    setActionType(type);
    setSourceTableId(initialSourceId);
    setTargetTableId('');
    setShowActionModal(true);
  };

  const executeAction = async () => {
    try {
      if (!actionType) return toast.error('Selecciona una acción');
      const sourceForAction = tables.find((t) => t.id === sourceTableId) || null;
      if (actionType === 'move') {
        if (!sourceTableId) return toast.error('Selecciona mesa origen');
        if (!sourceForAction?.id) return toast.error('La mesa origen ya no está disponible, vuelve a seleccionarla');
        if (!targetTableId) return toast.error('Selecciona mesa destino');
        if (sourceForAction?.id === targetTableId) return toast.error('Origen y destino deben ser diferentes');
        await api.post('/tables/move-orders', {
          source_table_id: sourceForAction.id,
          target_table_id: targetTableId,
        });
        toast.success('Pedidos movidos correctamente');
      }
      if (actionType === 'merge') {
        if (!sourceTableId) return toast.error('Selecciona mesa origen');
        if (!targetTableId) return toast.error('Selecciona mesa destino');
        if (sourceTableId === targetTableId) return toast.error('Origen y destino deben ser diferentes');
        await api.post('/tables/merge', {
          target_table_id: targetTableId,
          source_table_ids: [sourceTableId],
        });
        toast.success('Mesas unidas correctamente');
      }
      setShowActionModal(false);
      loadTables();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const newQty = i.quantity + delta;
      return newQty > 0 ? { ...i, quantity: newQty } : i;
    }).filter(i => i.quantity > 0));
  };

  const removeFromCart = (productId) => setCart(prev => prev.filter(i => i.product_id !== productId));

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const submitOrder = async () => {
    if (!selectedTable) return toast.error('Selecciona una mesa');
    if (cart.length === 0) return toast.error('Agrega productos al pedido');
    try {
      await api.post('/orders', {
        items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        type: 'dine_in',
        table_number: String(selectedTable.number),
        customer_name: `Mesa ${selectedTable.number}`,
        payment_method: 'efectivo',
      });
      toast.success(`Pedido enviado a Mesa ${selectedTable.number}`);
      closeMenuPanel();
      loadTables();
    } catch (err) { toast.error(err.message); }
  };

  const salonOptions = useMemo(() => {
    const zones = [...new Set((tables || []).map(t => String(t.zone || 'principal').trim()).filter(Boolean))];
    return ['all', ...zones];
  }, [tables]);

  const salonLabel = (id) => {
    if (id === 'all') return 'Todos';
    return id.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  };

  const tablesToShow = selectedSalon === 'all'
    ? tables
    : tables.filter(t => String(t.zone || 'principal') === selectedSalon);
  const actionOptions = [
    { id: 'move', label: 'Mover pedidos' },
    { id: 'merge', label: 'Unir mesas' },
  ];

  const filteredProducts = products.filter(p => {
    if (selectedCat !== 'all' && p.category_id !== selectedCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const activeOrdersForTable = selectedTable?.orders || [];
  const getOrderStatusUi = (status) => {
    const value = String(status || '').toLowerCase();
    if (value === 'pending') return { label: 'Pendiente', classes: 'bg-[#3B82F6]/20 text-[#F9FAFB] border border-[#3B82F6]/40' };
    if (value === 'preparing') return { label: 'Preparando', classes: 'bg-[#2563EB]/20 text-[#F9FAFB] border border-[#2563EB]/40' };
    if (value === 'ready') return { label: 'Listo', classes: 'bg-emerald-500/20 text-emerald-100 border border-emerald-300/40' };
    if (value === 'delivered') return { label: 'Entregado', classes: 'bg-[#1F2937] text-[#F9FAFB] border border-[#3B82F6]/30' };
    if (value === 'cancelled') return { label: 'Cancelado', classes: 'bg-[#1E40AF]/25 text-[#F9FAFB] border border-[#3B82F6]/40' };
    return { label: value || 'Sin estado', classes: 'bg-[#1F2937] text-[#F9FAFB] border border-[#3B82F6]/30' };
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Mesas</h1>
        <p className="text-sm text-slate-500 mt-1">Gestión de salón y consumo por mesa</p>
      </div>

      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {salonOptions.map(salonId => (
            <button
              key={salonId}
              onClick={() => setSelectedSalon(salonId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                selectedSalon === salonId
                  ? 'bg-[#3B82F6] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {salonLabel(salonId)}
            </button>
          ))}
        </div>

        {actionOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 md:justify-end">
            {actionOptions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => openAction(action.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {tablesToShow.map(table => {
            const isOccupied = table.status === 'occupied' || (table.orders && table.orders.length > 0);
            const cardStyle = isOccupied
              ? { borderColor: '#f87171', backgroundColor: '#fee2e2' }
              : { borderColor: '#34d399', backgroundColor: '#dcfce7' };
            const badgeStyle = isOccupied
              ? { backgroundColor: '#dc2626', color: '#ffffff' }
              : { backgroundColor: '#059669', color: '#ffffff' };
            const stateTextStyle = isOccupied ? { color: '#dc2626' } : { color: '#059669' };
            return (
              <button
                key={table.id}
                onClick={() => openMenuForTable(table)}
                className="rounded-xl p-3 border text-left transition-all hover:brightness-95"
                style={cardStyle}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-800">{table.name}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={badgeStyle}>
                    {isOccupied ? 'Ocupada' : 'Libre'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{table.capacity} pers.</p>
                <p className="text-xs mt-1 font-medium" style={stateTextStyle}>
                  {isOccupied ? `${table.orders?.length || 0} pedido(s)` : 'Disponible'}
                </p>
                {isOccupied && <p className="text-sm font-bold text-slate-700 mt-1">{formatCurrency(table.order_total || 0)}</p>}
              </button>
            );
          })}
          {tablesToShow.length === 0 && (
            <div className="col-span-full text-center py-16 text-slate-400">
              <MdTableRestaurant className="text-5xl mx-auto mb-3 opacity-40" />
              <p>No hay mesas en este salón</p>
            </div>
          )}
        </div>
      </div>

      {showMenu && selectedTable && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeMenuPanel} />
          <aside className="fixed top-0 right-0 h-screen w-full md:w-1/2 bg-[#1F2937] z-50 shadow-2xl border-l border-[#3B82F6]/40 flex flex-col text-white">
            <div className="px-5 py-4 border-b border-[#3B82F6]/30 bg-[#1D4ED8]/30 backdrop-blur-xl flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Agregar Pedido — {selectedTable.name}</h3>
                <p className="text-xs text-[#BFDBFE]">Mesa {selectedTable.number}</p>
              </div>
              <button
                type="button"
                onClick={closeMenuPanel}
                className="p-2 rounded-lg hover:bg-[#1E3A8A]/50 text-[#BFDBFE]"
                aria-label="Cerrar ventana"
              >
                <MdClose className="text-xl" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-hidden">
              <div className="flex flex-col lg:flex-row gap-4 h-full">
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="mb-3">
                    <div className="relative">
                      <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BFDBFE]" />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full px-3 py-2.5 pl-10 bg-[#1E3A8A]/30 border border-[#3B82F6]/30 rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none text-white placeholder:text-[#93C5FD]" />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap mb-3">
                    <button onClick={() => setSelectedCat('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCat === 'all' ? 'bg-[#BFDBFE] text-[#1E3A8A]' : 'bg-[#1E3A8A]/30 text-[#DBEAFE] hover:bg-[#1E3A8A]/50 border border-[#3B82F6]/20'}`}>Todos</button>
                    {categories.map(c => (
                      <button key={c.id} onClick={() => setSelectedCat(c.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCat === c.id ? 'bg-[#BFDBFE] text-[#1E3A8A]' : 'bg-[#1E3A8A]/30 text-[#DBEAFE] hover:bg-[#1E3A8A]/50 border border-[#3B82F6]/20'}`}>{c.name}</button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <div className="text-center py-12 text-[#BFDBFE]">
                        <MdRestaurantMenu className="text-5xl mx-auto mb-3 opacity-40" />
                        <p>No hay productos para este filtro</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                        {filteredProducts.map((p) => (
                          <button key={p.id} onClick={() => addToCart(p)} className="bg-[#1D4ED8]/25 rounded-xl p-3 text-left hover:shadow-md transition-shadow border border-[#3B82F6]/20 hover:border-[#93C5FD]/60">
                            <p className="font-medium text-sm truncate text-white">{p.name}</p>
                            <p className="text-[#DBEAFE] font-bold text-sm mt-1">{formatCurrency(p.price)}</p>
                            <p className="text-xs text-[#BFDBFE]">Stock: {p.stock}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-[#3B82F6]/30 pt-4 lg:pt-0 lg:pl-4 flex flex-col">
                  <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                    <MdShoppingCart /> Pedido
                    {cart.length > 0 && <span className="text-xs bg-[#BFDBFE] text-[#1E3A8A] px-2 py-0.5 rounded-full">{cart.length}</span>}
                  </h3>

                  <div className="flex-1 overflow-y-auto space-y-2">
                    {activeOrdersForTable.length > 0 && (
                      <div className="space-y-2 mb-3">
                        <p className="text-xs uppercase tracking-wide text-[#BFDBFE] font-semibold">Pedidos actuales de la mesa</p>
                        {activeOrdersForTable.map((order) => (
                          <div key={order.id} className="bg-[#1D4ED8]/20 border border-[#3B82F6]/20 rounded-lg p-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-xs font-semibold text-white">#{order.order_number || '-'}</p>
                              <p className="text-xs font-semibold text-[#DBEAFE]">{formatCurrency(order.total || 0)}</p>
                            </div>
                            <div className="space-y-1">
                              {(order.items || []).map((it) => (
                                <p key={it.id} className="text-xs text-[#DBEAFE] truncate">
                                  {it.quantity}x {it.product_name}
                                </p>
                              ))}
                            </div>
                            <div className="flex justify-end mt-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${getOrderStatusUi(order.status).classes}`}>
                                {getOrderStatusUi(order.status).label}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-[#3B82F6]/20 pt-3 mt-1" />
                    <p className="text-xs uppercase tracking-wide text-[#BFDBFE] font-semibold">Agregar al pedido</p>

                    {cart.length === 0 ? (
                      <p className="text-center text-[#BFDBFE] text-sm py-4">Selecciona productos</p>
                    ) : cart.map(item => (
                      <div key={item.product_id} className="flex items-center gap-2 bg-[#1D4ED8]/25 border border-[#3B82F6]/20 rounded-lg p-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-white">{item.name}</p>
                          <p className="text-xs text-[#BFDBFE]">{formatCurrency(item.price)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQty(item.product_id, -1)} className="w-6 h-6 bg-[#1E3A8A]/50 border border-[#93C5FD]/30 rounded flex items-center justify-center hover:bg-[#1E3A8A]/70 text-[#DBEAFE]"><MdRemove className="text-xs" /></button>
                          <span className="w-6 text-center text-sm font-bold text-white">{item.quantity}</span>
                          <button onClick={() => updateQty(item.product_id, 1)} className="w-6 h-6 bg-[#1E3A8A]/50 border border-[#93C5FD]/30 rounded flex items-center justify-center hover:bg-[#1E3A8A]/70 text-[#DBEAFE]"><MdAdd className="text-xs" /></button>
                        </div>
                        <button onClick={() => removeFromCart(item.product_id)} className="text-[#93C5FD] hover:text-white"><MdDelete className="text-sm" /></button>
                      </div>
                    ))}
                  </div>

                  {cart.length > 0 ? (
                    <div className="border-t border-[#3B82F6]/30 pt-3 mt-3 space-y-2">
                      <div className="flex justify-between font-bold text-lg text-white">
                        <span>Total</span>
                        <span className="text-[#DBEAFE]">{formatCurrency(cartTotal)}</span>
                      </div>
                      <button onClick={submitOrder} className="w-full py-3 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white rounded-lg font-semibold text-base hover:from-[#1D4ED8] hover:to-[#1E40AF] transition-all shadow-lg shadow-[#1D4ED8]/30 flex items-center justify-center gap-2">
                        <MdReceipt /> Enviar Pedido
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      <Modal
        isOpen={showActionModal}
        onClose={() => setShowActionModal(false)}
        title={actionType === 'merge' ? 'Unir mesas' : 'Mover pedidos'}
        size="md"
      >
        <div className="space-y-3">
          {actionType && (actionType === 'move' || actionType === 'merge') && (
            <div>
              <label className="block text-sm text-slate-700 mb-1">
                {actionType === 'merge' ? 'Primera mesa' : 'Mesa origen'}
              </label>
              <select
                value={sourceTableId}
                onChange={(e) => {
                  const nextSourceId = e.target.value;
                  setSourceTableId(nextSourceId);
                }}
                className="input-field"
              >
                <option value="">Seleccionar...</option>
                {tables.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {actionType && (actionType === 'merge' || actionType === 'move') && (
            <div>
              <label className="block text-sm text-slate-700 mb-1">
                {actionType === 'merge' ? 'Segunda mesa' : 'Mesa destino'}
              </label>
              <select value={targetTableId} onChange={e => setTargetTableId(e.target.value)} className="input-field">
                <option value="">Seleccionar...</option>
                {tables.filter(t => t.id !== sourceTableId).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={() => setShowActionModal(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={executeAction} disabled={!actionType} className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
              Ejecutar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
