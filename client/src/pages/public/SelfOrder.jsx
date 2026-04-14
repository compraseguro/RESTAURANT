import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, formatCurrency } from '../../utils/api';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useStaffOrderCart } from '../../hooks/useStaffOrderCart';
import StaffDineInOrderUI from '../../components/StaffDineInOrderUI';
import StaffMesaPedidoTabs from '../../components/StaffMesaPedidoTabs';
import StaffModifierPromptModal from '../../components/StaffModifierPromptModal';
import CartasHorizontalCarousel from '../../components/CartasHorizontalCarousel';
import toast from 'react-hot-toast';
import { MdClose, MdReceipt, MdRestaurantMenu } from 'react-icons/md';

export default function SelfOrder() {
  const [searchParams] = useSearchParams();
  const mesaParam = String(searchParams.get('mesa') || '').trim();

  const [bootstrap, setBootstrap] = useState(null);
  const [bootError, setBootError] = useState('');
  const [orders, setOrders] = useState([]);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [cartas, setCartas] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');

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

  const loadBootstrap = useCallback(() => {
    if (!mesaParam) return;
    api
      .get(`/public/self-order/bootstrap?mesa=${encodeURIComponent(mesaParam)}`)
      .then((data) => {
        setBootstrap(data);
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setModifiers(Array.isArray(data.modifiers) ? data.modifiers : []);
        const c = Array.isArray(data.cartas) ? data.cartas : [];
        setCartas(c);
        setBootError('');
      })
      .catch((err) => {
        setBootError(err.message || 'No se pudo cargar');
        setBootstrap(null);
      });
  }, [mesaParam]);

  const loadOrders = useCallback(() => {
    if (!mesaParam || bootError) return;
    api
      .get(`/public/self-order/orders?mesa=${encodeURIComponent(mesaParam)}`)
      .then(setOrders)
      .catch(() => {});
  }, [mesaParam, bootError]);

  useEffect(() => {
    if (!mesaParam) return;
    loadBootstrap();
  }, [mesaParam, loadBootstrap]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, bootstrap?.table?.id]);

  useActiveInterval(loadOrders, 8000);

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        if (selectedCat !== 'all' && p.category_id !== selectedCat) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [products, selectedCat, search]
  );

  const table = bootstrap?.table;

  const openOrderPanel = () => {
    resetCart();
    setSearch('');
    setSelectedCat('all');
    setShowOrderPanel(true);
  };

  const closeOrderPanel = () => {
    setShowOrderPanel(false);
    resetCart();
    setSearch('');
    setSelectedCat('all');
  };

  const submitOrder = async () => {
    if (!table) return toast.error('Mesa no disponible');
    if (cart.length === 0) return toast.error('Agrega productos al pedido');
    const missingRequiredNote = cart.find(
      (i) => Number(i.note_required || 0) === 1 && !String(i.notes || '').trim()
    );
    if (missingRequiredNote) {
      setNoteEditorLineKey(missingRequiredNote.line_key);
      return toast.error(`"${missingRequiredNote.name}" requiere nota obligatoria`);
    }
    const tid = toast.loading('Enviando pedido…');
    try {
      await api.post('/public/self-order/orders', {
        mesa: String(table.number),
        items: cart.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          modifier_id: i.modifier_id || '',
          modifier_option: i.modifier_option || '',
          notes: String(i.notes || '').trim(),
        })),
        payment_method: 'efectivo',
        customer_name: `Mesa ${table.number}`,
      });
      toast.success(`Pedido enviado — mesa ${table.number}`, { id: tid });
      closeOrderPanel();
      loadOrders();
    } catch (err) {
      toast.error(err.message || 'No se pudo enviar el pedido', { id: tid });
    }
  };

  if (!mesaParam) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-2xl border border-[#3B82F6]/30 bg-[#1e293b] p-8 text-white shadow-xl">
          <MdRestaurantMenu className="text-5xl mx-auto mb-4 text-[#93C5FD]" />
          <h1 className="text-xl font-bold mb-2">Auto pedido</h1>
          <p className="text-[#94a3b8] text-sm">
            Escanea el código QR de tu mesa para ver la carta y hacer tu pedido. Si llegaste aquí sin QR, pide al personal el enlace con el número de mesa.
          </p>
        </div>
      </div>
    );
  }

  if (bootError || !bootstrap) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-2xl border border-red-500/40 bg-[#1e293b] p-8 text-white">
          <h1 className="text-lg font-bold mb-2">No disponible</h1>
          <p className="text-red-200/90 text-sm">{bootError || 'Cargando…'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col min-h-[100dvh]">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[#3B82F6]/25 bg-[#1e293b]/95 z-20">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{table?.name || `Mesa ${table?.number}`}</h1>
          <p className="text-xs text-[#93C5FD]">Carta digital · Mesa {table?.number}</p>
        </div>
        <button
          type="button"
          onClick={openOrderPanel}
          className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white text-sm font-semibold shadow-lg shadow-[#1D4ED8]/30"
        >
          Hacer pedido
        </button>
      </header>

      <main className="flex-1 min-h-0 flex flex-col bg-[#111827]/50">
        <CartasHorizontalCarousel cartas={cartas} className="flex-1 min-h-0" />
      </main>

      {showOrderPanel && table && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeOrderPanel} />
          <aside className="fixed top-0 right-0 flex h-[100dvh] max-h-[100dvh] w-full flex-col border-l border-[#3B82F6]/40 bg-[#1F2937] text-white shadow-2xl md:w-1/2 z-50">
            <div className="px-5 py-4 border-b border-[#3B82F6]/30 bg-[#1D4ED8]/30 backdrop-blur-xl flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Tu pedido — {table.name}</h3>
                <p className="text-xs text-[#BFDBFE]">Mesa {table.number}</p>
              </div>
              <button
                type="button"
                onClick={closeOrderPanel}
                className="p-2 rounded-lg hover:bg-[#1E3A8A]/50 text-[#BFDBFE]"
                aria-label="Cerrar"
              >
                <MdClose className="text-xl" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              <StaffMesaPedidoTabs
                orders={orders}
                formatCurrency={formatCurrency}
                resetKey={table.id}
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                labels={{
                  add: 'Agregar pedido',
                  view: 'Ver pedidos',
                  listTitle: 'Pedidos de tu mesa',
                  empty: 'Aún no hay pedidos enviados en esta mesa.',
                  totalMesa: 'Total tu mesa',
                }}
              >
                <StaffDineInOrderUI
                  stackedSelfOrder
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
                  className="min-h-0 min-w-0 flex-1"
                  footer={
                    <>
                      {cart.length > 0 ? (
                        <p className="text-[11px] text-[#93C5FD]">{cart.length} artículo(s)</p>
                      ) : (
                        <p className="text-[12px] text-[#BFDBFE]">Elige productos arriba</p>
                      )}
                      <div className="flex justify-between text-lg font-bold text-white">
                        <span>Total</span>
                        <span className="text-[#DBEAFE]">{formatCurrency(cartTotal)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={submitOrder}
                        disabled={cart.length === 0}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] py-3 text-base font-semibold text-white shadow-lg shadow-[#1D4ED8]/30 transition-all hover:from-[#1D4ED8] hover:to-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <MdReceipt /> Enviar pedido
                      </button>
                    </>
                  }
                />
              </StaffMesaPedidoTabs>
            </div>
          </aside>
        </>
      )}

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
