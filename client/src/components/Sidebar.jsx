import { useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { ADMIN_MODULE_PATHS, hasModulePermission } from '../utils/staffModuleAccess';
import EndShiftModal from './EndShiftModal';
import AdminAttendanceReviewModal from './AdminAttendanceReviewModal';
import {
  MdDashboard, MdAttachMoney, MdPointOfSale, MdEventSeat,
  MdCreditCard, MdPeopleAlt, MdRestaurantMenu, MdLocalOffer,
  MdDiscount, MdWarehouse, MdDeliveryDining, MdAssessment,
  MdInsights, MdStorefront, MdSettings, MdLogout, MdTableBar, MdAccessTime, MdKitchen, MdLocalBar, MdQrCode2,
} from 'react-icons/md';

/** Icono y texto por módulo; rutas y roles salen de `ADMIN_MODULE_PATHS` para no desincronizar con App.jsx. */
const SIDEBAR_LINK_META = {
  escritorio: { icon: MdDashboard, label: 'Escritorio', end: true },
  caja: { icon: MdPointOfSale, label: 'Caja' },
  mesas: { icon: MdTableBar, label: 'Mesas' },
  cocina: { icon: MdKitchen, label: 'Cocina' },
  bar: { icon: MdLocalBar, label: 'Bar' },
  delivery: { icon: MdDeliveryDining, label: 'Delivery' },
  reservas: { icon: MdEventSeat, label: 'Reservas' },
  auto_pedido: { icon: MdQrCode2, label: 'Auto pedido (QR)' },
  clientes: { icon: MdPeopleAlt, label: 'Clientes' },
  creditos: { icon: MdCreditCard, label: 'Créditos' },
  ofertas: { icon: MdLocalOffer, label: 'Ofertas' },
  descuentos: { icon: MdDiscount, label: 'Descuentos' },
  almacen: { icon: MdWarehouse, label: 'Almacenes e Inventario' },
  productos: { icon: MdRestaurantMenu, label: 'Productos' },
  informes: { icon: MdAssessment, label: 'Informes' },
  ventas: { icon: MdAttachMoney, label: 'Ventas' },
  indicadores: { icon: MdInsights, label: 'Indicadores' },
  mi_restaurant: { icon: MdStorefront, label: 'Mi Restaurante' },
  tiempo_trabajado: { icon: MdAccessTime, label: 'Tiempo trabajado' },
  configuracion: { icon: MdSettings, label: 'Configuración' },
};

const allLinks = ADMIN_MODULE_PATHS.map((row) => {
  const meta = SIDEBAR_LINK_META[row.moduleId];
  if (!meta) return null;
  const { icon, label, end } = meta;
  return {
    to: row.path,
    icon,
    label,
    end: Boolean(end),
    roles: row.roles,
    moduleId: row.moduleId,
  };
}).filter(Boolean);

if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
  ADMIN_MODULE_PATHS.forEach((row) => {
    if (!SIDEBAR_LINK_META[row.moduleId]) {
      console.warn(
        `[Sidebar] Falta SIDEBAR_LINK_META para moduleId="${row.moduleId}" (añada icono y etiqueta en Sidebar.jsx).`
      );
    }
  });
}

const cajaSubOptionsAll = [
  { id: 'cobrar', label: 'Cobrar' },
  { id: 'apertura_cierre', label: 'Apertura y cierre' },
  { id: 'cierres_caja', label: 'Cierres de caja' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'egresos', label: 'Egresos' },
  { id: 'notas_credito', label: 'Notas de credito' },
  { id: 'notas_debito', label: 'Notas de debito' },
  { id: 'consulta_precios', label: 'Consulta de precios' },
];

const miRestaurantSubOptionsAll = [
  { id: 'mi_empresa', label: 'Mi empresa' },
  { id: 'facturacion_electronica', label: 'Facturación electrónica' },
  { id: 'pagos_sistema', label: 'Pagos de créditos' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'pago_uso_sistema', label: 'Pago por uso del sistema' },
  { id: 'informacion', label: 'Información' },
];

