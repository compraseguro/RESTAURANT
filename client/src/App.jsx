import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Layout from './components/Layout';
import Login from './pages/Login';
import Escritorio from './pages/admin/Escritorio';
import Ventas from './pages/admin/Ventas';
import POSPanel from './pages/pos/POSPanel';
import Tables from './pages/admin/Tables';
import Reservas from './pages/admin/Reservas';
import AutoPedidoAdmin from './pages/admin/AutoPedidoAdmin';
import SelfOrder from './pages/public/SelfOrder';
import SelfOrderCliente from './pages/public/SelfOrderCliente';
import Creditos from './pages/admin/Creditos';
import Clientes from './pages/admin/Clientes';
import Productos from './pages/admin/Productos';
import Ofertas from './pages/admin/Ofertas';
import Descuentos from './pages/admin/Descuentos';
import Almacen from './pages/admin/Almacen';
import Delivery from './pages/admin/Delivery';
import Reports from './pages/admin/Reports';
import Indicadores from './pages/admin/Indicadores';
import MiRestaurant from './pages/admin/MiRestaurant';
import Settings from './pages/admin/Settings';
import WorkTime from './pages/admin/WorkTime';
import KitchenPanel from './pages/kitchen/KitchenPanel';
import DeliveryPanel from './pages/delivery/DeliveryPanel';
import CustomerLayout from './pages/customer/CustomerLayout';
import Menu from './pages/customer/Menu';
import Cart from './pages/customer/Cart';
import CustomerOrders from './pages/customer/CustomerOrders';
import OrderTracking from './pages/customer/OrderTracking';
import MasterAdmin from './pages/master/MasterAdmin';

const ADMIN_MODULE_PATHS = [
  { path: '/admin', moduleId: 'escritorio', roles: ['admin', 'cajero'] },
  { path: '/admin/caja', moduleId: 'caja', roles: ['admin', 'cajero'] },
  { path: '/admin/mesas', moduleId: 'mesas', roles: ['admin', 'mozo'] },
  { path: '/admin/cocina', moduleId: 'cocina', roles: ['admin'] },
  { path: '/admin/bar', moduleId: 'bar', roles: ['admin'] },
  { path: '/admin/delivery', moduleId: 'delivery', roles: ['admin', 'cajero', 'mozo'] },
  { path: '/admin/reservas', moduleId: 'reservas', roles: ['admin', 'cajero', 'mozo'] },
  { path: '/admin/auto-pedido', moduleId: 'auto_pedido', roles: ['admin'] },
  { path: '/admin/clientes', moduleId: 'clientes', roles: ['admin', 'cajero'] },
  { path: '/admin/creditos', moduleId: 'creditos', roles: ['admin', 'cajero'] },
  { path: '/admin/ofertas', moduleId: 'ofertas', roles: ['admin'] },
  { path: '/admin/descuentos', moduleId: 'descuentos', roles: ['admin'] },
  { path: '/admin/almacen', moduleId: 'almacen', roles: ['admin'] },
  { path: '/admin/productos', moduleId: 'productos', roles: ['admin'] },
  { path: '/admin/informes', moduleId: 'informes', roles: ['admin', 'cajero'] },
  { path: '/admin/ventas', moduleId: 'ventas', roles: ['admin', 'cajero'] },
  { path: '/admin/indicadores', moduleId: 'indicadores', roles: ['admin'] },
  { path: '/admin/mi-restaurant', moduleId: 'mi_restaurant', roles: ['admin', 'master_admin'] },
  { path: '/admin/tiempo-trabajado', moduleId: 'tiempo_trabajado', roles: ['admin'] },
  { path: '/admin/configuracion', moduleId: 'configuracion', roles: ['admin'] },
];

function isPermissionEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function hasModulePermission(user, moduleId) {
  if (!moduleId) return true;
  if (user?.role === 'master_admin') return true;
  if (!user || typeof user.permissions !== 'object' || user.permissions === null) return false;
  return isPermissionEnabled(user.permissions[moduleId]);
}

function getDefaultStaffPath(user) {
  if (!user) return '/';
  if (user.role === 'master_admin') return '/master';
  if (user.role === 'cocina') return hasModulePermission(user, 'cocina') ? '/kitchen' : '/';
  if (user.role === 'bar') return hasModulePermission(user, 'bar') ? '/bar' : '/';
  if (user.role === 'delivery') return hasModulePermission(user, 'delivery') ? '/delivery' : '/';
  if (!['admin', 'cajero', 'mozo'].includes(user.role)) return '/admin';
  const first = ADMIN_MODULE_PATHS.find((item) => hasModulePermission(user, item.moduleId));
  return first?.path || '/admin';
}

function ProtectedRoute({ children, roles, moduleId }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;
  if (!user || user.type === 'customer') return <Navigate to="/" />;
  const hasPermission = moduleId ? hasModulePermission(user, moduleId) : true;
  if (roles && !roles.includes(user.role) && !hasPermission) return <Navigate to="/admin" />;
  if (moduleId && !hasPermission) return <Navigate to="/admin" replace />;
  return children;
}

function DefaultPage() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.role === 'master_admin') return <Navigate to="/master" replace />;
  const defaultPath = getDefaultStaffPath(user);
  if (defaultPath !== '/admin') return <Navigate to={defaultPath} replace />;
  if (!hasModulePermission(user, 'escritorio')) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="card max-w-md text-center">
          <h2 className="text-xl font-bold mb-2">Sin módulos asignados</h2>
          <p className="text-slate-400 text-sm">Este usuario no tiene permisos activos. Solicita acceso al administrador.</p>
        </div>
      </div>
    );
  }
  return <Escritorio />;
}

