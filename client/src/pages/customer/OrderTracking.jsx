import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatCurrency, ORDER_STATUS, ORDER_TYPES, formatDateTime } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { MdCheckCircle, MdAccessTime, MdRestaurant, MdDeliveryDining, MdArrowBack } from 'react-icons/md';

const STEPS = [
  { status: 'pending', label: 'Pedido Recibido', icon: MdAccessTime },
  { status: 'preparing', label: 'En Preparación', icon: MdRestaurant },
  { status: 'ready', label: 'Listo', icon: MdCheckCircle },
  { status: 'delivered', label: 'Entregado', icon: MdDeliveryDining },
];

export default function OrderTracking() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadOrder = async () => {
    try {
      setOrder(await api.get(`/orders/${id}`));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadOrder(); }, [id]);

  useSocket('order-update', (updatedOrder) => {
    if (String(updatedOrder.id) === String(id)) setOrder(updatedOrder);
  });

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Pedido no encontrado</p>
        <Link to="/customer" className="text-primary-600 hover:underline mt-4 inline-block">Volver al menú</Link>
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex(s => s.status === order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/customer" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm font-medium">
        <MdArrowBack /> Volver al Menú
      </Link>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className={`px-6 py-8 text-center ${isCancelled ? 'bg-red-50' : 'bg-gradient-to-r from-primary-500 to-primary-600'}`}>
          <p className={`text-sm mb-1 ${isCancelled ? 'text-red-600' : 'text-white/80'}`}>Pedido #{order.order_number}</p>
          <h1 className={`text-2xl font-bold ${isCancelled ? 'text-red-700' : 'text-white'}`}>
            {isCancelled ? 'Pedido Cancelado' : ORDER_STATUS[order.status]?.label}
          </h1>
          <p className={`text-sm mt-2 ${isCancelled ? 'text-red-500' : 'text-white/70'}`}>{formatDateTime(order.created_at)}</p>
        </div>

        {!isCancelled && (
          <div className="px-6 py-8">
            <div className="flex items-center justify-between relative">
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-0" />
              <div className="absolute top-5 left-0 h-0.5 bg-primary-500 -z-0 transition-all duration-500" style={{ width: `${(currentStepIndex / (STEPS.length - 1)) * 100}%` }} />

              {STEPS.map((step, i) => {
                const isCompleted = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;
                const StepIcon = step.icon;

                return (
                  <div key={step.status} className="flex flex-col items-center relative z-10">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isCompleted ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'
                    } ${isCurrent ? 'ring-4 ring-primary-100 scale-110' : ''}`}>
                      <StepIcon className="text-xl" />
                    </div>
                    <p className={`text-xs mt-2 font-medium text-center ${isCompleted ? 'text-primary-600' : 'text-gray-400'}`}>{step.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="text-xs text-gray-400">Tipo</p>
              <p className="font-medium text-sm">{ORDER_TYPES[order.type]}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Pago</p>
              <p className="font-medium text-sm capitalize">{order.payment_method}</p>
            </div>
            {order.delivery_address && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400">Dirección de entrega</p>
                <p className="font-medium text-sm">{order.delivery_address}</p>
              </div>
            )}
          </div>

          <h3 className="font-bold text-gray-800 mb-3">Detalle del Pedido</h3>
          <div className="space-y-2 mb-4">
            {order.items?.map(item => (
              <div key={item.id} className="flex justify-between py-2 border-b border-gray-50">
                <div>
                  <span className="font-medium text-sm">{item.quantity}x {item.product_name}</span>
                  {item.variant_name && <span className="text-xs text-gray-400 ml-2">({item.variant_name})</span>}
                </div>
                <span className="font-medium text-sm">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-sm pt-3 border-t">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
            <div className="flex justify-between text-gray-500"><span>IGV</span><span>{formatCurrency(order.tax)}</span></div>
            {order.delivery_fee > 0 && <div className="flex justify-between text-gray-500"><span>Delivery</span><span>{formatCurrency(order.delivery_fee)}</span></div>}
            {order.discount > 0 && <div className="flex justify-between text-green-600"><span>Descuento</span><span>-{formatCurrency(order.discount)}</span></div>}
            <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span className="text-primary-600">{formatCurrency(order.total)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
