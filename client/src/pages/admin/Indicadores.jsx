import { useState, useEffect } from 'react';
import { api, formatCurrency } from '../../utils/api';
import { MdTrendingUp, MdTrendingDown, MdPeople, MdRestaurantMenu, MdAttachMoney, MdShoppingCart } from 'react-icons/md';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#de3024', '#f04438', '#f97066', '#ffcdc9', '#fef3f2', '#10b981', '#3b82f6', '#8b5cf6'];

export default function Indicadores() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/orders'), api.get('/products')])
      .then(([o, p]) => { setOrders(o); setProducts(p); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const paidOrders = orders.filter(o => o.payment_status === 'paid' && o.status !== 'cancelled');
  const totalRevenue = paidOrders.reduce((s, o) => s + (o.total || 0), 0);
  const avgTicket = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

  /** Tipo de canal (salón / delivery / llevar), no el número de mesa física. */
  const ordersByType = [
    { name: 'En local (salón)', value: paidOrders.filter(o => o.type === 'dine_in').length },
    { name: 'Delivery', value: paidOrders.filter(o => o.type === 'delivery').length },
    { name: 'Para llevar', value: paidOrders.filter(o => o.type === 'pickup').length },
  ].filter(d => d.value > 0);

  const paymentMethods = [
    { name: 'Efectivo', value: paidOrders.filter(o => o.payment_method === 'efectivo').length },
    { name: 'Yape', value: paidOrders.filter(o => o.payment_method === 'yape').length },
    { name: 'Plin', value: paidOrders.filter(o => o.payment_method === 'plin').length },
    { name: 'Tarjeta', value: paidOrders.filter(o => o.payment_method === 'tarjeta').length },
  ].filter(d => d.value > 0);

  const productRanking = {};
  paidOrders.forEach(o => (o.items || []).forEach(it => {
    productRanking[it.product_name] = (productRanking[it.product_name] || 0) + it.quantity;
  }));
  const topProducts = Object.entries(productRanking).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, qty]) => ({ name: name.length > 15 ? name.substring(0, 15) + '...' : name, cantidad: qty }));

  const last7Days = [];
  const toLocalDateKey = (v) => {
    const d = new Date(`${v}Z`);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    const dayOrders = paidOrders.filter(o => o.created_at && toLocalDateKey(o.created_at) === dateStr);
    last7Days.push({ name: d.toLocaleDateString('es-PE', { weekday: 'short' }), ventas: dayOrders.reduce((s, o) => s + (o.total || 0), 0), pedidos: dayOrders.length });
  }

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-5">Indicadores</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card"><div className="flex items-center gap-2 mb-1"><MdAttachMoney className="text-emerald-500" /><p className="text-xs text-slate-500">Ingresos Totales</p></div><p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p></div>
        <div className="card"><div className="flex items-center gap-2 mb-1"><MdShoppingCart className="text-sky-500" /><p className="text-xs text-slate-500">Total Pedidos</p></div><p className="text-2xl font-bold">{orders.length}</p></div>
        <div className="card"><div className="flex items-center gap-2 mb-1"><MdTrendingUp className="text-sky-500" /><p className="text-xs text-slate-500">Ticket Promedio</p></div><p className="text-2xl font-bold">{formatCurrency(avgTicket)}</p></div>
        <div className="card"><div className="flex items-center gap-2 mb-1"><MdRestaurantMenu className="text-gold-500" /><p className="text-xs text-slate-500">Productos</p></div><p className="text-2xl font-bold">{products.length}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Ventas - Últimos 7 Días</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={last7Days}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v) => formatCurrency(v)} /><Bar dataKey="ventas" fill="#de3024" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Pedidos - Últimos 7 Días</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={last7Days}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Line type="monotone" dataKey="pedidos" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} /></LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Ranking de Productos</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topProducts} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="cantidad" fill="#f04438" radius={[0, 4, 4, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-1">Pedidos por tipo de canal</h3>
          <p className="text-xs text-slate-500 mb-3">
            Salón, delivery o para llevar. Varias mesas en salón cuentan como un solo sector «En local».
          </p>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={ordersByType}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${String(name).split('(')[0].trim()} ${(percent * 100).toFixed(0)}%`}
              >
                {ordersByType.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const { name, value } = payload[0];
                  const n = Number(value) || 0;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                      <p className="font-semibold text-slate-800">{name}</p>
                      <p className="text-slate-600 mt-0.5">
                        {n} pedido{n === 1 ? '' : 's'} en este período
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Métodos de Pago</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={paymentMethods}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {paymentMethods.map((_, i) => (
                  <Cell key={i} fill={COLORS[i + 2]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const { name, value } = payload[0];
                  const n = Number(value) || 0;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                      <p className="font-semibold text-slate-800">{name}</p>
                      <p className="text-slate-600 mt-0.5">
                        {n} pedido{n === 1 ? '' : 's'}
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
