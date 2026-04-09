import {
  MdSearch,
  MdRestaurantMenu,
  MdShoppingCart,
  MdAdd,
  MdRemove,
  MdDelete,
  MdEditNote,
} from 'react-icons/md';
import { showStockInOrderingUI } from '../utils/productStockDisplay';

/**
 * UI unificada “Tomar pedido” (Mesas / Caja / Reservas): buscador, categorías, grilla y carrito.
 * Tema navy alineado con el panel lateral de Mesas.
 */
export default function StaffDineInOrderUI({
  search,
  onSearchChange,
  selectedCat,
  onSelectedCatChange,
  categories = [],
  filteredProducts = [],
  onProductPick,
  cart = [],
  noteEditorLineKey,
  setNoteEditorLineKey,
  updateQty,
  removeFromCart,
  updateItemNote,
  cartTotal,
  formatCurrency,
  sidebarTop = null,
  sidebarPreCart = null,
  footer = null,
  minHeightClass = 'min-h-[50vh]',
  /** Altura fija + solo la grilla / carrito hacen scroll (p. ej. modal de Reservas) */
  embedded = false,
  className = '',
}) {
  const rootClass = embedded
    ? 'h-[min(50vh,460px)] max-h-[min(70vh,560px)] w-full min-h-0'
    : minHeightClass;

  return (
    <div className={`flex flex-col lg:flex-row gap-4 ${rootClass} ${className} min-h-0`}>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="mb-3 shrink-0">
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#BFDBFE]" />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full px-3 py-2.5 pl-10 bg-[#1E3A8A]/30 border border-[#3B82F6]/30 rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none text-white placeholder:text-[#93C5FD]"
            />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mb-3 shrink-0">
          <button
            type="button"
            onClick={() => onSelectedCatChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              selectedCat === 'all'
                ? 'bg-[#BFDBFE] text-[#1E3A8A]'
                : 'bg-[#1E3A8A]/30 text-[#DBEAFE] hover:bg-[#1E3A8A]/50 border border-[#3B82F6]/20'
            }`}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => onSelectedCatChange(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                selectedCat === c.id
                  ? 'bg-[#BFDBFE] text-[#1E3A8A]'
                  : 'bg-[#1E3A8A]/30 text-[#DBEAFE] hover:bg-[#1E3A8A]/50 border border-[#3B82F6]/20'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain pr-0.5 ${
            embedded ? '' : 'min-h-[200px]'
          }`}
        >
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-[#BFDBFE]">
              <MdRestaurantMenu className="text-5xl mx-auto mb-3 opacity-40" />
              <p>No hay productos para este filtro</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {filteredProducts.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => onProductPick(p)}
                  className="bg-[#1D4ED8]/25 rounded-xl p-3 text-left hover:shadow-md transition-shadow border border-[#3B82F6]/20 hover:border-[#93C5FD]/60"
                >
                  <p className="font-medium text-sm truncate text-white">{p.name}</p>
                  <p className="text-[#DBEAFE] font-bold text-sm mt-1">{formatCurrency(p.price)}</p>
                  {showStockInOrderingUI(p) ? (
                    <p className="text-xs text-[#BFDBFE]">Stock: {p.stock}</p>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-[#3B82F6]/30 pt-4 lg:pt-0 lg:pl-4 flex flex-col min-h-0 overflow-hidden lg:max-h-full">
        <h3 className="font-bold text-white mb-3 flex items-center gap-2 shrink-0">
          <MdShoppingCart /> Pedido
          {cart.length > 0 && (
            <span className="text-xs bg-[#BFDBFE] text-[#1E3A8A] px-2 py-0.5 rounded-full">{cart.length}</span>
          )}
        </h3>

        {sidebarTop ? <div className="shrink-0 mb-3 space-y-2">{sidebarTop}</div> : null}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain space-y-2 pr-0.5">
          {sidebarPreCart}
          {sidebarPreCart ? <div className="border-t border-[#3B82F6]/20 pt-3 mt-1" /> : null}
          {sidebarPreCart ? (
            <p className="text-xs uppercase tracking-wide text-[#BFDBFE] font-semibold">Agregar al pedido</p>
          ) : null}

          {cart.length === 0 ? (
            <p className="text-center text-[#BFDBFE] text-sm py-8">Selecciona productos</p>
          ) : (
            cart.map((item) => (
              <div key={item.line_key} className="bg-[#1D4ED8]/25 border border-[#3B82F6]/20 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-white">{item.name}</p>
                    {Number(item.note_required || 0) === 1 && (
                      <p className="text-[11px] text-[#FCA5A5] font-semibold">Nota obligatoria</p>
                    )}
                    {item.modifier_name && item.modifier_option && (
                      <p className="text-[11px] text-[#BFDBFE] truncate">
                        {item.modifier_name}: {item.modifier_option}
                      </p>
                    )}
                    <p className="text-xs text-[#BFDBFE]">{formatCurrency(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setNoteEditorLineKey((prev) => (prev === item.line_key ? '' : item.line_key))
                      }
                      className={`w-7 h-7 rounded flex items-center justify-center border ${
                        item.notes?.trim()
                          ? 'bg-amber-100 border-amber-300 text-amber-700'
                          : 'bg-[#1E3A8A]/50 border-[#93C5FD]/30 text-[#DBEAFE] hover:bg-[#1E3A8A]/70'
                      }`}
                      title="Agregar nota"
                    >
                      <MdEditNote className="text-sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateQty(item.line_key, -1)}
                      className="w-6 h-6 bg-[#1E3A8A]/50 border border-[#93C5FD]/30 rounded flex items-center justify-center hover:bg-[#1E3A8A]/70 text-[#DBEAFE]"
                    >
                      <MdRemove className="text-xs" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-white">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.line_key, 1)}
                      className="w-6 h-6 bg-[#1E3A8A]/50 border border-[#93C5FD]/30 rounded flex items-center justify-center hover:bg-[#1E3A8A]/70 text-[#DBEAFE]"
                    >
                      <MdAdd className="text-xs" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.line_key)}
                    className="text-[#93C5FD] hover:text-white"
                  >
                    <MdDelete className="text-sm" />
                  </button>
                </div>
                {(noteEditorLineKey === item.line_key || item.notes?.trim()) && (
                  <div className="mt-2">
                    <textarea
                      value={item.notes || ''}
                      onChange={(e) => updateItemNote(item.line_key, e.target.value)}
                      placeholder="Escribe una nota para cocina..."
                      className="w-full rounded border border-[#60A5FA] bg-[#111827] px-2 py-1.5 text-xs text-[#F9FAFB] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                      rows={2}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {footer ? <div className="border-t border-[#3B82F6]/30 pt-3 mt-3 shrink-0 space-y-2">{footer}</div> : null}
      </div>
    </div>
  );
}