const almacenSubOptionsAll = [
  { id: 'movimiento_interno', label: 'Movimiento interno' },
  { id: 'ir_modulo_logistica', label: 'Inventario y kardex' },
  { id: 'requerimiento', label: 'Requerimiento' },
  { id: 'recepcion', label: 'Recepción' },
  { id: 'ir_modulo_gastos', label: 'Ir a módulo de gastos' },
];
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
    /** Maestro: solo entra a Mi restaurante desde /admin (resto del panel sigue en /master). */
    if (user?.role === 'master_admin') {
      return link.to === '/admin/mi-restaurant';
    }
    if (Array.isArray(link.roles) && link.roles.length > 0 && !link.roles.includes(user?.role)) return false;
    if (!link.moduleId) return link.roles.includes(user?.role);
    return hasModulePermission(user, link.moduleId);
  };
  const filtered = allLinks.filter(hasLinkPermission);
  const planAllowsAlmacenAvanzado = user?.service_plan !== 'basico';
  const subAlmacen = user?.sub_permissions?.almacen || {};
  const almacenSubOptions = almacenSubOptionsAll.filter((o) => {
    if (!planAllowsAlmacenAvanzado && ['requerimiento', 'recepcion'].includes(o.id)) return false;
    if (subAlmacen[o.id] === false) return false;
    return true;
  });
  const planProfesional = user?.service_plan === 'profesional';
  const subMi = user?.sub_permissions?.mi_restaurant || {};
  const miRestaurantSubOptionsByPlan = miRestaurantSubOptionsAll.filter((o) => {
    if (!planProfesional && o.id === 'facturacion_electronica') return false;
    if (subMi[o.id] === false) return false;
    return true;
  });
  /** Respaldo/restauración: solo administrador maestro (API también exige rol). */
  const miRestaurantSubOptions =
    user?.role === 'master_admin'
      ? miRestaurantSubOptionsByPlan
      : miRestaurantSubOptionsByPlan.filter((o) => o.id !== 'informacion');
  const subCaja = user?.sub_permissions?.caja || {};
  const cajaSubOptions = cajaSubOptionsAll.filter((o) => {
    if (subCaja[o.id] === false) return false;
    if (String(user?.role || '').toLowerCase() === 'cajero' && (o.id === 'apertura_cierre' || o.id === 'cierres_caja')) {
      return false;
    }
    return true;
  });
  const visibleLinks = user?.role === 'cajero'
    ? [
        filtered.find(l => l.to === '/admin/caja'),
        ...filtered.filter(l => l.to !== '/admin/caja'),
      ].filter(Boolean)
    : filtered;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
      isActive
        ? 'bg-[var(--ui-sidebar-active-bg)] text-[var(--ui-body-text)] font-semibold border-l-2 border-[var(--ui-accent-muted)]'
        : 'text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)] hover:opacity-95'
    }`;

  const isCollapsed = isMobile ? false : collapsed;

  return (
    <aside className={`fixed left-0 top-0 h-full bg-[var(--ui-surface)] z-40 transition-all duration-300 flex flex-col border-r border-[color:var(--ui-sidebar-border)] ${
      isMobile
        ? `w-72 max-w-[85vw] transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`
        : (isCollapsed ? 'w-16' : 'w-60')
    }`}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[color:var(--ui-sidebar-border)]">
        <div className="w-9 h-9 bg-gradient-to-br from-[var(--ui-logo-from)] to-[var(--ui-logo-to)] rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
          <MdStorefront className="text-white text-lg" />
        </div>
        {!isCollapsed && <span className="font-bold text-base text-[var(--ui-body-text)] tracking-tight truncate">Resto-FADEY</span>}
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
                          ? 'bg-[var(--ui-sidebar-active-bg)] text-[var(--ui-body-text)] font-medium'
                          : 'text-[var(--ui-muted)] hover:bg-[var(--ui-sidebar-hover)] hover:text-[var(--ui-body-text)]'
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
                          ? 'bg-[var(--ui-sidebar-active-bg)] text-[var(--ui-body-text)] font-medium'
                          : 'text-[var(--ui-muted)] hover:bg-[var(--ui-sidebar-hover)] hover:text-[var(--ui-body-text)]'
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
                          ? 'bg-[var(--ui-sidebar-active-bg)] text-[var(--ui-body-text)] font-medium'
                          : 'text-[var(--ui-muted)] hover:bg-[var(--ui-sidebar-hover)] hover:text-[var(--ui-body-text)]'
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

      <div className="p-2 border-t border-[color:var(--ui-sidebar-border)]">
        <button type="button" onClick={() => void handleFinalizarJornadaClick()} className="flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--ui-body-text)] hover:bg-[var(--ui-sidebar-hover)] w-full transition-colors text-sm" title="Finalizar jornada">
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
