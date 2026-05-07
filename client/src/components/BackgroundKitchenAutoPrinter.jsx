import { useRef } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { orderHasTakeoutNote, buildPedidoMesaTicketPlainText } from '../utils/ticketPlainText';

function isBarItem(item = {}) {
  const area = String(item?.production_area || '').toLowerCase();
  if (area === 'bar') return true;
  const text = `${item?.category_name_lc || ''} ${item?.product_name || ''}`.toLowerCase();
  return ['bar', 'bebida', 'bebidas', 'trago', 'tragos', 'coctel', 'cocteles', 'cocktail', 'cocktails'].some((t) => text.includes(t));
}

export default function BackgroundKitchenAutoPrinter() {
  const { user } = useAuth();
  const printedKeysRef = useRef(new Set());

  const autoPrintOrder = async (incomingOrder) => {
    if (!user || user.type !== 'staff') return;
    const role = String(user.role || '').toLowerCase();
    if (!['admin', 'cajero', 'mozo', 'cocina', 'bar', 'master_admin'].includes(role)) return;

    const orderId = incomingOrder?.id;
    if (!orderId) return;
    const dedupeKey = `${orderId}:${incomingOrder?.updated_at || incomingOrder?.created_at || 'x'}`;
    if (printedKeysRef.current.has(dedupeKey)) return;
    printedKeysRef.current.add(dedupeKey);
    if (printedKeysRef.current.size > 400) {
      printedKeysRef.current = new Set(Array.from(printedKeysRef.current).slice(-200));
    }

    try {
      const [cfg, fullOrder] = await Promise.all([
        api.printing.get('/printing/config'),
        api.get(`/orders/${orderId}`),
      ]);
      const items = Array.isArray(fullOrder?.items) ? fullOrder.items : [];
      if (!items.length) return;

      const kitchenItems = items.filter((it) => !isBarItem(it));
      const barItems = items.filter((it) => isBarItem(it));
      const paperC = Number(cfg?.cocina?.paperWidth || cfg?.cocina?.anchoPapel || 80) === 58 ? 58 : 80;
      const paperB = Number(cfg?.bar?.paperWidth || cfg?.bar?.anchoPapel || 80) === 58 ? 58 : 80;
      const takeout = orderHasTakeoutNote(fullOrder);
      const waiter = String(fullOrder?.created_by_user_name || '').trim();
      const tableLbl =
        fullOrder?.type === 'dine_in' && fullOrder?.table_number
          ? `Mesa ${String(fullOrder.table_number).trim()}`
          : String(fullOrder?.table_number || '').trim();

      const toTicket = (list) =>
        list.map((it) => ({
          product_name: String(it.product_name || '').trim() || '—',
          variant_name: String(it.variant_name || '').trim(),
          quantity: Number(it.quantity || 1),
          notes: String(it.notes || '').trim(),
          modifier_option: String(it.modifier_option || '').trim(),
        }));

      if (cfg?.cocina?.autoPrint && kitchenItems.length > 0) {
        const text = buildPedidoMesaTicketPlainText({
          tableLabel: tableLbl,
          orderNumber: fullOrder?.order_number,
          takeout,
          waiterName: waiter,
          items: toTicket(kitchenItems),
          widthMm: paperC,
          printedAt: new Date(),
        });
        await api.printing.post('/printing/print/cocina', { text, preformatted: true });
      }
      if (cfg?.bar?.autoPrint && barItems.length > 0) {
        const text = buildPedidoMesaTicketPlainText({
          tableLabel: tableLbl,
          orderNumber: fullOrder?.order_number,
          takeout,
          waiterName: waiter,
          items: toTicket(barItems),
          widthMm: paperB,
          printedAt: new Date(),
        });
        await api.printing.post('/printing/print/bar', { text, preformatted: true });
      }
    } catch (err) {
      console.warn('[printing] auto background cocina/bar:', err?.message || err);
    }
  };

  useSocket('new-order', (order) => {
    void autoPrintOrder(order);
  });
  useSocket('order-lines-updated', (order) => {
    void autoPrintOrder(order);
  });

  return null;
}

