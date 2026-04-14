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
  totalMesa: 'Total mesa',
};

const MERGE_STORAGE_PREFIX = 'mesaPedidoMerge:';

function readMergeSaved(resetKey) {
  if (resetKey == null || resetKey === '') return false;
  try {
    return sessionStorage.getItem(`${MERGE_STORAGE_PREFIX}${resetKey}`) === '1';
  } catch {
    return false;
  }
}

function writeMergeSaved(resetKey, value) {
  if (resetKey == null || resetKey === '') return;
  try {
    sessionStorage.setItem(`${MERGE_STORAGE_PREFIX}${resetKey}`, value ? '1' : '0');
  } catch {
    /* private mode / quota */
  }
}

/**
 * Pestañas Agregar / Ver + lista en líneas + unir por nombre (Mesas, Caja, auto-pedido).
 * «Unir pedidos» se recuerda por mesa (sessionStorage) hasta pulsar «Desagrupar», aunque se cierre el panel.
 */
export default function StaffMesaPedidoTabs({
  orders = [],
  formatCurrency,
  children,
  labels: labelsProp,
  /** Identificador de mesa/contexto: al cambiar se carga la preferencia de unión guardada */
  resetKey,
  className = '',
}) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [panel, setPanel] = useState('add');
  const [unirPorNombre, setUnirPorNombre] = useState(() => readMergeSaved(resetKey));

  useEffect(() => {
    setPanel('add');
    setUnirPorNombre(readMergeSaved(resetKey));
  }, [resetKey]);

  const lineRows = useMemo(() => flattenOrdersToLines(orders), [orders]);
  const mergedRows = useMemo(() => mergeLinesByProductName(lineRows), [lineRows]);
  const rowsToShow = unirPorNombre ? mergedRows : lineRows;

  /** Total cuenta mesa: suma de totales de pedidos; si no hay total, suma de subtotales por ítem */
  const totalMesa = useMemo(() => {
    const byOrders = (orders || []).reduce((s, o) => s + Number(o.total || 0), 0);
    if (byOrders > 0) return byOrders;
    return lineRows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  }, [orders, lineRows]);

  const toggleUnir = () => {
    setUnirPorNombre((prev) => {
      const next = !prev;
      writeMergeSaved(resetKey, next);
      return next;
    });
  };

  return (
    <div className={`flex flex-col gap-3 min-h-0 flex-1 ${className}`}>
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setPanel('add')}
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
                  onClick={toggleUnir}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#1E3A8A]/60 border border-[#3B82F6]/35 text-[#DBEAFE] hover:bg-[#1E3A8A]/80"
                >
                  {unirPorNombre ? labels.unmerge : labels.merge}
                </button>
              </div>
              <div className="flex text-[10px] uppercase tracking-wide text-[#93C5FD] border-b border-[#3B82F6]/35 pb-1.5 shrink-0 gap-1">
                <span className="flex-1 min-w-0 pr-1">Producto</span>
                <span className="w-[5.5rem] shrink-0 text-center">Estado</span>
                <span className="w-10 text-center shrink-0">Cant.</span>
                <span className="w-[5.25rem] text-right shrink-0">Total</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pr-0.5">
                {rowsToShow.map((row) => {
                  const st = getStaffOrderStatusUi(row.status);
                  return (
                    <div
                      key={row.key}
                      className="flex items-center gap-1 py-1.5 border-b border-[#3B82F6]/20 text-sm text-[#F1F5F9]"
                    >
                      <span className="flex-1 min-w-0 flex items-center gap-1.5">
                        {!unirPorNombre && row.orderNumber != null ? (
                          <span className="text-[10px] text-[#93C5FD] shrink-0 tabular-nums">#{row.orderNumber}</span>
                        ) : null}
                        <span className="truncate">{row.name}</span>
                      </span>
                      <span className="w-[5.5rem] shrink-0 flex justify-center px-0.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold max-w-full truncate ${st.classes}`}
                          title={st.label}
                        >
                          {st.label}
                        </span>
                      </span>
                      <span className="w-10 text-center tabular-nums text-[#DBEAFE] font-medium shrink-0">{row.quantity}</span>
                      <span className="w-[5.25rem] text-right tabular-nums font-semibold text-white shrink-0">
                        {formatCurrency(row.subtotal)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-[#3B82F6]/40 shrink-0 flex justify-between items-center gap-3">
                <span className="text-sm font-bold text-[#BFDBFE]">{labels.totalMesa}</span>
                <span className="text-lg font-bold text-white tabular-nums">{formatCurrency(totalMesa)}</span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      )}
    </div>
  );
}
