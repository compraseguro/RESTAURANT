import { useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import EndShiftModal from './EndShiftModal';
import AdminAttendanceReviewModal from './AdminAttendanceReviewModal';
import {
  MdDashboard, MdAttachMoney, MdPointOfSale, MdEventSeat,
  MdCreditCard, MdPeopleAlt, MdRestaurantMenu, MdLocalOffer,
  MdDiscount, MdWarehouse, MdDeliveryDining, MdAssessment,
  MdInsights, MdStorefront, MdSettings, MdLogout, MdTableBar, MdAccessTime, MdKitchen, MdLocalBar, MdQrCode2,
  MdReceipt,
} from 'react-icons/md';

const allLinks = [
  { to: '/admin', icon: MdDashboard, label: 'Escritorio', end: true, roles: ['admin', 'cajero'], moduleId: 'escritorio' },
  { to: '/admin/caja', icon: MdPointOfSale, label: 'Caja', roles: ['admin', 'cajero'], moduleId: 'caja' },
  { to: '/admin/mesas', icon: MdTableBar, label: 'Mesas', roles: ['admin', 'mozo'], moduleId: 'mesas' },
  { to: '/admin/cocina', icon: MdKitchen, label: 'Cocina', roles: ['admin'], moduleId: 'cocina' },
  { to: '/admin/bar', icon: MdLocalBar, label: 'Bar', roles: ['admin'], moduleId: 'bar' },
  { to: '/admin/delivery', icon: MdDeliveryDining, label: 'Delivery', roles: ['admin', 'cajero', 'mozo'], moduleId: 'delivery' },
  { to: '/admin/reservas', icon: MdEventSeat, label: 'Reservas', roles: ['admin', 'cajero', 'mozo'], moduleId: 'reservas' },
  { to: '/admin/auto-pedido', icon: MdQrCode2, label: 'Cartas y QR (config.)', roles: ['admin'], moduleId: 'auto_pedido' },
  { to: '/admin/clientes', icon: MdPeopleAlt, label: 'Clientes', roles: ['admin', 'cajero'], moduleId: 'clientes' },
  { to: '/admin/creditos', icon: MdCreditCard, label: 'Créditos', roles: ['admin', 'cajero'], moduleId: 'creditos' },
  { to: '/admin/ofertas', icon: MdLocalOffer, label: 'Ofertas', roles: ['admin'], moduleId: 'ofertas' },
  { to: '/admin/descuentos', icon: MdDiscount, label: 'Descuentos', roles: ['admin'], moduleId: 'descuentos' },
  { to: '/admin/almacen', icon: MdWarehouse, label: 'Almacén', roles: ['admin'], moduleId: 'almacen' },
  { to: '/admin/productos', icon: MdRestaurantMenu, label: 'Productos', roles: ['admin'], moduleId: 'productos' },
  { to: '/admin/informes', icon: MdAssessment, label: 'Informes', roles: ['admin', 'cajero'], moduleId: 'informes' },
  { to: '/admin/ventas', icon: MdAttachMoney, label: 'Ventas', roles: ['admin', 'cajero'], moduleId: 'ventas' },
  { to: '/admin/indicadores', icon: MdInsights, label: 'Indicadores', roles: ['admin'], moduleId: 'indicadores' },
  { to: '/admin/comprobantes-emitidos', icon: MdReceipt, label: 'Comprobantes', roles: ['admin', 'cajero'], moduleId: 'comprobantes_emitidos' },
  { to: '/admin/mi-restaurant', icon: MdStorefront, label: 'Mi Restaurante', roles: ['admin'], moduleId: 'mi_restaurant' },
  { to: '/admin/tiempo-trabajado', icon: MdAccessTime, label: 'Tiempo trabajado', roles: ['admin'], moduleId: 'tiempo_trabajado' },
  { to: '/admin/configuracion', icon: MdSettings, label: 'Configuración', roles: ['admin'], moduleId: 'configuracion' },
];

const cajaSubOptions = [
  { id: 'cobrar', label: 'Cobrar' },
  { id: 'apertura_cierre', label: 'Apertura y cierre' },
  { id: 'cierres_caja', label: 'Cierres de caja' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'egresos', label: 'Egresos' },
  { id: 'notas_credito', label: 'Notas de credito' },
  { id: 'notas_debito', label: 'Notas de debito' },
  { id: 'consulta_precios', label: 'Consulta de precios' },
];

const miRestaurantSubOptions = [
  { id: 'mi_empresa', label: 'Mi empresa' },
  { id: 'facturacion_electronica', label: 'Bot facturación SUNAT' },
  { id: 'series_contingencia', label: 'Series de contingencia' },
  { id: 'pagos_sistema', label: 'Pagos de créditos' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'pago_uso_sistema', label: 'Pago por uso del sistema' },
  { id: 'informacion', label: 'Información' },
];

const almacenSubOptions = [
  { id: 'movimiento_interno', label: 'Movimiento interno' },
  { id: 'requerimiento', label: 'Requerimiento' },
  { id: 'recepcion', label: 'Recepción' },
  { id: 'ir_modulo_gastos', label: 'Ir a módulo de gastos' },
  { id: 'ir_modulo_logistica', label: 'Ir a módulo de logística' },
];
function isPermissionEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export default function Sidebar({ collapsed, isMobile = false, mobileOpen = false, onClose = () => {} }) {
  const { user } = useAuth();
  const location = useLocation();
  const [endShiftOpen, setEndShiftOpen] = useState(false);
  const [attendanceReviewOpen, setAttendanceReviewOpen] = useState(false);

  const onAttendanceReviewComplete = useCallback(() => {
    setAttendanceReviewOpen(false);
    setEndShiftOpen(true);
  }, []);

  const handleFinalizarJornadaClick = async () => {
    if (user?.role !== 'admin') {
      setEndShiftOpen(true);
      return;
    }
    try {
      const data = await api.get('/users/attendance-review/today');
      if (Array.isArray(data?.pending) && data.pending.length > 0) {
        setAttendanceReviewOpen(true);
        return;
      }
    } catch (_) {
      /* si falla la comprobación, permitimos abrir cierre para no bloquear */
    }
    setEndShiftOpen(true);
  };
  const [isCajaExpanded, setIsCajaExpanded] = useState(location.pathname.startsWith('/admin/caja'));
  const [isMiRestaurantExpanded, setIsMiRestaurantExpanded] = useState(location.pathname.startsWith('/admin/mi-restaurant'));
  const [isAlmacenExpanded, setIsAlmacenExpanded] = useState(location.pathname.startsWith('/admin/almacen'));
  const hasLinkPermission = (link) => {
    if (user?.role === 'admin') return true;
    if (Array.isArray(link.roles) && link.roles.length > 0 && !link.roles.includes(user?.role)) return false;
    if (!link.moduleId) return link.roles.includes(user?.role);
    if (!user || typeof user.permissions !== 'object' || user.permissions === null) return false;
    return isPermissionEnabled(user.permissions[link.moduleId]);
  };
  const filtered = allLinks.filter(hasLinkPermission);
  const visibleLinks = user?.role === 'cajero'
    ? [
        filtered.find(l => l.to === '/admin/caja'),
        ...filtered.filter(l => l.to !== '/admin/caja'),
      ].filter(Boolean)
    : filtered;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
      isActive
        ? 'bg-[#3B82F6]/25 text-[#F9FAFB] font-semibold border-l-2 border-[#3B82F6]'
        : 'text-[#F9FAFB] hover:bg-[#3B82F6]/15 hover:text-white'
    }`;

  const isCollapsed = isMobile ? false : collapsed;

  return (
    <aside className={`fixed left-0 top-0 h-full bg-[#1F2937] z-40 transition-all duration-300 flex flex-col border-r border-[#3B82F6]/30 ${
      isMobile
        ? `w-72 max-w-[85vw] transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`
        : (isCollapsed ? 'w-16' : 'w-60')
    }`}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[#3B82F6]/30">
        <div className="w-9 h-9 bg-gradient-to-br from-[#3B82F6] to-[#2563EB] rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
          <MdStorefront className="text-white text-lg" />
        </div>
        {!isCollapsed && <span className="font-bold text-base text-[#F9FAFB] tracking-tight truncate">Resto-FADEY</span>}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {visibleLinks.map(link => (
          <div key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              className={linkClass}
              title={link.label}
              onClick={(e) => {
                if (isCollapsed) return;
                if (link.to === '/admin/caja') {
                  const isInCaja = location.pathname.startsWith('/admin/caja');
                  if (isInCaja) {
                    e.preventDefault();
                    setIsCajaExpanded(prev => !prev);
                    return;
                  }
                  setIsCajaExpanded(true);
                  return;
                }
                if (link.to === '/admin/mi-restaurant') {
                  const isInMiRestaurant = location.pathname.startsWith('/admin/mi-restaurant');
                  if (isInMiRestaurant) {
                    e.preventDefault();
                    setIsMiRestaurantExpanded(prev => !prev);
                    return;
                  }
                  setIsMiRestaurantExpanded(true);
                  return;
                }
                if (link.to === '/admin/almacen') {
                  const isInAlmacen = location.pathname.startsWith('/admin/almacen');
                  if (isInAlmacen) {
                    e.preventDefault();
                    setIsAlmacenExpanded(prev => !prev);
                    return;
                  }
                  setIsAlmacenExpanded(true);
                }
                if (isMobile) onClose();
              }}
            >
              <link.icon className="text-lg flex-shrink-0" />
              {!isCollapsed && <span className="truncate">{link.label}</span>}
            </NavLink>

            {!isCollapsed && link.to === '/admin/caja' && isCajaExpanded && (
              <div className="mt-1 ml-8 space-y-0.5">
                {cajaSubOptions.map(option => (
                  <NavLink
                    key={option.id}
                    to={`/admin/caja?view=${option.id}`}
                    className={({ isActive }) => {
                      const selected = isActive && new URLSearchParams(location.search).get('view') === option.id;
                      return `block px-2 py-1.5 rounded text-sm transition-colors ${
                        selected
                          ? 'bg-[#3B82F6]/25 text-[#F9FAFB] font-medium'
                          : 'text-[#9CA3AF] hover:bg-[#3B82F6]/15 hover:text-[#F9FAFB]'
                      }`;
                    }}
                  >
                    {option.label}
                  </NavLink>
                ))}
              </div>
            )}

            {!isCollapsed && link.to === '/admin/mi-restaurant' && isMiRestaurantExpanded && (
              <div className="mt-1 ml-8 space-y-0.5">
                {miRestaurantSubOptions.map(option => (
                  <NavLink
                    key={option.id}
                    to={`/admin/mi-restaurant?view=${option.id}`}
                    className={({ isActive }) => {
                      const selected = isActive && new URLSearchParams(location.search).get('view') === option.id;
                      return `block px-2 py-1.5 rounded text-sm transition-colors ${
                        selected
                          ? 'bg-[#3B82F6]/25 text-[#F9FAFB] font-medium'
                          : 'text-[#9CA3AF] hover:bg-[#3B82F6]/15 hover:text-[#F9FAFB]'
                      }`;
                    }}
                  >
                    {option.label}
                  </NavLink>
                ))}
              </div>
            )}

            {!isCollapsed && link.to === '/admin/almacen' && isAlmacenExpanded && (
              <div className="mt-1 ml-8 space-y-0.5">
                {almacenSubOptions.map(option => (
                  <NavLink
                    key={option.id}
                    to={`/admin/almacen?view=${option.id}`}
                    className={({ isActive }) => {
                      const selected = isActive && new URLSearchParams(location.search).get('view') === option.id;
                      return `block px-2 py-1.5 rounded text-sm transition-colors ${
                        selected
                          ? 'bg-[#3B82F6]/25 text-[#F9FAFB] font-medium'
                          : 'text-[#9CA3AF] hover:bg-[#3B82F6]/15 hover:text-[#F9FAFB]'
                      }`;
                    }}
                  >
                    <span>{option.label}</span>
                    {option.isNew && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500 text-white">NUEVO</span>}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-2 border-t border-[#3B82F6]/30">
        <button type="button" onClick={() => void handleFinalizarJornadaClick()} className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#F9FAFB] hover:bg-[#3B82F6]/15 hover:text-white w-full transition-colors text-sm" title="Finalizar jornada">
          <MdLogout className="text-lg flex-shrink-0" />
          {!isCollapsed && <span>Finalizar jornada</span>}
        </button>
      </div>
      <AdminAttendanceReviewModal
        isOpen={attendanceReviewOpen}
        onClose={() => setAttendanceReviewOpen(false)}
        onComplete={onAttendanceReviewComplete}
      />
      <EndShiftModal isOpen={endShiftOpen} onClose={() => setEndShiftOpen(false)} />
    </aside>
  );
}
