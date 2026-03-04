import { useState, useEffect } from 'react';
import { api, formatCurrency, formatDateTime, ORDER_STATUS, ORDER_TYPES, PAYMENT_METHODS } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';
import { MdVisibility, MdRefresh } from 'react-icons/md';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const loadData = async () => {
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      setOrders(await api.get(`/orders${params}`));
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [filter]);
  useSocket('order-update', () => loadData());
  useSocket('new-order', () => { loadData(); });

  const updateStatus = async (orderId, status) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status });
      toast.success(`Estado actualizado a: ${ORDER_STATUS[status].label}`);
      loadData();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status }));
      }
    } catch (err) { toast.error(err.message); }
  };

  const statusFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'preparing', label: 'En Preparación' },
    { value: 'ready', label: 'Listos' },
    { value: 'delivered', label: 'Entregados' },
    { value: 'cancelled', label: 'Cancelados' },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Pedidos</h1>
        <button onClick={loadData} className="btn-secondary flex items-center gap-2"><MdRefresh /> Actualizar</button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {statusFilters.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)} className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === f.value ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">#</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Cliente</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Tipo</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Estado</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Total</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Pago</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Fecha</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-4 font-bold text-sm">#{order.order_number}</td>
                  <td className="py-3 px-4 text-sm">{order.customer_name || 'N/A'}</td>
                  <td className="py-3 px-4 text-sm">{ORDER_TYPES[order.type]}</td>
                  <td className="py-3 px-4"><span className={`badge ${ORDER_STATUS[order.status]?.color}`}>{ORDER_STATUS[order.status]?.label}</span></td>
                  <td className="py-3 px-4 font-bold text-sm">{formatCurrency(order.total)}</td>
                  <td className="py-3 px-4 text-sm">{PAYMENT_METHODS[order.payment_method]}</td>
                  <td className="py-3 px-4 text-xs text-gray-400">{formatDateTime(order.created_at)}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      <button onClick={() => setSelectedOrder(order)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500"><MdVisibility /></button>
                      {order.status === 'pending' && (
                        <button onClick={() => updateStatus(order.id, 'preparing')} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">Preparar</button>
                      )}
                      {order.status === 'preparing' && (
                        <button onClick={() => updateStatus(order.id, 'ready')} className="text-xs px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100">Listo</button>
                      )}
                      {order.status === 'ready' && (
                        <button onClick={() => updateStatus(order.id, 'delivered')} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">Entregar</button>
                      )}
                      {(order.status === 'pending' || order.status === 'preparing') && (
                        <button onClick={() => updateStatus(order.id, 'cancelled')} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">Cancelar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && <div className="text-center py-12 text-gray-400">No hay pedidos</div>}
      </div>

      <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={`Pedido #${selectedOrder?.order_number}`} size="lg">
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-xs text-gray-400">Cliente</span><p className="font-medium">{selectedOrder.customer_name || 'N/A'}</p></div>
              <div><span className="text-xs text-gray-400">Tipo</span><p className="font-medium">{ORDER_TYPES[selectedOrder.type]}</p></div>
              <div><span className="text-xs text-gray-400">Estado</span><p><span className={`badge ${ORDER_STATUS[selectedOrder.status]?.color}`}>{ORDER_STATUS[selectedOrder.status]?.label}</span></p></div>
              <div><span className="text-xs text-gray-400">Método de Pago</span><p className="font-medium">{PAYMENT_METHODS[selectedOrder.payment_method]}</p></div>
              {selectedOrder.table_number && <div><span className="text-xs text-gray-400">Mesa</span><p className="font-medium">{selectedOrder.table_number}</p></div>}
              {selectedOrder.delivery_address && <div className="col-span-2"><span className="text-xs text-gray-400">Dirección</span><p className="font-medium">{selectedOrder.delivery_address}</p></div>}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-bold text-sm mb-3">Productos</h4>
              {selectedOrder.items?.map(item => (
                <div key={item.id} className="flex justify-between py-2 border-b border-gray-50">
                  <div>
                    <span className="font-medium text-sm">{item.product_name}</span>
                    {item.variant_name && <span className="text-xs text-gray-400 ml-2">({item.variant_name})</span>}
                    <span className="text-xs text-gray-400 ml-2">x{item.quantity}</span>
                  </div>
                  <span className="font-medium text-sm">{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(selectedOrder.subtotal)}</span></div>
                <div className="flex justify-between text-gray-500"><span>IGV (18%)</span><span>{formatCurrency(selectedOrder.tax)}</span></div>
                {selectedOrder.discount > 0 && <div className="flex justify-between text-green-600"><span>Descuento</span><span>-{formatCurrency(selectedOrder.discount)}</span></div>}
                {selectedOrder.delivery_fee > 0 && <div className="flex justify-between text-gray-500"><span>Delivery</span><span>{formatCurrency(selectedOrder.delivery_fee)}</span></div>}
                <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>{formatCurrency(selectedOrder.total)}</span></div>
              </div>
            </div>

            {selectedOrder.notes && <div className="bg-amber-50 p-3 rounded-lg"><span className="text-xs font-medium text-amber-700">Notas:</span><p className="text-sm text-amber-800">{selectedOrder.notes}</p></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
