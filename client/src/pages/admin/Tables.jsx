import { useState, useEffect, useMemo } from 'react';
import { api, formatCurrency } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useAuth } from '../../context/AuthContext';
import { useStaffOrderCart } from '../../hooks/useStaffOrderCart';
import Modal from '../../components/Modal';
import StaffDineInOrderUI from '../../components/StaffDineInOrderUI';
import StaffMesaPedidoTabs from '../../components/StaffMesaPedidoTabs';
import StaffModifierPromptModal from '../../components/StaffModifierPromptModal';
import toast from 'react-hot-toast';
import { MdTableRestaurant, MdReceipt, MdClose } from 'react-icons/md';
import { KITCHEN_TAKEOUT_NOTE } from '../../utils/ticketPlainText';

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
  const [paraLlevarMesa, setParaLlevarMesa] = useState(false);

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
    setParaLlevarMesa(false);
    resetCart();
    setSearch('');
    setSelectedCat('all');
  };

  const closeMenuPanel = () => {
    setShowMenu(false);
    setParaLlevarMesa(false);
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
        notes: paraLlevarMesa ? KITCHEN_TAKEOUT_NOTE : '',
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
          <aside className="fixed top-0 right-0 h-screen w-full md:w-1/2 bg-[var(--ui-surface)] z-50 shadow-2xl border-l border-[color:var(--ui-border)] flex flex-col text-[var(--ui-body-text)]">
            <div className="px-5 py-4 border-b border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] backdrop-blur-xl flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[var(--ui-body-text)]">Agregar Pedido — {selectedTable.name}</h3>
                <p className="text-xs text-[var(--ui-accent)]">Mesa {selectedTable.number}</p>
              </div>
              <button
                type="button"
                onClick={closeMenuPanel}
                className="p-2 rounded-lg hover:bg-[var(--ui-sidebar-hover)] text-[var(--ui-accent)]"
                aria-label="Cerrar ventana"
              >
                <MdClose className="text-xl" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-hidden min-h-0 flex flex-col">
              <StaffMesaPedidoTabs
                orders={activeOrdersForTable}
                formatCurrency={formatCurrency}
                resetKey={selectedTable?.id}
                className="min-h-0 flex-1"
              >
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
                      <div className="space-y-2">
                        <div className="flex justify-between font-bold text-lg text-[var(--ui-body-text)]">
                          <span>Total</span>
                          <span className="text-[var(--ui-accent)]">{formatCurrency(cartTotal)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setParaLlevarMesa((v) => !v)}
                          className={`w-1/2 mx-auto rounded-lg border py-1 px-2 text-xs font-semibold uppercase tracking-wide transition-colors flex items-center justify-center ${
                            paraLlevarMesa
                              ? 'bg-[var(--ui-accent)] text-white border-transparent shadow-sm'
                              : 'border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)]'
                          }`}
                        >
                          PARA LLEVAR
                        </button>
                        <button
                          type="button"
                          onClick={submitOrder}
                          className="w-full py-3 btn-primary rounded-lg font-semibold text-base shadow-lg flex items-center justify-center gap-2"
                        >
                          <MdReceipt /> Enviar Pedido
                        </button>
                      </div>
                    ) : null
                  }
                />
              </StaffMesaPedidoTabs>
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