function LegacyTrackingRedirect() {
  const { id } = useParams();
  return <Navigate to={`/customer/orders/${id}`} replace />;
}

/** Configuración de cartas y QR: solo rol `admin` (vista pública del QR en `/auto-pedido`). */
function AdminOnlyAutoPedido() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/admin" replace />;
  return <AutoPedidoAdmin />;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111827]">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[#9CA3AF]">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auto-pedido" element={<SelfOrder />} />
      <Route path="/auto-pedido-cliente" element={<SelfOrderCliente />} />
      <Route path="/" element={user && user.type === 'staff' ? <Navigate to={
        getDefaultStaffPath(user)
      } /> : <Login />} />

      <Route path="/admin" element={<ProtectedRoute roles={['admin', 'cajero', 'mozo']}><Layout /></ProtectedRoute>}>
        <Route index element={<DefaultPage />} />
        <Route path="ventas" element={<ProtectedRoute roles={['admin', 'cajero']} moduleId="ventas"><Ventas /></ProtectedRoute>} />
        <Route path="caja" element={<ProtectedRoute roles={['admin', 'cajero']} moduleId="caja"><POSPanel /></ProtectedRoute>} />
        <Route path="tiempo-trabajado" element={<ProtectedRoute roles={['admin']} moduleId="tiempo_trabajado"><WorkTime /></ProtectedRoute>} />
        <Route path="mesas" element={<ProtectedRoute roles={['admin', 'mozo']} moduleId="mesas"><Tables /></ProtectedRoute>} />
        <Route path="reservas" element={<ProtectedRoute roles={['admin', 'cajero', 'mozo']} moduleId="reservas"><Reservas /></ProtectedRoute>} />
        <Route path="auto-pedido" element={<AdminOnlyAutoPedido />} />
        <Route path="creditos" element={<ProtectedRoute roles={['admin', 'cajero']} moduleId="creditos"><Creditos /></ProtectedRoute>} />
        <Route path="clientes" element={<ProtectedRoute roles={['admin', 'cajero']} moduleId="clientes"><Clientes /></ProtectedRoute>} />
        <Route path="productos" element={<ProtectedRoute roles={['admin']} moduleId="productos"><Productos /></ProtectedRoute>} />
        <Route path="ofertas" element={<ProtectedRoute roles={['admin']} moduleId="ofertas"><Ofertas /></ProtectedRoute>} />
        <Route path="descuentos" element={<ProtectedRoute roles={['admin']} moduleId="descuentos"><Descuentos /></ProtectedRoute>} />
        <Route path="almacen" element={<ProtectedRoute roles={['admin']} moduleId="almacen"><Almacen /></ProtectedRoute>} />
        <Route path="delivery" element={<ProtectedRoute roles={['admin', 'cajero', 'mozo']} moduleId="delivery"><Delivery /></ProtectedRoute>} />
        <Route path="cocina" element={<ProtectedRoute roles={['admin']} moduleId="cocina"><KitchenPanel station="cocina" /></ProtectedRoute>} />
        <Route path="bar" element={<ProtectedRoute roles={['admin']} moduleId="bar"><KitchenPanel station="bar" /></ProtectedRoute>} />
        <Route path="informes" element={<ProtectedRoute roles={['admin', 'cajero']} moduleId="informes"><Reports /></ProtectedRoute>} />
        <Route path="indicadores" element={<ProtectedRoute roles={['admin']} moduleId="indicadores"><Indicadores /></ProtectedRoute>} />
        <Route path="comprobantes-emitidos" element={<Navigate to="/admin/informes?seccion=facturacion" replace />} />
        <Route path="mi-restaurant" element={<ProtectedRoute roles={['admin', 'master_admin']} moduleId="mi_restaurant"><MiRestaurant /></ProtectedRoute>} />
        <Route path="configuracion" element={<ProtectedRoute roles={['admin']} moduleId="configuracion"><Settings /></ProtectedRoute>} />
      </Route>

      <Route path="/kitchen" element={<ProtectedRoute roles={['admin', 'cocina']} moduleId="cocina"><KitchenPanel station="cocina" /></ProtectedRoute>} />
      <Route path="/bar" element={<ProtectedRoute roles={['admin', 'bar']} moduleId="bar"><KitchenPanel station="bar" /></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute roles={['admin', 'delivery']} moduleId="delivery"><DeliveryPanel /></ProtectedRoute>} />
      <Route path="/master" element={<ProtectedRoute roles={['master_admin']}><MasterAdmin /></ProtectedRoute>} />
      <Route path="/customer" element={<CustomerLayout />}>
        <Route index element={<Menu />} />
        <Route path="cart" element={<Cart />} />
        <Route path="orders" element={<CustomerOrders />} />
        <Route path="orders/:id" element={<OrderTracking />} />
      </Route>

      <Route path="/menu" element={<Navigate to="/customer" replace />} />
      <Route path="/cart" element={<Navigate to="/customer/cart" replace />} />
      <Route path="/my-orders" element={<Navigate to="/customer/orders" replace />} />
      <Route path="/tracking/:id" element={<LegacyTrackingRedirect />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
