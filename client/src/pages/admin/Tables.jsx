import { useState, useEffect, useMemo } from 'react';
import { api, formatCurrency } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useAuth } from '../../context/AuthContext';
import { useStaffOrderCart } from '../../hooks/useStaffOrderCart';
import Modal from '../../components/Modal';
import StaffDineInOrderUI from '../../components/StaffDineInOrderUI';
import StaffModifierPromptModal from '../../components/StaffModifierPromptModal';
import toast from 'react-hot-toast';
import { MdTableRestaurant, MdReceipt, MdClose } from 'react-icons/md';

export default function Tables() {
  const { user } = useAuth();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [selectedSalon, setSelectedSalon] = useState('all');
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [sourceTableId, setSourceTableId] = useState('');
  const [targetTableId, setTargetTableId] = useState('');
  /** add = tomar pedido (por defecto); view = solo pedidos ya enviados a la mesa */
  const [mesaPanel, setMesaPanel] = useState('add');
  /** En vista pedidos: agrupar líneas con el mismo nombre de producto */
  const [mesaUnirPorNombre, setMesaUnirPorNombre] = useState(false);

  const {
    cart,
    noteEditorLineKey,
    setNoteEditorLineKey,
    modifierPrompt,
    setModifierPrompt,
    addToCart,
    confirmModifierForCart,
    addProductWithoutOptionalModifier,
    updateQty,
    removeFromCart,
    updateItemNote,
    cartTotal,
    resetCart,
  } = useStaffOrderCart(modifiers);

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
      api.get('/admin-modules/modifiers').catch(() => []),
    ]).then(([prods, cats, mods]) => {
      setProducts(prods);
      setCategories(cats);
      setModifiers(Array.isArray(mods) ? mods : []);
    }).catch(console.error);
  };

  useEffect(() => {
    loadTables();
    loadProducts();
  }, []);
  useActiveInterval(loadTables, 10000);
  useSocket('order-update', loadTables);
  useSocket('table-update', loadTables);

  const openMenuForTable = (table) => {
    setSelectedTable(table);
    setShowMenu(true);
    setMesaPanel('add');
    setMesaUnirPorNombre(false);
    resetCart();
    setSearch('');
    setSelectedCat('all');
  };

  const closeMenuPanel = () => {
    setShowMenu(false);
    setMesaPanel('add');
    setMesaUnirPorNombre(false);
    resetCart();
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

  const submitOrder = async () => {
    if (!selectedTable) return toast.error('Selecciona una mesa');
    if (cart.length === 0) return toast.error('Agrega productos al pedido');
    const missingRequiredNote = cart.find(i => Number(i.note_required || 0) === 1 && !String(i.notes || '').trim());
    if (missingRequiredNote) {
      setNoteEditorLineKey(missingRequiredNote.line_key);
      return toast.error(`"${missingRequiredNote.name}" requiere nota obligatoria`);
    }
    const tid = toast.loading('Enviando pedido…');
    try {
      await api.post('/orders', {
        items: cart.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          modifier_id: i.modifier_id || '',
          modifier_option: i.modifier_option || '',
          notes: String(i.notes || '').trim(),
        })),
        type: 'dine_in',
        table_number: String(selectedTable.number),
        customer_name: `Mesa ${selectedTable.number}`,
        payment_method: 'efectivo',
      });
      toast.success(`Pedido enviado a Mesa ${selectedTable.number}`, { id: tid });
      closeMenuPanel();
      loadTables();
    } catch (err) {
      toast.error(err.message || 'No se pudo enviar el pedido', { id: tid });
    }
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

  const mesaLineRows = useMemo(() => {
    const rows = [];
    for (const order of activeOrdersForTable) {
      const st = order.status;
      const on = order.order_number;
      for (const it of order.items || []) {
        const qty = Number(it.quantity || 0);
        const unit = Number(it.unit_price ?? 0);
        const sub = Number(it.subtotal != null ? it.subtotal : unit * qty);
        rows.push({
          key: it.id,
          orderNumber: on,
          name: String(it.product_name || '—').trim() || '—',
          quantity: qty,
          subtotal: sub,
          status: st,
        });
      }
    }
    return rows;
  }, [activeOrdersForTable]);

  const mesaLineRowsMerged = useMemo(() => {
    const m = new Map();
    for (const r of mesaLineRows) {
      const k = r.name.toLowerCase();
      if (!m.has(k)) {
        m.set(k, {
          key: `agg-${k}`,
          orderNumber: null,
          name: r.name,
          quantity: 0,
          subtotal: 0,
          status: r.status,
        });
      }
      const a = m.get(k);
      a.quantity += r.quantity;
      a.subtotal += r.subtotal;
    }
    return [...m.values()];
  }, [mesaLineRows]);

  const mesaRowsToShow = mesaUnirPorNombre ? mesaLineRowsMerged : mesaLineRows;

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
                  <span className="inline-flex items-center rounded-md bg-[#1E3A8A] px-2 py-0.5">
                    <p className="font-bold text-white">{table.name}</p>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={badgeStyle}>
                    {isOccupied ? 'Ocupada' : 'Libre'}
                  </span>
                </div>
                <p className="text-xs text-[#1E3A8A]">{table.capacity} pers.</p>
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

            <div className="p-4 flex-1 overflow-hidden min-h-0 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setMesaPanel('add');
                    setMesaUnirPorNombre(false);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    mesaPanel === 'add'
                      ? 'bg-[#BFDBFE] text-[#1E3A8A] border-[#BFDBFE]'
                      : 'bg-[#1E3A8A]/40 text-[#DBEAFE] border-[#3B82F6]/30 hover:bg-[#1E3A8A]/60'
                  }`}
                >
                  Agregar pedido
                </button>
                <button
                  type="button"
                  onClick={() => setMesaPanel('view')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    mesaPanel === 'view'
                      ? 'bg-[#BFDBFE] text-[#1E3A8A] border-[#BFDBFE]'
                      : 'bg-[#1E3A8A]/40 text-[#DBEAFE] border-[#3B82F6]/30 hover:bg-[#1E3A8A]/60'
                  }`}
                >
                  Ver pedido
                </button>
              </div>

              {mesaPanel === 'view' ? (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {activeOrdersForTable.length === 0 ? (
                    <p className="text-sm text-[#BFDBFE]">No hay pedidos en esta mesa.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2 shrink-0 mb-2">
                        <p className="text-xs uppercase tracking-wide text-[#BFDBFE] font-semibold">Pedidos de la mesa</p>
                        <button
                          type="button"
                          onClick={() => setMesaUnirPorNombre((v) => !v)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#1E3A8A]/60 border border-[#3B82F6]/35 text-[#DBEAFE] hover:bg-[#1E3A8A]/80"
                        >
                          {mesaUnirPorNombre ? 'Desagrupar' : 'Unir pedidos'}
                        </button>
                      </div>
                      <div className="flex text-[10px] uppercase tracking-wide text-[#93C5FD] border-b border-[#3B82F6]/35 pb-1.5 shrink-0">
                        <span className="flex-1 min-w-0 pr-2">Producto</span>
                        <span className="w-11 text-center shrink-0">Cant.</span>
                        <span className="w-[5.5rem] text-right shrink-0">Total</span>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pr-0.5">
                        {mesaRowsToShow.map((row) => (
                          <div
                            key={row.key}
                            className="flex items-baseline gap-1 py-1.5 border-b border-[#3B82F6]/20 text-sm text-[#F1F5F9]"
                          >
                            <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                              {!mesaUnirPorNombre && row.orderNumber != null ? (
                                <span className="text-[10px] text-[#93C5FD] shrink-0 tabular-nums">#{row.orderNumber}</span>
                              ) : null}
                              <span className="truncate">{row.name}</span>
                            </span>
                            <span className="w-11 text-center tabular-nums text-[#DBEAFE] font-medium shrink-0">{row.quantity}</span>
                            <span className="w-[5.5rem] text-right tabular-nums font-semibold text-white shrink-0">
                              {formatCurrency(row.subtotal)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {!mesaUnirPorNombre ? (
                        <div className="mt-3 pt-2 border-t border-[#3B82F6]/25 shrink-0 space-y-1">
                          {activeOrdersForTable.map((order) => (
                            <div key={order.id} className="flex justify-between items-center text-xs text-[#BFDBFE]">
                              <span>Pedido #{order.order_number || '-'}</span>
                              <span className={`px-2 py-0.5 rounded-full font-semibold ${getOrderStatusUi(order.status).classes}`}>
                                {getOrderStatusUi(order.status).label}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <StaffDineInOrderUI
                  search={search}
                  onSearchChange={setSearch}
                  selectedCat={selectedCat}
                  onSelectedCatChange={setSelectedCat}
                  categories={categories}
                  filteredProducts={filteredProducts}
                  onProductPick={addToCart}
                  cart={cart}
                  noteEditorLineKey={noteEditorLineKey}
                  setNoteEditorLineKey={setNoteEditorLineKey}
                  updateQty={updateQty}
                  removeFromCart={removeFromCart}
                  updateItemNote={updateItemNote}
                  cartTotal={cartTotal}
                  formatCurrency={formatCurrency}
                  minHeightClass="min-h-0 flex-1"
                  className="flex-1 min-h-0"
                  cartLayout="lines"
                  footer={
                    cart.length > 0 ? (
                      <>
                        <div className="flex justify-between font-bold text-lg text-white">
                          <span>Total</span>
                          <span className="text-[#DBEAFE]">{formatCurrency(cartTotal)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={submitOrder}
                          className="w-full py-3 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white rounded-lg font-semibold text-base hover:from-[#1D4ED8] hover:to-[#1E40AF] transition-all shadow-lg shadow-[#1D4ED8]/30 flex items-center justify-center gap-2"
                        >
                          <MdReceipt /> Enviar Pedido
                        </button>
                      </>
                    ) : null
                  }
                />
              )}
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

      <StaffModifierPromptModal
        open={modifierPrompt.open}
        onClose={() => setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' })}
        modifierPrompt={modifierPrompt}
        setModifierPrompt={setModifierPrompt}
        onConfirm={confirmModifierForCart}
        onSkipOptional={addProductWithoutOptionalModifier}
      />
    </div>
  );
}
