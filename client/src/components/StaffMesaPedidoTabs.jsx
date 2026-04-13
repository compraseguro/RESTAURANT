import { useState, useEffect, useMemo } from 'react';
import {
  flattenOrdersToLines,
  mergeLinesByProductName,
  getStaffOrderStatusUi,
} from '../utils/mesaOrderLines';

const defaultLabels = {
  add: 'Agregar pedido',
  view: 'Ver pedido',
  listTitle: 'Pedidos de la mesa',
  merge: 'Unir pedidos',
  unmerge: 'Desagrupar',
  empty: 'No hay pedidos en esta mesa.',
};

/**
 * Pestañas Agregar / Ver + lista en líneas + unir por nombre (Mesas, Caja, auto-pedido).
 */
export default function StaffMesaPedidoTabs({
  orders = [],
  formatCurrency,
  children,
  labels: labelsProp,
  /** Al cambiar mesa / contexto, vuelve a «Agregar» y desagrupa */
  resetKey,
  className = '',
}) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [panel, setPanel] = useState('add');
  const [unirPorNombre, setUnirPorNombre] = useState(false);

  useEffect(() => {
    setPanel('add');
    setUnirPorNombre(false);
  }, [resetKey]);

  const lineRows = useMemo(() => flattenOrdersToLines(orders), [orders]);
  const mergedRows = useMemo(() => mergeLinesByProductName(lineRows), [lineRows]);
  const rowsToShow = unirPorNombre ? mergedRows : lineRows;

  return (
    <div className={`flex flex-col gap-3 min-h-0 flex-1 ${className}`}>
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            setPanel('add');
            setUnirPorNombre(false);
          }}
          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
            panel === 'add'
              ? 'bg-[#BFDBFE] text-[#1E3A8A] border-[#BFDBFE]'
              : 'bg-[#1E3A8A]/40 text-[#DBEAFE] border-[#3B82F6]/30 hover:bg-[#1E3A8A]/60'
          }`}
        >
          {labels.add}
        </button>
        <button
          type="button"
          onClick={() => setPanel('view')}
          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
            panel === 'view'
              ? 'bg-[#BFDBFE] text-[#1E3A8A] border-[#BFDBFE]'
              : 'bg-[#1E3A8A]/40 text-[#DBEAFE] border-[#3B82F6]/30 hover:bg-[#1E3A8A]/60'
          }`}
        >
          {labels.view}
        </button>
      </div>

      {panel === 'view' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden text-[#F9FAFB]">
          {(orders || []).length === 0 ? (
            <p className="text-sm text-[#BFDBFE]">{labels.empty}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 shrink-0 mb-2">
                <p className="text-xs uppercase tracking-wide text-[#BFDBFE] font-semibold">{labels.listTitle}</p>
                <button
                  type="button"
                  onClick={() => setUnirPorNombre((v) => !v)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#1E3A8A]/60 border border-[#3B82F6]/35 text-[#DBEAFE] hover:bg-[#1E3A8A]/80"
                >
                  {unirPorNombre ? labels.unmerge : labels.merge}
                </button>
              </div>
              <div className="flex text-[10px] uppercase tracking-wide text-[#93C5FD] border-b border-[#3B82F6]/35 pb-1.5 shrink-0">
                <span className="flex-1 min-w-0 pr-2">Producto</span>
                <span className="w-11 text-center shrink-0">Cant.</span>
                <span className="w-[5.5rem] text-right shrink-0">Total</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pr-0.5">
                {rowsToShow.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-baseline gap-1 py-1.5 border-b border-[#3B82F6]/20 text-sm text-[#F1F5F9]"
                  >
                    <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      {!unirPorNombre && row.orderNumber != null ? (
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
              {!unirPorNombre ? (
                <div className="mt-3 pt-2 border-t border-[#3B82F6]/25 shrink-0 space-y-1">
                  {(orders || []).map((order) => (
                    <div key={order.id} className="flex justify-between items-center text-xs text-[#BFDBFE]">
                      <span>Pedido #{order.order_number || '-'}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${getStaffOrderStatusUi(order.status).classes}`}
                      >
                        {getStaffOrderStatusUi(order.status).label}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
