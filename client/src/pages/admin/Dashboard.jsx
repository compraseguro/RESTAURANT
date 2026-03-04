import { useState, useEffect } from 'react';
import { api, formatCurrency, formatTime } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { MdTrendingUp, MdShoppingCart, MdAttachMoney, MdWarning, MdAccessTime } from 'react-icons/md';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#f04438', '#ffa520', '#10b981', '#3b82f6', '#8b5cf6'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    api.get('/reports/dashboard').then(setData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(loadData, []);
  useSocket('order-update', loadData);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>;
  if (!data) return null;

  const statCards = [
    { label: 'Ventas Hoy', value: formatCurrency(data.today.total), sub: `${data.today.count} pedidos`, icon: MdAttachMoney, color: 'bg-emerald-500' },
    { label: 'Ventas del Mes', value: formatCurrency(data.month.total), sub: `${data.month.count} pedidos`, icon: MdTrendingUp, color: 'bg-blue-500' },
    { label: 'Pedidos Activos', value: data.activeOrders, sub: 'En proceso', icon: MdShoppingCart, color: 'bg-amber-500' },
    { label: 'Stock Bajo', value: data.lowStock.length, sub: 'Productos', icon: MdWarning, color: 'bg-red-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card, i) => (
          <div key={i} className="card flex items-center gap-4">
            <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center`}>
              <card.icon className="text-white text-2xl" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-xl font-bold text-gray-800">{card.value}</p>
              <p className="text-xs text-gray-400">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h3 className="font-bold text-gray-800 mb-4">Productos Más Vendidos</h3>
          {data.topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topProducts.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="product_name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [v, 'Vendidos']} />
                <Bar dataKey="total_sold" fill="#f04438" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-8">Sin datos aún</p>}
        </div>

        <div className="card">
          <h3 className="font-bold text-gray-800 mb-4">Métodos de Pago (Hoy)</h3>
          {data.paymentMethods.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.paymentMethods} dataKey="total" nameKey="payment_method" cx="50%" cy="50%" outerRadius={100} label={({ payment_method, percent }) => `${payment_method} ${(percent * 100).toFixed(0)}%`}>
                  {data.paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-8">Sin ventas hoy</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-bold text-gray-800 mb-4">Pedidos Recientes</h3>
          <div className="space-y-3">
            {data.recentOrders.slice(0, 6).map(order => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-xs font-bold text-gray-600">#{order.order_number}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{order.customer_name || 'Cliente'}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <MdAccessTime className="text-xs" />
                      {formatTime(order.created_at)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatCurrency(order.total)}</p>
                  <span className={`badge badge-${order.status}`}>{order.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold text-gray-800 mb-4">Alertas de Stock</h3>
          {data.lowStock.length > 0 ? (
            <div className="space-y-3">
              {data.lowStock.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-medium">{p.name}</p>
                  <span className={`badge ${p.stock <= 5 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.stock} unid.
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-gray-400 text-center py-8">Todo el stock está bien</p>}
        </div>
      </div>
    </div>
  );
}
