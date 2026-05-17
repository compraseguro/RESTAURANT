import { useMemo } from 'react';
import { buildPrecuentaPlainText } from '../../utils/ticketPlainText';
import { formatCurrency } from '../../utils/api';

/** Vista previa en tiempo real del ticket (precuenta de ejemplo). */
export default function TicketPreviewPanel({ restaurant, profile }) {
  const widthMm = Number(profile?.ticket?.paper_width_mm) === 58 ? 58 : 80;

  const previewText = useMemo(() => {
    const mergedRestaurant = { ...restaurant, profile };
    return buildPrecuentaPlainText({
      restaurant: mergedRestaurant,
      tableName: '12',
      mozoName: 'Demo',
      customerLines: [],
      groupedRows: [
        { product_name: 'Lomo saltado', quantity: 2, unit_price: 28, subtotal: 56 },
        { product_name: 'Chicha', quantity: 1, unit_price: 8, subtotal: 8 },
      ],
      formatCurrencyFn: formatCurrency,
      subtotal: 64,
      discount: 0,
      payableTotal: 64,
      widthMm,
    });
  }, [restaurant, profile, widthMm]);

  const welcome = String(profile?.ticket?.welcome_message || '').trim();
  const promo = String(profile?.ticket?.promo_message || '').trim();

  return (
    <div className="rounded-xl border border-[color:var(--ui-border)] bg-slate-900 p-4 lg:sticky lg:top-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Vista previa del ticket</p>
      {welcome ? (
        <p className="text-[10px] text-amber-200/90 mb-2 border border-amber-500/30 rounded px-2 py-1">{welcome}</p>
      ) : null}
      <pre className="text-[11px] leading-tight text-emerald-100 font-mono whitespace-pre-wrap break-words max-h-[420px] overflow-y-auto">
        {previewText}
      </pre>
      {promo ? (
        <p className="text-[10px] text-sky-200/90 mt-2 border border-sky-500/30 rounded px-2 py-1">{promo}</p>
      ) : null}
      <p className="text-[10px] text-slate-500 mt-2">Ancho simulado: {widthMm} mm · Los cambios se reflejan al escribir.</p>
    </div>
  );
}
