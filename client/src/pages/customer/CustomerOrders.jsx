import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCurrency, ORDER_STATUS, ORDER_TYPES, formatDateTime } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { MdReceipt, MdVisibility, MdShoppingCart } from 'react-icons/md';

export default function CustomerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.type === 'customer') {
      api.get('/orders').then(setOrders).catch(console.error).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  if (!user || user.type !== 'customer') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <MdReceipt className="text-5xl text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Inicia sesión</h2>
        <p className="text-gray-500">Debes iniciar sesión para ver tus pedidos</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Mis Pedidos</h1>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <MdShoppingCart className="text-5xl text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-700 mb-2">Aún no tienes pedidos</h2>
          <p className="text-gray-500 mb-6">Realiza tu primer pedido desde nuestro menú</p>
          <Link to="/customer" className="btn-primary inline-flex items-center gap-2 px-6 py-3">
            Ver Menú
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
                    <span className="text-primary-700 font-bold text-sm">#{order.order_number}</span>
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-800">{ORDER_TYPES[order.type]}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(order.created_at)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`badge ${ORDER_STATUS[order.status]?.color}`}>{ORDER_STATUS[order.status]?.label}</span>
                  <p className="font-bold text-primary-600 mt-1">{formatCurrency(order.total)}</p>
                </div>
              </div>

              <div className="text-sm text-gray-500 mb-3">
                {order.items?.slice(0, 3).map(item => (
                  <span key={item.id} className="inline-block mr-2">{item.quantity}x {item.product_name}</span>
                ))}
                {(order.items?.length || 0) > 3 && <span className="text-gray-400">y {order.items.length - 3} más...</span>}
              </div>

              <Link to={`/customer/orders/${order.id}`} className="flex items-center gap-1 text-primary-600 text-sm font-medium hover:text-primary-700">
                <MdVisibility /> Ver detalle
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
