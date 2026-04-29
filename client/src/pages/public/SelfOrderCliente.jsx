import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, formatCurrency } from '../../utils/api';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useStaffOrderCart } from '../../hooks/useStaffOrderCart';
import StaffDineInOrderUI from '../../components/StaffDineInOrderUI';
import StaffModifierPromptModal from '../../components/StaffModifierPromptModal';
import CartasHorizontalCarousel from '../../components/CartasHorizontalCarousel';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';
import { MdClose, MdLock, MdReceipt, MdRestaurantMenu } from 'react-icons/md';

function storageKeyForCliente(id) {
  return `selfOrderCliente:${id}`;
}

export default function SelfOrderCliente() {
  const [searchParams] = useSearchParams();
  const clienteId = String(searchParams.get('cliente') || '').trim();

  const [sessionToken, setSessionToken] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [bootstrap, setBootstrap] = useState(null);
  const [bootError, setBootError] = useState('');
  const [orders, setOrders] = useState([]);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [cartas, setCartas] = useState([]);
  const [showCartaModal, setShowCartaModal] = useState(false);
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

  useEffect(() => {
    if (!clienteId) return;
    try {
      const saved = sessionStorage.getItem(storageKeyForCliente(clienteId));
      if (saved) setSessionToken(saved);
    } catch {
      /* private mode */
    }
  }, [clienteId]);

  const loadBootstrap = useCallback(() => {
    if (!clienteId || !sessionToken) return;
    api
      .get(
        `/public/self-order/bootstrap?cliente=${encodeURIComponent(clienteId)}&token=${encodeURIComponent(sessionToken)}`
      )
      .then((data) => {
        setBootstrap(data);
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setModifiers(Array.isArray(data.modifiers) ? data.modifiers : []);
        setCartas(Array.isArray(data.cartas) ? data.cartas : []);
        setBootError('');
      })
      .catch((err) => {
        setBootError(err.message || 'No se pudo cargar');
        setBootstrap(null);
        if (String(err.message || '').includes('Sesión') || String(err.message || '').includes('401')) {
          try {
            sessionStorage.removeItem(storageKeyForCliente(clienteId));
          } catch {
            /* */
          }
          setSessionToken('');
        }
      });
  }, [clienteId, sessionToken]);

  const loadOrders = useCallback(() => {
    if (!clienteId || !sessionToken || bootError) return;
    api
      .get(
        `/public/self-order/client-orders?cliente=${encodeURIComponent(clienteId)}&token=${encodeURIComponent(sessionToken)}`
      )
      .then(setOrders)
      .catch(() => {});
  }, [clienteId, sessionToken, bootError]);

  useEffect(() => {
    if (!clienteId || !sessionToken) return;
    loadBootstrap();
  }, [clienteId, sessionToken, loadBootstrap]);

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
    setShowOrderPanel(true);
  };

  const closeOrderPanel = () => {
    setShowOrderPanel(false);
  };

  const submitOrder = async () => {
    if (!table || !sessionToken) return toast.error('Sesión no válida');
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
        cliente: clienteId,
        token: sessionToken,
        items: cart.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          modifier_id: i.modifier_id || '',
          modifier_option: i.modifier_option || '',
          notes: String(i.notes || '').trim(),
        })),
        payment_method: 'efectivo',
        customer_name: table.name,
      });
      toast.success('Pedido enviado. Aparecerá en cocina / bar y quedará en tu cuenta para cobrar.', { id: tid });
      closeOrderPanel();
      loadOrders();
    } catch (err) {
      toast.error(err.message || 'No se pudo enviar el pedido', { id: tid });
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!clienteId) return;
    setVerifying(true);
    try {
      const data = await api.post('/public/self-order/client-verify', {
        customer_id: clienteId,
        password: passwordInput,
      });
      const tok = String(data?.token || '').trim();
      if (!tok) throw new Error('Respuesta inválida');
      try {
        sessionStorage.setItem(storageKeyForCliente(clienteId), tok);
      } catch {
        /* */
      }
      setSessionToken(tok);
      setPasswordInput('');
      toast.success('Identificación correcta');
    } catch (err) {
      toast.error(err.message || 'No se pudo verificar');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogoutCliente = () => {
    try {
      sessionStorage.removeItem(storageKeyForCliente(clienteId));
    } catch {
      /* */
    }
    setSessionToken('');
    setBootstrap(null);
    setBootError('');
    setOrders([]);
    closeOrderPanel();
  };

  if (!clienteId) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-[#0f172a] p-6 text-center">
        <div className="max-w-md rounded-2xl border border-[#3B82F6]/30 bg-[#1e293b] p-8 text-white shadow-xl">
          <MdRestaurantMenu className="mx-auto mb-4 text-5xl text-[#93C5FD]" />
          <h1 className="mb-2 text-xl font-bold">Auto pedido (cliente)</h1>
          <p className="text-sm text-[#94a3b8]">
            Falta el identificador en el enlace. Usa el QR o el enlace que te dio el restaurante desde Clientes.
          </p>
        </div>
      </div>
    );
  }

  if (!sessionToken) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] flex-col bg-[#0f172a] p-6 text-white">
        <div className="mx-auto mt-[10vh] w-full max-w-sm rounded-2xl border border-[#3B82F6]/35 bg-[#1e293b] p-6 shadow-xl">
          <MdLock className="mx-auto mb-3 text-4xl text-[#93C5FD]" />
          <h1 className="mb-1 text-center text-lg font-bold">Identificación</h1>
          <p className="mb-4 text-center text-xs text-[#94a3b8]">
            Introduce la contraseña de cliente que te asignó el restaurante (en Clientes / al registrarte).
          </p>
          <form onSubmit={handleVerify} className="space-y-3">
            <input
              type="password"
              autoComplete="current-password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Contraseña"
              className="w-full rounded-lg border border-[#3B82F6]/30 bg-[#0f172a]/80 px-3 py-2.5 text-white outline-none placeholder:text-[#64748b] focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]"
              required
            />
            <button
              type="submit"
              disabled={verifying}
              className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] py-2.5 text-sm font-semibold shadow-lg disabled:opacity-50"
            >
              {verifying ? 'Comprobando…' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (bootError || !bootstrap) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-[#0f172a] p-6 text-center">
        <div className="max-w-md rounded-2xl border border-red-500/40 bg-[#1e293b] p-8 text-white">
          <h1 className="mb-2 text-lg font-bold">No disponible</h1>
          <p className="text-sm text-red-200/90">{bootError || 'Cargando…'}</p>
          {bootError ? (
            <button
              type="button"
              onClick={handleLogoutCliente}
              className="mt-4 text-sm text-[#93C5FD] underline"
            >
              Volver a identificarme
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-[#0f172a] text-white">
      <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-[#3B82F6]/25 bg-[#1e293b]/95 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-white">Auto pedido (QR)</h1>
          <p className="text-xs text-[#93C5FD] truncate">{table?.name || 'Cliente'}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleLogoutCliente}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-[#BFDBFE] hover:bg-[#1E3A8A]/50"
          >
            Salir
          </button>
          <button
            type="button"
            onClick={() => setShowCartaModal(true)}
            className="rounded-xl border border-[#93C5FD]/40 bg-[#1E3A8A]/35 px-3 py-2.5 text-sm font-semibold text-[#E0E7FF] hover:bg-[#1E3A8A]/55"
          >
            Ver carta
          </button>
          <button
            type="button"
            onClick={openOrderPanel}
            className="shrink-0 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#1D4ED8]/30"
          >
            Hacer pedido ({cart.length})
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#111827]/50">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
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
            productActionLabel="Agregar pedido"
            singleColumnProductList
            showProductThumbnail
            hideProductStock
          />
        </div>
      </main>

      <Modal
        isOpen={showCartaModal}
        onClose={() => setShowCartaModal(false)}
        title="Carta"
        size="full"
        maxHeightClass="max-h-[min(92dvh,calc(100dvh-1rem))]"
        bodyClassName="flex flex-col min-h-0 overflow-hidden !p-3 sm:!p-4"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ minHeight: 'min(70dvh, 520px)' }}>
          <CartasHorizontalCarousel cartas={cartas} showSwipeHint={false} className="min-h-0 flex-1" />
        </div>
      </Modal>

      {showOrderPanel && table && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={closeOrderPanel} />
          <aside className="fixed right-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col border-l border-[#3B82F6]/40 bg-[#1F2937] text-white shadow-2xl md:w-[520px]">
            <div className="flex items-center justify-between border-b border-[#3B82F6]/30 bg-[#1D4ED8]/30 px-5 py-4 backdrop-blur-xl">
              <div>
                <h3 className="text-lg font-bold text-white">Tu pedido</h3>
              </div>
              <button
                type="button"
                onClick={closeOrderPanel}
                className="rounded-lg p-2 text-[#BFDBFE] hover:bg-[#1E3A8A]/50"
                aria-label="Cerrar"
              >
                <MdClose className="text-xl" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
              <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
                {cart.length === 0 ? (
                  <p className="text-sm text-[#BFDBFE]">No hay productos en tu lista.</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.line_key} className="rounded-lg border border-[#3B82F6]/20 bg-[#1D4ED8]/20 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="text-sm font-semibold text-[#DBEAFE]">{formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</p>
                      </div>
                      <p className="text-xs text-[#BFDBFE]">Cant: {item.quantity}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 border-t border-[#3B82F6]/30 pt-3 space-y-2">
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
                  <MdReceipt /> Enviar
                </button>
              </div>
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
