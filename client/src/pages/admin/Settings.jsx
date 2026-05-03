import { useState, useEffect, useRef, useMemo } from 'react';
import { api, formatDateTime } from '../../utils/api';
import { shouldSendToNetworkPrinter, shouldTryServerNetworkPrint } from '../../utils/networkPrinter';
import { postLocalAgentPrint, isLocalPrintAgentConfigured } from '../../utils/localPrintAgent';
import { printHtmlDocument } from '../../utils/printHtml';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import toast from 'react-hot-toast';
import {
  MdPeople, MdAdd, MdEdit, MdDelete, MdPerson,
  MdAdminPanelSettings, MdPointOfSale, MdRoomService,
  MdKitchen, MdLocalBar,
  MdVisibility, MdVisibilityOff, MdSettings, MdStore,
  MdSave, MdSchedule, MdAttachMoney, MdLanguage,
  MdStorefront, MdWarehouse, MdTableRestaurant,
  MdReceipt, MdPrint, MdPercent, MdCreditCard,
  MdAccessTime, MdMonetizationOn, MdAccountBalanceWallet,
  MdBrandingWatermark, MdImage, MdBlockFlipped, MdPayment,
  MdChevronRight, MdArrowBack, MdInventory, MdSwapHoriz,
  MdLabel, MdDoNotDisturb, MdCategory, MdHistory,
  MdSecurity, MdDashboard, MdEventSeat, MdDeliveryDining, MdPhotoCamera,
  MdAssessment, MdInsights, MdLocalOffer, MdDiscount,
  MdTableBar, MdPeopleAlt, MdRestaurantMenu, MdQrCode2, MdPalette,
  MdPlayArrow,
} from 'react-icons/md';
import { UI_THEME_OPTIONS, applyUiTheme, getValidUiThemeId } from '../../theme/uiTheme';

const ALL_MODULES = [
  { id: 'escritorio', label: 'Escritorio', icon: MdDashboard, defaultRoles: ['admin', 'cajero'] },
  { id: 'ventas', label: 'Ventas', icon: MdAttachMoney, defaultRoles: ['admin', 'cajero'] },
  { id: 'caja', label: 'Caja', icon: MdPointOfSale, defaultRoles: ['admin', 'cajero'] },
  { id: 'mesas', label: 'Mesas', icon: MdTableBar, defaultRoles: ['admin', 'mozo'] },
  { id: 'cocina', label: 'Cocina', icon: MdKitchen, defaultRoles: ['admin', 'cocina'] },
  { id: 'bar', label: 'Bar', icon: MdLocalBar, defaultRoles: ['admin', 'bar'] },
  { id: 'reservas', label: 'Reservas', icon: MdEventSeat, defaultRoles: ['admin', 'cajero', 'mozo'] },
  { id: 'auto_pedido', label: 'Auto pedido QR', icon: MdQrCode2, defaultRoles: ['admin', 'mozo'] },
  { id: 'creditos', label: 'Créditos', icon: MdCreditCard, defaultRoles: ['admin', 'cajero'] },
  { id: 'clientes', label: 'Clientes', icon: MdPeopleAlt, defaultRoles: ['admin', 'cajero'] },
  { id: 'productos', label: 'Productos', icon: MdRestaurantMenu, defaultRoles: ['admin'] },
  { id: 'ofertas', label: 'Ofertas', icon: MdLocalOffer, defaultRoles: ['admin'] },
  { id: 'descuentos', label: 'Descuentos', icon: MdDiscount, defaultRoles: ['admin'] },
  { id: 'almacen', label: 'Almacén', icon: MdWarehouse, defaultRoles: ['admin'] },
  { id: 'delivery', label: 'Delivery', icon: MdDeliveryDining, defaultRoles: ['admin', 'cajero', 'mozo'] },
  { id: 'informes', label: 'Informes', icon: MdAssessment, defaultRoles: ['admin', 'cajero'] },
  { id: 'indicadores', label: 'Indicadores', icon: MdInsights, defaultRoles: ['admin'] },
  { id: 'mi_restaurant', label: 'Mi Restaurante', icon: MdStorefront, defaultRoles: ['admin'] },
  { id: 'tiempo_trabajado', label: 'Tiempo trabajado', icon: MdAccessTime, defaultRoles: ['admin'] },
  { id: 'configuracion', label: 'Configuración', icon: MdSettings, defaultRoles: ['admin'] },
];

const ROLES = {
  admin: { label: 'Administrador', icon: MdAdminPanelSettings, color: 'bg-sky-100 text-sky-700', desc: 'Acceso completo al sistema' },
  cajero: { label: 'Cajero', icon: MdPointOfSale, color: 'bg-sky-100 text-sky-700', desc: 'Caja, cobros e informes' },
  mozo: { label: 'Mozo', icon: MdRoomService, color: 'bg-emerald-100 text-emerald-700', desc: 'Mesas y pedidos' },
  cocina: { label: 'Cocina', icon: MdKitchen, color: 'bg-amber-100 text-amber-700', desc: 'Preparación de cocina' },
  bar: { label: 'Bar', icon: MdLocalBar, color: 'bg-indigo-100 text-indigo-700', desc: 'Preparación de bebidas y barra' },
  delivery: { label: 'Delivery', icon: MdDeliveryDining, color: 'bg-emerald-100 text-emerald-700', desc: 'Reparto y entregas' },
};

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DAY_NAMES = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };

const MENU_ITEMS = [
  { id: 'regional', label: 'Configuración regional', icon: MdLanguage },
  { id: 'locales', label: 'Locales', icon: MdStorefront },
  { id: 'users', label: 'Usuarios', icon: MdPeople },
  { id: 'almacenes', label: 'Almacenes y Producción', icon: MdWarehouse },
  { id: 'salones', label: 'Salones y Mesas', icon: MdTableRestaurant },
  { id: 'cajas', label: 'Cajas', icon: MdPointOfSale },
  { id: 'comprobantes', label: 'Comprobantes', icon: MdReceipt },
  { id: 'impresoras', label: 'Impresoras', icon: MdPrint },
  { id: 'impuestos', label: 'Impuestos', icon: MdPercent },
  { id: 'tarjetas', label: 'Tarjetas', icon: MdCreditCard },
  { id: 'turnos', label: 'Turnos', icon: MdAccessTime },
  { id: 'jornada_laboral', label: 'Jornada y asistencia', icon: MdPhotoCamera },
  { id: 'monedas', label: 'Monedas', icon: MdMonetizationOn },
  { id: 'moneda_facturacion', label: 'Moneda de facturación', icon: MdAttachMoney },
  { id: 'cuentas_transferencia', label: 'Cuentas de transferencia', icon: MdSwapHoriz },
  { id: 'marcas', label: 'Gestión de marcas', icon: MdLabel },
  { id: 'categoria_anular', label: 'Categoría Anular Venta', icon: MdDoNotDisturb },
  { id: 'formas_pago', label: 'Formas de pago', icon: MdPayment },
  { id: 'apariencia', label: 'Apariencia', icon: MdPalette },
  { id: 'config_historial', label: 'Historial de configuración', icon: MdHistory },
];
const PARTIAL_SECTIONS = new Set([
  'regional', 'locales', 'almacenes', 'cajas', 'comprobantes', 'impresoras',
  'tarjetas', 'monedas', 'cuentas_transferencia', 'marcas',
  'categoria_anular', 'formas_pago', 'apariencia',
]);
/** Claves para filtrar el historial (incluye legado imagenes_self). */
const HISTORY_FILTER_SECTIONS = [...PARTIAL_SECTIONS, 'imagenes_self'];
const REQUIRED_ACTIVE_SECTIONS = new Set(['comprobantes', 'formas_pago']);

const DEFAULT_APP_SETTINGS = {
  regional: { country: 'Peru', timezone: 'America/Lima', language: 'es', date_format: 'DD/MM/YYYY' },
  locales: [{ name: 'Principal', address: '', phone: '', active: 1 }],
  almacenes: [{ name: 'Almacén Principal', description: 'Almacén general de insumos', active: 1 }],
  cajas: [{
    id: 'b0b0b0b0-b0b0-4000-b0b0-b0b0b0b0b001',
    name: 'Caja Principal',
    description: 'Caja #1 - Recepción',
    active: 1,
  }],
  comprobantes: [
    { name: 'Boleta de Venta', series: 'B001', active: 1 },
    { name: 'Factura', series: 'F001', active: 1 },
    { name: 'Nota de Venta', series: 'N001', active: 1 },
  ],
  impresoras: [
    { name: 'Impresora Cocina', area: 'Comandas', station: 'cocina', connection: 'browser', printer_type: 'browser', ip_address: '', port: 9100, width_mm: 80, copies: 1, active: 1, auto_print: 1, local_printer_name: '' },
    { name: 'Impresora Bar', area: 'Comandas Bar', station: 'bar', connection: 'browser', printer_type: 'browser', ip_address: '', port: 9100, width_mm: 80, copies: 1, active: 1, auto_print: 1, local_printer_name: '' },
    { name: 'Impresora Caja', area: 'Comprobantes', station: 'caja', connection: 'browser', printer_type: 'browser', ip_address: '', port: 9100, width_mm: 80, copies: 1, active: 1, auto_print: 1, local_printer_name: '' },
  ],
  /** Agente ESC/POS en el PC del local (ver carpeta local-print-agent). */
  print_agent: {
    enabled: 1,
    base_url: 'http://127.0.0.1:49710',
  },
  tarjetas: [
    { name: 'Visa', fee_percent: 2.5, active: 1 },
    { name: 'Mastercard', fee_percent: 3, active: 1 },
  ],
  monedas: [
    { code: 'PEN', name: 'Sol Peruano', symbol: 'S/', active: 1 },
    { code: 'USD', name: 'Dólar Americano', symbol: '$', active: 0 },
  ],
  cuentas_transferencia: [],
  marcas: [],
  imagenes_self: [],
  categoria_anular: ['Error en el pedido', 'Cliente se retiró'],
  formas_pago: [
    { name: 'Efectivo', desc: 'Pago en efectivo', active: 1 },
    { name: 'Yape', desc: 'Pago móvil BCP', active: 0 },
    { name: 'Plin', desc: 'Pago móvil Interbank', active: 0 },
    { name: 'Tarjeta', desc: 'Visa, Mastercard, etc.', active: 1 },
  ],
  impuestos: {
    name: 'IGV',
    rate: 18,
    included_in_price: 1,
  },
  jornada_laboral: {
    requiere_foto_inicio_sesion: 0,
    requiere_foto_fin_jornada: 0,
    requiere_foto_asistencia: 0,
  },
  /** Tema visual del panel: light | dark | blue | gray | purple | green */
  ui_theme: 'blue',
};

/** Alineado con server/routes/auth readJornadaLaboralFlags (legacy requiere_foto_asistencia). */
function getJornadaLaboralToggles(jl) {
  const o = jl && typeof jl === 'object' ? jl : {};
  const legacy = Number(o.requiere_foto_asistencia) === 1;
  const inicio = Object.prototype.hasOwnProperty.call(o, 'requiere_foto_inicio_sesion')
    ? Number(o.requiere_foto_inicio_sesion) === 1
    : legacy;
  const fin = Object.prototype.hasOwnProperty.call(o, 'requiere_foto_fin_jornada')
    ? Number(o.requiere_foto_fin_jornada) === 1
    : legacy;
  return { inicio, fin };
}

const SETTINGS_SECTION_FORMS = {
  locales: {
    title: 'Local',
    fields: [
      { key: 'name', label: 'Nombre', required: true },
      { key: 'address', label: 'Dirección' },
      { key: 'phone', label: 'Teléfono' },
    ],
  },
  almacenes: {
    title: 'Almacén',
    fields: [
      { key: 'name', label: 'Nombre', required: true },
      { key: 'description', label: 'Descripción' },
    ],
  },
  cajas: {
    title: 'Caja',
    fields: [
      { key: 'name', label: 'Nombre', required: true },
      { key: 'description', label: 'Descripción' },
    ],
  },
  comprobantes: {
    title: 'Comprobante',
    fields: [
      { key: 'name', label: 'Nombre', required: true },
      { key: 'series', label: 'Serie', required: true },
    ],
  },
  impresoras: {
    title: 'Impresora',
    fields: [
      { key: 'name', label: 'Nombre', required: true },
      {
        key: 'station',
        label: 'Área / estación',
        required: true,
        type: 'select',
        options: [
          { value: 'cocina', label: 'Cocina' },
          { value: 'bar', label: 'Bar' },
          { value: 'caja', label: 'Caja (POS / comprobantes)' },
          { value: 'delivery', label: 'Delivery' },
          { value: 'parrilla', label: 'Parrilla' },
        ],
      },
      { key: 'area', label: 'Texto en ticket (área)', required: true },
      {
        key: 'printer_type',
        label: 'Tipo de conexión',
        required: true,
        type: 'select',
        options: [
          { value: 'browser', label: 'Navegador (diálogo de impresión)' },
          { value: 'lan', label: 'Red local (IP, puerto 9100)' },
          { value: 'usb', label: 'USB (requiere agente en el PC)' },
          { value: 'bluetooth', label: 'Bluetooth (requiere agente en el PC)' },
        ],
      },
      {
        key: 'auto_print',
        label: 'Auto-impresión',
        required: true,
        type: 'select',
        options: [
          { value: '1', label: 'Sí (cocina/bar al recibir pedido)' },
          { value: '0', label: 'No' },
        ],
      },
      { key: 'local_printer_name', label: 'Nombre en Windows (solo si usa USB)' },
      { key: 'ip_address', label: 'IP de la impresora (solo modo red)' },
      { key: 'port', label: 'Puerto TCP', type: 'number' },
      { key: 'width_mm', label: 'Ancho ticket (mm)', type: 'number' },
      { key: 'copies', label: 'Copias', type: 'number' },
    ],
  },
  tarjetas: {
    title: 'Tarjeta',
    fields: [
      { key: 'name', label: 'Nombre', required: true },
      { key: 'fee_percent', label: 'Comisión (%)', type: 'number' },
    ],
  },
  monedas: {
    title: 'Moneda',
    fields: [
      { key: 'code', label: 'Código', required: true },
      { key: 'name', label: 'Nombre', required: true },
      { key: 'symbol', label: 'Símbolo', required: true },
    ],
  },
  cuentas_transferencia: {
    title: 'Cuenta de transferencia',
    fields: [
      { key: 'bank', label: 'Banco', required: true },
      { key: 'account', label: 'Nro. cuenta', required: true },
      { key: 'type', label: 'Tipo de cuenta' },
    ],
  },
  marcas: {
    title: 'Marca',
    fields: [
      { key: 'name', label: 'Nombre', required: true },
    ],
  },
  formas_pago: {
    title: 'Forma de pago',
    fields: [
      { key: 'name', label: 'Nombre', required: true },
      { key: 'desc', label: 'Descripción' },
    ],
  },
  categoria_anular: {
    title: 'Motivo de anulación',
    fields: [
      { key: 'value', label: 'Motivo', required: true },
    ],
  },
};
function newLocalCajaId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `caja_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureCajaIdsDeep(cajas) {
  if (!Array.isArray(cajas)) return [];
  return cajas.map((c) => {
    const id = String(c?.id || '').trim();
    if (id) return { ...c };
    return { ...c, id: newLocalCajaId() };
  });
}

const EMPTY_USER_FORM = {
  username: '', email: '', password: '', full_name: '', role: 'mozo', phone: '', is_active: 1, caja_station_id: '',
};

/** WhatsApp proveedor: nuevas sucursales/locales son contratación aparte. */
const WHATSAPP_PROVEEDOR_LOCALES =
  'https://wa.me/51935968198?text=' + encodeURIComponent(
    'Hola, solicito información para agregar una sucursal o local adicional a mi sistema.'
  );

export default function Settings() {
  const [activeSection, setActiveSection] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [restaurant, setRestaurant] = useState(null);
  const [appSettings, setAppSettings] = useState(DEFAULT_APP_SETTINGS);
  const [appSettingsSnapshot, setAppSettingsSnapshot] = useState(JSON.stringify(DEFAULT_APP_SETTINGS));
  const [isSavingAppSettings, setIsSavingAppSettings] = useState(false);
  const [settingsHistory, setSettingsHistory] = useState([]);
  const [settingsHistoryLoading, setSettingsHistoryLoading] = useState(false);
  const [isRollingBackSettings, setIsRollingBackSettings] = useState(false);
  const [historyFilterSection, setHistoryFilterSection] = useState('all');
  const [historyFilterActor, setHistoryFilterActor] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historySearchDebounced, setHistorySearchDebounced] = useState('');
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(8);
  const [historyPreview, setHistoryPreview] = useState(null);
  const [settingsCrudModal, setSettingsCrudModal] = useState({ isOpen: false, section: '', index: null });
  const [settingsCrudForm, setSettingsCrudForm] = useState({});
  const [attendanceGalleryUserId, setAttendanceGalleryUserId] = useState('');
  const [attendanceGallerySessions, setAttendanceGallerySessions] = useState([]);
  const [attendanceGalleryLoading, setAttendanceGalleryLoading] = useState(false);
  const [attendanceGalleryDraft, setAttendanceGalleryDraft] = useState({});
  const [attendanceGallerySaving, setAttendanceGallerySaving] = useState(false);
  const { user: currentUser } = useAuth();
  const autoSaveTimerRef = useRef(null);
  const historySearchTimerRef = useRef(null);
  const serializeAppSettings = (value) => JSON.stringify(value || {});
  const normalizeConfigPayload = (payload) => {
    const merged = { ...DEFAULT_APP_SETTINGS, ...((payload && payload.settings) || payload || {}) };
    merged.cajas = ensureCajaIdsDeep(Array.isArray(merged.cajas) ? merged.cajas : []);
    const pa = merged.print_agent && typeof merged.print_agent === 'object' ? merged.print_agent : {};
    merged.print_agent = {
      ...pa,
      enabled: 1,
      base_url: String(pa.base_url || DEFAULT_APP_SETTINGS.print_agent.base_url || 'http://127.0.0.1:49710').trim()
        || DEFAULT_APP_SETTINGS.print_agent.base_url,
    };
    return merged;
  };
  const hasUnsavedAppSettings = serializeAppSettings(appSettings) !== appSettingsSnapshot;

  const loadUsers = () => {
    api.get('/users').then(data => {
      setUsers(data.filter(u => ['admin', 'cajero', 'mozo', 'cocina', 'bar', 'delivery'].includes(u.role)));
    }).catch(console.error).finally(() => setLoading(false));
  };

  const loadRestaurant = () => {
    api.get('/restaurant').then(data => {
      if (!data.schedule || typeof data.schedule !== 'object') data.schedule = {};
      DAYS.forEach(d => {
        if (!data.schedule[d]) data.schedule[d] = { open: '11:00', close: '23:00', enabled: true };
      });
      setRestaurant(data);
    }).catch(console.error);
  };

  const loadAppSettings = () => {
    api.get('/admin-modules/config/app')
      .then(cfg => {
        const normalized = normalizeConfigPayload(cfg);
        setAppSettings(normalized);
        setAppSettingsSnapshot(serializeAppSettings(normalized));
        applyUiTheme(normalized.ui_theme);
      })
      .catch(() => {
        setAppSettings(DEFAULT_APP_SETTINGS);
        setAppSettingsSnapshot(serializeAppSettings(DEFAULT_APP_SETTINGS));
        applyUiTheme(DEFAULT_APP_SETTINGS.ui_theme);
      });
  };
  const loadAppSettingsHistory = () => {
    setSettingsHistoryLoading(true);
    const params = [
      `limit=${historyLimit}`,
      `offset=${historyOffset}`,
      `section=${encodeURIComponent(historyFilterSection)}`,
      `actor=${encodeURIComponent(historyFilterActor)}`,
      `q=${encodeURIComponent(historySearchDebounced)}`,
    ].join('&');
    api.get(`/admin-modules/config/app/history?${params}`)
      .then(data => {
        const items = Array.isArray(data?.items) ? data.items : [];
        setSettingsHistory(items);
        setHistoryTotal(Number(data?.total || 0));
      })
      .catch(() => {
        setSettingsHistory([]);
        setHistoryTotal(0);
      })
      .finally(() => setSettingsHistoryLoading(false));
  };

  useEffect(() => { loadUsers(); loadRestaurant(); loadAppSettings(); }, []);

  useEffect(() => {
    if (!attendanceGalleryUserId) {
      setAttendanceGallerySessions([]);
      return;
    }
    setAttendanceGalleryLoading(true);
    api
      .get(`/users/attendance-gallery/${encodeURIComponent(attendanceGalleryUserId)}`)
      .then((data) => setAttendanceGallerySessions(Array.isArray(data?.sessions) ? data.sessions : []))
      .catch(() => {
        setAttendanceGallerySessions([]);
        toast.error('No se pudo cargar las fotos de asistencia');
      })
      .finally(() => setAttendanceGalleryLoading(false));
  }, [attendanceGalleryUserId]);

  useEffect(() => {
    const d = {};
    (attendanceGallerySessions || []).forEach((r) => {
      const st = r.attendance_status || 'pending';
      d[r.id] = st === 'pending' ? 'asistente' : st;
    });
    setAttendanceGalleryDraft(d);
  }, [attendanceGallerySessions]);

  const saveGalleryAttendance = async () => {
    if (!attendanceGallerySessions.length) return;
    setAttendanceGallerySaving(true);
    try {
      const items = attendanceGallerySessions.map((r) => ({
        session_id: r.id,
        status: attendanceGalleryDraft[r.id] || 'asistente',
      }));
      await api.post('/users/attendance-review/apply', { items });
      toast.success('Estados de asistencia guardados');
      const data = await api.get(`/users/attendance-gallery/${encodeURIComponent(attendanceGalleryUserId)}`);
      setAttendanceGallerySessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAttendanceGallerySaving(false);
    }
  };

  useEffect(() => {
    if (activeSection !== 'config_historial') return;
    loadAppSettingsHistory();
  }, [activeSection, historyOffset, historyFilterSection, historyFilterActor, historySearchDebounced, historyLimit]);
  useEffect(() => {
    if (historySearchTimerRef.current) clearTimeout(historySearchTimerRef.current);
    historySearchTimerRef.current = setTimeout(() => {
      setHistoryOffset(0);
      setHistorySearchDebounced(historySearch);
    }, 300);
    return () => {
      if (historySearchTimerRef.current) clearTimeout(historySearchTimerRef.current);
    };
  }, [historySearch]);
  useEffect(() => {
    if (!activeSection || !PARTIAL_SECTIONS.has(activeSection)) return;
    if (!hasUnsavedAppSettings || settingsCrudModal.isOpen) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveAppSettings({ silent: true, nextSettings: appSettings });
    }, 900);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [activeSection, appSettings, hasUnsavedAppSettings, settingsCrudModal.isOpen]);

  useEffect(() => () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (historySearchTimerRef.current) clearTimeout(historySearchTimerRef.current);
  }, []);

  const openNewUser = () => {
    setEditUser(null);
    setForm(EMPTY_USER_FORM);
    setShowPw(false);
    setShowModal(true);
  };

  const openEditUser = (u) => {
    setEditUser(u);
    setForm({
      username: u.username || '',
      email: u.email || '',
      password: '',
      full_name: u.full_name || '',
      role: u.role || 'mozo',
      phone: u.phone || '',
      is_active: Number(u.is_active || 0) === 1 ? 1 : 0,
      caja_station_id: String(u.caja_station_id || '').trim(),
    });
    setShowPw(false);
    setShowModal(true);
  };

  const closeUserModal = () => {
    setShowModal(false);
    setEditUser(null);
    setShowPw(false);
    setForm(EMPTY_USER_FORM);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        username: String(form.username || '').trim(),
        email: String(form.email || '').trim(),
        full_name: String(form.full_name || '').trim(),
        role: String(form.role || '').trim(),
        phone: String(form.phone || '').trim(),
        is_active: Number(form.is_active || 0) === 1 ? 1 : 0,
        caja_station_id:
          String(form.role || '').toLowerCase() === 'cajero' ? String(form.caja_station_id || '').trim() : '',
      };
      if (!payload.password) delete payload.password;
      if (editUser) {
        await api.put(`/users/${editUser.id}`, payload);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/users', payload);
        toast.success('Usuario creado');
      }
      closeUserModal();
      loadUsers();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (u) => {
    if (u.id === currentUser?.id) return toast.error('No puedes eliminarte a ti mismo');
    if (!confirm(`¿Eliminar usuario "${u.full_name}"?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success('Usuario eliminado');
      loadUsers();
    } catch (err) { toast.error(err.message); }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
      toast.success(u.is_active ? 'Usuario desactivado' : 'Usuario activado');
      loadUsers();
    } catch (err) { toast.error(err.message); }
  };

  const saveRestaurant = async () => {
    try {
      await api.put('/restaurant', restaurant);
      toast.success('Configuración guardada');
    } catch (err) { toast.error(err.message); }
  };
  const saveTaxSettings = async () => {
    try {
      const rate = Number(appSettings.impuestos?.rate ?? restaurant?.tax_rate ?? 18);
      await api.put('/restaurant', { ...restaurant, tax_rate: Number.isNaN(rate) ? 18 : rate });
      await saveAppSettings({ silent: true });
      toast.success('Configuración de impuestos guardada');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const testPrinterFromSettings = async (pr) => {
    const name = String(pr?.name || 'Impresora').trim() || 'Impresora';
    const ip = String(pr?.ip_address || '').trim();
    const nowPe = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const plainTestBody = [
      '*** PRUEBA DE IMPRESION ***',
      name,
      nowPe,
      'Si lee esto, la conexion',
      'TCP/RAW a la impresora OK.',
      '',
    ].join('\n');

    if (shouldTryServerNetworkPrint(pr)) {
      try {
        await api.post('/orders/print-test', {
          ip_address: ip,
          port: Number(pr.port || 9100),
          copies: Math.min(5, Math.max(1, Number(pr.copies || 1))),
          name,
        });
        toast.success(`Prueba enviada a «${name}»`);
      } catch (err) {
        toast.error(err.message || 'No se pudo enviar la prueba');
      }
      return;
    }

    /** API en la nube no alcanza 192.168.x: mismo camino que cocina/POS vía agente en el PC del local. */
    if (shouldSendToNetworkPrinter(pr) && isLocalPrintAgentConfigured(appSettings.print_agent)) {
      const baseUrl = String(appSettings.print_agent?.base_url || 'http://127.0.0.1:49710').trim();
      try {
        await postLocalAgentPrint(baseUrl, {
          ip_address: ip,
          port: Number(pr.port || 9100),
          copies: Math.min(5, Math.max(1, Number(pr.copies || 1))),
          text: plainTestBody,
        });
        toast.success(`Prueba enviada por el programa local a «${name}»`);
      } catch (err) {
        toast.error(
          err?.message || 'No se pudo enviar la prueba al programa local. ¿Está en ejecución en este equipo?'
        );
      }
      return;
    }

    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const t = nowPe;
    const hint =
      shouldSendToNetworkPrinter(pr) && !shouldTryServerNetworkPrint(pr)
        ? '<p style="margin:12px 0 0;color:#b45309">La API está en internet: no puede enviar sola a la IP de su red. Active abajo «Programa de impresión en este equipo» y pulse de nuevo Probar, o use Ctrl+P y elija su térmica.</p>'
        : '';
    const testHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Prueba ${esc(name)}</title>
      <style>body{font-family:system-ui,sans-serif;padding:16px;font-size:14px}</style></head><body>
      <h2 style="margin:0 0 8px">Prueba de impresión</h2>
      <p style="margin:0 0 4px"><strong>${esc(name)}</strong></p>
      <p style="margin:0 0 12px;color:#64748b">${esc(t)}</p>
      <p>Modo <strong>navegador</strong>: use el cuadro de impresión (Ctrl+P) y elija su impresora térmica.</p>
      ${hint}
      </body></html>`;
    if (!printHtmlDocument(testHtml, `Prueba ${name}`)) {
      toast.error('No se pudo abrir la prueba de impresión');
    }
  };

  const saveAppSettings = async ({ silent = false, nextSettings = null } = {}) => {
    if (isSavingAppSettings) return;
    const payloadSettings = normalizeConfigPayload({ settings: nextSettings || appSettings });
    try {
      setIsSavingAppSettings(true);
      const saved = await api.put('/admin-modules/config/app', { settings: payloadSettings });
      const normalized = normalizeConfigPayload(saved);
      setAppSettings(normalized);
      setAppSettingsSnapshot(serializeAppSettings(normalized));
      applyUiTheme(normalized.ui_theme);
      if (activeSection === 'config_historial') loadAppSettingsHistory();
      if (!silent) toast.success('Configuración guardada');
    } catch (err) {
      if (!silent) toast.error(err.message);
    } finally {
      setIsSavingAppSettings(false);
    }
  };

  const updateR = (field, value) => setRestaurant(prev => ({ ...prev, [field]: value }));
  const updateSchedule = (day, field, value) => setRestaurant(prev => ({
    ...prev, schedule: { ...prev.schedule, [day]: { ...prev.schedule[day], [field]: value } }
  }));
  const updateAppSection = (section, index, patch) => {
    setAppSettings(prev => {
      const list = Array.isArray(prev[section]) ? [...prev[section]] : [];
      list[index] = { ...(list[index] || {}), ...patch };
      return { ...prev, [section]: list };
    });
  };
  const toggleAppSection = (section, index, field = 'active') => {
    setAppSettings(prev => {
      const list = Array.isArray(prev[section]) ? [...prev[section]] : [];
      const row = { ...(list[index] || {}) };
      if (field === 'active' && REQUIRED_ACTIVE_SECTIONS.has(section) && row[field]) {
        const activeCount = list.filter(item => Number(item?.active || 0) === 1).length;
        if (activeCount <= 1) {
          toast.error('Debe existir al menos un elemento activo en esta sección');
          return prev;
        }
      }
      row[field] = row[field] ? 0 : 1;
      list[index] = row;
      return { ...prev, [section]: list };
    });
  };
  const deleteAppSectionItem = (section, index, label = 'registro') => {
    const currentList = section === 'categoria_anular'
      ? (appSettings.categoria_anular || []).map(value => ({ value }))
      : (Array.isArray(appSettings[section]) ? appSettings[section] : []);
    if (REQUIRED_ACTIVE_SECTIONS.has(section) && currentList.length <= 1) {
      toast.error('No puedes eliminar el último elemento de esta sección');
      return;
    }
    const target = currentList[index];
    if (REQUIRED_ACTIVE_SECTIONS.has(section) && Number(target?.active || 0) === 1) {
      const activeCount = currentList.filter(item => Number(item?.active || 0) === 1).length;
      if (activeCount <= 1) {
        toast.error('Debe existir al menos un elemento activo en esta sección');
        return;
      }
    }
    if (!window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
    setAppSettings(prev => {
      if (section === 'categoria_anular') {
        return { ...prev, categoria_anular: (prev.categoria_anular || []).filter((_, idx) => idx !== index) };
      }
      return { ...prev, [section]: (Array.isArray(prev[section]) ? prev[section] : []).filter((_, idx) => idx !== index) };
    });
    toast.success('Elemento eliminado');
  };
  const openSettingsCrudModal = (section, index = null) => {
    const cfg = SETTINGS_SECTION_FORMS[section];
    if (!cfg) return;
    const source = index === null
      ? {}
      : section === 'categoria_anular'
        ? { value: (appSettings.categoria_anular || [])[index] || '' }
        : (appSettings[section] || [])[index] || {};
    const nextForm = {};
    cfg.fields.forEach(f => {
      if (f.type === 'select') {
        const defOpt = f.options?.[0]?.value ?? '';
        nextForm[f.key] = source[f.key] ?? defOpt;
      } else if (f.type === 'number') nextForm[f.key] = source[f.key] ?? 0;
      else nextForm[f.key] = source[f.key] ?? '';
    });
    if (section === 'impresoras') {
      if (index === null) {
        if (!nextForm.area) nextForm.area = 'Comandas';
        if (!nextForm.width_mm) nextForm.width_mm = 80;
        if (!nextForm.copies) nextForm.copies = 1;
        if (!nextForm.port) nextForm.port = 9100;
        if (!nextForm.station) nextForm.station = 'cocina';
      } else {
        if (!nextForm.width_mm) nextForm.width_mm = Number(source.width_mm || 80);
        if (!nextForm.copies) nextForm.copies = Number(source.copies || 1);
        if (!nextForm.port) nextForm.port = Number(source.port || 9100);
        if (!nextForm.station) nextForm.station = String(source.station || 'cocina');
      }
      if (!nextForm.printer_type) {
        const legacyConn = String(source.connection || '').toLowerCase();
        nextForm.printer_type = legacyConn === 'wifi' ? 'lan' : 'browser';
      }
      if (index !== null) {
        nextForm.auto_print = String(Number(source.auto_print ?? 1) === 0 ? 0 : 1);
      } else if (nextForm.auto_print === undefined || nextForm.auto_print === '') {
        nextForm.auto_print = '1';
      }
    }
    setSettingsCrudForm(nextForm);
    setSettingsCrudModal({ isOpen: true, section, index });
  };
  const closeSettingsCrudModal = () => {
    setSettingsCrudModal({ isOpen: false, section: '', index: null });
    setSettingsCrudForm({});
  };
  const submitSettingsCrudModal = (e) => {
    e.preventDefault();
    const { section, index } = settingsCrudModal;
    const cfg = SETTINGS_SECTION_FORMS[section];
    if (!cfg) return;
    for (const field of cfg.fields) {
      if (field.required && !String(settingsCrudForm[field.key] ?? '').trim()) {
        return toast.error(`Completa: ${field.label}`);
      }
    }
    if (section === 'categoria_anular') {
      const value = String(settingsCrudForm.value || '').trim();
      setAppSettings(prev => {
        const list = [...(prev.categoria_anular || [])];
        if (index === null) list.push(value);
        else list[index] = value;
        return { ...prev, categoria_anular: list };
      });
      closeSettingsCrudModal();
      return;
    }
    if (section === 'comprobantes') {
      const series = String(settingsCrudForm.series || '').trim().toUpperCase();
      const duplicated = (appSettings.comprobantes || []).some((c, idx) => idx !== index && String(c.series || '').toUpperCase() === series);
      if (duplicated) return toast.error('La serie ya existe en otro comprobante');
    }
    if (section === 'impresoras') {
      const width = Number(settingsCrudForm.width_mm || 80);
      const copies = Number(settingsCrudForm.copies || 1);
      const port = Number(settingsCrudForm.port || 9100);
      const pt = String(settingsCrudForm.printer_type || '').toLowerCase();
      const ip = String(settingsCrudForm.ip_address || '').trim();
      if (![58, 80].includes(width)) return toast.error('El ancho debe ser 58 u 80 mm');
      if (copies < 1 || copies > 5) return toast.error('Las copias deben estar entre 1 y 5');
      if (port < 1 || port > 65535) return toast.error('Puerto TCP inválido');
      if (pt === 'lan') {
        if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
          return toast.error('Indica una IP válida (ej. 192.168.1.50) para impresora en red');
        }
      }
    }
    if (section === 'monedas') {
      const nextCode = String(settingsCrudForm.code || '').trim().toUpperCase();
      const duplicated = (appSettings.monedas || []).some((m, idx) => idx !== index && String(m.code || '').toUpperCase() === nextCode);
      if (duplicated) return toast.error('El código de moneda ya existe');
    }
    const payload = {};
    cfg.fields.forEach(f => {
      if (f.type === 'number') {
        payload[f.key] = Number(settingsCrudForm[f.key] || 0);
      } else {
        payload[f.key] = String(settingsCrudForm[f.key] ?? '').trim();
      }
    });
    if (section === 'monedas') {
      payload.code = String(payload.code || '').toUpperCase();
    }
    if (index === null) payload.active = 1;
    if (section === 'cajas') {
      if (index === null) {
        payload.id = newLocalCajaId();
      } else {
        const existing = (appSettings.cajas || [])[index] || {};
        const existingId = String(existing.id || '').trim();
        payload.id = existingId || newLocalCajaId();
      }
    }
    if (section === 'impresoras') {
      const pt = String(payload.printer_type || 'browser').toLowerCase();
      payload.connection = pt === 'lan' ? 'wifi' : 'browser';
      payload.auto_print = String(payload.auto_print) === '0' ? 0 : 1;
    }
    setAppSettings(prev => {
      const list = Array.isArray(prev[section]) ? [...prev[section]] : [];
      if (index === null) list.push(payload);
      else list[index] = { ...(list[index] || {}), ...payload };
      return { ...prev, [section]: list };
    });
    closeSettingsCrudModal();
  };
  const rollbackAppSettings = async (historyId) => {
    if (!historyId) return;
    if (!window.confirm('¿Restaurar esta versión de configuración? Se aplicará inmediatamente.')) return;
    try {
      setIsRollingBackSettings(true);
      const restored = await api.post(`/admin-modules/config/app/rollback/${historyId}`, {});
      const normalized = normalizeConfigPayload(restored);
      setAppSettings(normalized);
      setAppSettingsSnapshot(serializeAppSettings(normalized));
      applyUiTheme(normalized.ui_theme);
      if (activeSection === 'config_historial') loadAppSettingsHistory();
      toast.success('Configuración restaurada');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsRollingBackSettings(false);
    }
  };
  const settingsHistoryFiltered = settingsHistory;
  const historyActors = Array.from(new Set(settingsHistory.map(item => (item.actor_name || '').trim()).filter(Boolean)));
  const historyPageStart = historyTotal === 0 ? 0 : historyOffset + 1;
  const historyPageEnd = Math.min(historyOffset + settingsHistory.length, historyTotal);
  const historyHasPrev = historyOffset > 0;
  const historyHasNext = historyOffset + historyLimit < historyTotal;
  const clearHistoryFilters = () => {
    setHistoryFilterSection('all');
    setHistoryFilterActor('all');
    setHistorySearch('');
    setHistorySearchDebounced('');
    setHistoryOffset(0);
  };
  const exportHistoryCsv = async () => {
    try {
      const fetchLimit = 100;
      const allRows = [];
      let offset = 0;
      let total = 0;
      do {
        const params = [
          `limit=${fetchLimit}`,
          `offset=${offset}`,
          `section=${encodeURIComponent(historyFilterSection)}`,
          `actor=${encodeURIComponent(historyFilterActor)}`,
          `q=${encodeURIComponent(historySearchDebounced)}`,
        ].join('&');
        const data = await api.get(`/admin-modules/config/app/history?${params}`);
        const chunk = Array.isArray(data?.items) ? data.items : [];
        total = Number(data?.total || 0);
        allRows.push(...chunk);
        offset += fetchLimit;
        if (!chunk.length) break;
      } while (offset < total);
      if (!allRows.length) return toast.error('No hay registros para exportar');
      const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const header = ['Fecha', 'Usuario', 'Secciones', 'Origen'];
      const rows = allRows.map(item => ([
        formatDateTime(item.created_at),
        item.actor_name || 'Sistema',
        Array.isArray(item.changed_keys) ? item.changed_keys.join(', ') : '',
        item?.details?.source || '',
      ]));
      const csv = [header, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historial_configuracion_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Historial exportado (${allRows.length} registros)`);
    } catch (err) {
      toast.error(err.message || 'No se pudo exportar el historial');
    }
  };
  const getHistoryDiff = (item) => {
    const changedKeys = Array.isArray(item?.changed_keys) ? item.changed_keys : [];
    const before = item?.before_state || {};
    const after = item?.after_state || {};
    return changedKeys.map((key) => {
      const beforeValue = before[key];
      const afterValue = after[key];
      return {
        key,
        beforeText: JSON.stringify(beforeValue === undefined ? null : beforeValue, null, 2),
        afterText: JSON.stringify(afterValue === undefined ? null : afterValue, null, 2),
      };
    });
  };

  const activeMenu = MENU_ITEMS.find(m => m.id === activeSection);

  return (
    <div className="flex gap-6 -mt-2">
      {/* Sidebar Menu */}
      <div className="w-72 flex-shrink-0">
        <div className="bg-[var(--ui-surface)] rounded-xl overflow-hidden shadow-lg border border-[color:var(--ui-border)]">
          <div className="px-4 py-3 bg-[var(--ui-accent)]">
            <h2 className="text-white font-bold text-sm flex items-center gap-2">
              <MdSettings className="text-lg" /> Opciones sistema
            </h2>
          </div>
          <nav className="py-1">
            {MENU_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-[var(--ui-accent-hover)] text-white font-medium'
                      : 'text-[var(--ui-muted)] hover:bg-[var(--ui-sidebar-hover)] hover:text-[var(--ui-body-text)]'
                  }`}
                >
                  <Icon className="text-lg flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <MdChevronRight className={`text-lg flex-shrink-0 ${isActive ? 'text-white' : 'text-[var(--ui-accent-muted)]'}`} />
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-5">
          {activeMenu && <activeMenu.icon className="text-2xl text-[var(--ui-accent)]" />}
          <h1 className="text-2xl font-bold text-[var(--ui-body-text)]">{activeMenu?.label || 'Configuración'}</h1>
          {activeSection && PARTIAL_SECTIONS.has(activeSection) && (
            <span className={`text-xs px-2 py-1 rounded-full border border-[color:var(--ui-border)] ${isSavingAppSettings ? 'bg-[var(--ui-sidebar-active-bg)] text-[var(--ui-body-text)]' : hasUnsavedAppSettings ? 'bg-amber-100 text-amber-950 border-amber-200/80' : 'bg-[var(--ui-surface-2)] text-[var(--ui-muted)]'}`}>
              {isSavingAppSettings ? 'Guardando...' : hasUnsavedAppSettings ? 'Cambios sin guardar' : 'Sincronizado'}
            </span>
          )}
        </div>
        {activeSection === 'apariencia' && (
          <div className="max-w-3xl space-y-4">
            <div className="card">
              <h3 className="text-lg font-semibold text-[var(--ui-body-text)] mb-1">Tema de color del sistema</h3>
              <p className="text-sm text-[var(--ui-muted)] mb-4">
                Define la paleta del panel (barra lateral, cabecera, fondos y estilos base como tarjetas y botones). Se guarda en la configuración del restaurante y se aplica a cada usuario al iniciar sesión.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {UI_THEME_OPTIONS.map((opt) => {
                  const current = getValidUiThemeId(appSettings?.ui_theme);
                  const selected = current === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setAppSettings((prev) => ({ ...prev, ui_theme: opt.id }));
                        applyUiTheme(opt.id);
                      }}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? 'border-[var(--ui-accent-muted)] ring-2 ring-[var(--ui-accent-muted)]/50'
                          : 'border-[color:var(--ui-border)] hover:border-[var(--ui-accent-muted)]'
                      }`}
                    >
                      <p className="font-semibold text-[var(--ui-body-text)]">{opt.label}</p>
                      <p className="text-xs text-[var(--ui-muted)] mt-0.5">{opt.description}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[var(--ui-muted)] mt-4">
                En esta sección los cambios se sincronizan automáticamente con el servidor en unos segundos.
              </p>
            </div>
          </div>
        )}

        {activeSection === 'config_historial' && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700">Historial reciente de configuración</p>
              <div className="flex items-center gap-3">
                <button onClick={exportHistoryCsv} className="text-xs text-emerald-600 hover:underline">Exportar CSV</button>
                <button onClick={clearHistoryFilters} className="text-xs text-[var(--ui-accent-muted)] hover:underline">Limpiar filtros</button>
                <button onClick={loadAppSettingsHistory} className="text-xs text-sky-600 hover:underline">Actualizar</button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Consulta y restaura versiones anteriores de la configuración del sistema. Los cambios en otras secciones siguen registrándose aquí.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
              <input
                value={historySearch}
                onChange={e => {
                  setHistoryOffset(0);
                  setHistorySearch(e.target.value);
                }}
                placeholder="Buscar en historial..."
                className="input-field"
              />
              <select value={historyFilterSection} onChange={e => {
                setHistoryOffset(0);
                setHistoryFilterSection(e.target.value);
              }} className="input-field">
                <option value="all">Todas las secciones</option>
                {HISTORY_FILTER_SECTIONS.map(section => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
              <select value={historyFilterActor} onChange={e => {
                setHistoryOffset(0);
                setHistoryFilterActor(e.target.value);
              }} className="input-field">
                <option value="all">Todos los usuarios</option>
                {historyActors.map(actor => (
                  <option key={actor} value={actor}>{actor}</option>
                ))}
                <option value="__empty__">Sistema</option>
              </select>
              <select
                value={historyLimit}
                onChange={e => {
                  setHistoryOffset(0);
                  setHistoryLimit(Number(e.target.value) || 8);
                }}
                className="input-field"
              >
                <option value={8}>8 por página</option>
                <option value={20}>20 por página</option>
                <option value={50}>50 por página</option>
              </select>
            </div>
            {settingsHistoryLoading ? (
              <p className="text-xs text-slate-500">Cargando historial...</p>
            ) : settingsHistoryFiltered.length === 0 ? (
              <p className="text-xs text-slate-500">Aún no hay cambios registrados.</p>
            ) : (
              <div className="space-y-2">
                {settingsHistoryFiltered.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {Array.isArray(item.changed_keys) && item.changed_keys.length ? item.changed_keys.join(', ') : 'sin cambios'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatDateTime(item.created_at)} · {item.actor_name || 'Sistema'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setHistoryPreview(item)}
                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50"
                      >
                        Ver cambios
                      </button>
                      <button
                        onClick={() => rollbackAppSettings(item.id)}
                        disabled={isRollingBackSettings}
                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Restaurar
                      </button>
                    </div>
                  </div>
                ))}
                <div className="pt-2 flex items-center justify-between">
                  <p className="text-[11px] text-slate-500">
                    {historyPageStart}-{historyPageEnd} de {historyTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!historyHasPrev}
                      onClick={() => setHistoryOffset(prev => Math.max(0, prev - historyLimit))}
                    >
                      Anterior
                    </button>
                    <button
                      className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!historyHasNext}
                      onClick={() => setHistoryOffset(prev => prev + historyLimit)}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BIENVENIDA */}
        {!activeSection && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <MdSettings className="text-4xl text-slate-300" />
            </div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">Configuración del Sistema</h2>
            <p className="text-sm text-slate-400 max-w-md">Selecciona una opción del menú lateral para configurar los parámetros de tu restaurante.</p>
          </div>
        )}

        {/* CONFIGURACIÓN REGIONAL */}
        {activeSection === 'regional' && restaurant && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold text-slate-800 mb-4">Configuración Regional</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
                  <select className="input-field" value={appSettings.regional?.country || 'Peru'} onChange={e => setAppSettings(prev => ({ ...prev, regional: { ...(prev.regional || {}), country: e.target.value } }))}>
                    <option>Peru</option><option>Colombia</option><option>Mexico</option><option>Argentina</option><option>Chile</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Zona Horaria</label>
                  <select className="input-field" value={appSettings.regional?.timezone || 'America/Lima'} onChange={e => setAppSettings(prev => ({ ...prev, regional: { ...(prev.regional || {}), timezone: e.target.value } }))}>
                    <option value="America/Lima">America/Lima (UTC-5)</option><option value="America/Bogota">America/Bogota (UTC-5)</option><option value="America/Mexico_City">America/Mexico_City (UTC-6)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Idioma</label>
                  <select className="input-field" value={appSettings.regional?.language || 'es'} onChange={e => setAppSettings(prev => ({ ...prev, regional: { ...(prev.regional || {}), language: e.target.value } }))}>
                    <option value="es">Español</option><option value="en">English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Formato de Fecha</label>
                  <select className="input-field" value={appSettings.regional?.date_format || 'DD/MM/YYYY'} onChange={e => setAppSettings(prev => ({ ...prev, regional: { ...(prev.regional || {}), date_format: e.target.value } }))}>
                    <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* LOCALES */}
        {activeSection === 'locales' && restaurant && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Locales registrados</p>
              <button
                onClick={() => openSettingsCrudModal('locales')}
                className="btn-primary flex items-center gap-2 text-sm"
              ><MdAdd /> Nuevo Local</button>
            </div>
            <div className="space-y-3">
              {(appSettings.locales || []).map((loc, i) => (
                <div key={`${loc.name}-${i}`} className="card flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gold-100 rounded-xl flex items-center justify-center">
                      <MdStorefront className="text-2xl text-gold-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{loc.name}</p>
                      <p className="text-sm text-slate-500">{loc.address || 'Sin dirección'}</p>
                      <p className="text-sm text-slate-400">{loc.phone || 'Sin teléfono'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleAppSection('locales', i)} className={`px-3 py-1 text-xs rounded-full ${loc.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {loc.active ? 'Activo' : 'Inactivo'}
                    </button>
                    <button
                      onClick={() => openSettingsCrudModal('locales', i)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                    ><MdEdit /></button>
                    <button
                      onClick={() => deleteAppSectionItem('locales', i, `el local "${loc.name}"`)}
                      className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]"
                    ><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* USUARIOS */}
        {activeSection === 'users' && (
          <UsersSection
            users={users}
            appSettings={appSettings}
            currentUser={currentUser}
            openNewUser={openNewUser}
            openEditUser={openEditUser}
            handleDelete={handleDelete}
            toggleActive={toggleActive}
            showModal={showModal}
            closeUserModal={closeUserModal}
            editUser={editUser}
            handleSubmit={handleSubmit}
            form={form}
            setForm={setForm}
            showPw={showPw}
            setShowPw={setShowPw}
          />
        )}

        {/* ALMACENES Y PRODUCCIÓN */}
        {activeSection === 'almacenes' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Gestión de almacenes y áreas de producción</p>
              <button
                onClick={() => openSettingsCrudModal('almacenes')}
                className="btn-primary flex items-center gap-2 text-sm"
              ><MdAdd /> Nuevo Almacén</button>
            </div>
            <div className="card">
              {(appSettings.almacenes || []).map((wh, i) => (
                <div key={`${wh.name}-${i}`} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center"><MdWarehouse className="text-sky-600" /></div>
                    <div><p className="font-medium">{wh.name}</p><p className="text-sm text-slate-500">{wh.description || 'Sin descripción'}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleAppSection('almacenes', i)} className={`px-2 py-1 text-xs rounded-full ${wh.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{wh.active ? 'Activo' : 'Inactivo'}</button>
                    <button onClick={() => openSettingsCrudModal('almacenes', i)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><MdEdit /></button>
                    <button onClick={() => deleteAppSectionItem('almacenes', i, `el almacén "${wh.name}"`)} className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]"><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* SALONES Y MESAS */}
        {activeSection === 'salones' && (
          <SalonMesasSection />
        )}

        {/* CAJAS */}
        {activeSection === 'cajas' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">
                Defina aquí cada caja física; luego vincúlela a un usuario con rol Cajero en Usuarios.
              </p>
              <button onClick={() => openSettingsCrudModal('cajas')} className="btn-primary flex items-center gap-2 text-sm"><MdAdd /> Nueva Caja</button>
            </div>
            <div className="card">
              {!(appSettings.cajas || []).length && (
                <p className="text-sm text-slate-500 py-6 text-center">Aún no hay cajas. Use «Nueva Caja» para crear la primera.</p>
              )}
              {(appSettings.cajas || []).map((caja, i) => (
                <div key={String(caja.id || '').trim() || `${caja.name}-${i}`} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center"><MdPointOfSale className="text-sky-600" /></div>
                    <div><p className="font-medium">{caja.name}</p><p className="text-sm text-slate-500">{caja.description || 'Sin descripción'}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleAppSection('cajas', i)} className={`px-2 py-1 text-xs rounded-full ${caja.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{caja.active ? 'Activa' : 'Inactiva'}</button>
                    <button onClick={() => openSettingsCrudModal('cajas', i)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><MdEdit /></button>
                    <button onClick={() => deleteAppSectionItem('cajas', i, `la caja "${caja.name}"`)} className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]"><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* COMPROBANTES */}
        {activeSection === 'comprobantes' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Configuración de comprobantes de venta</p>
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => openSettingsCrudModal('comprobantes')}><MdAdd /> Nuevo Comprobante</button>
            </div>
            <div className="card space-y-4">
              <h3 className="font-semibold text-slate-800">Tipos de Comprobante</h3>
              {(appSettings.comprobantes || []).map((tipo, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <MdReceipt className="text-slate-400 text-xl" />
                    <div><p className="font-medium text-sm">{tipo.name}</p><p className="text-xs text-slate-400">Serie: {tipo.series || '-'}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={!!tipo.active} onChange={() => toggleAppSection('comprobantes', i)} className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-300 peer-checked:bg-gold-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" onClick={() => openSettingsCrudModal('comprobantes', i)}><MdEdit /></button>
                    <button className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]" onClick={() => deleteAppSectionItem('comprobantes', i, `el comprobante "${tipo.name}"`)}><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* IMPRESORAS */}
        {activeSection === 'impresoras' && (
          <div className="space-y-4">
            <div className="card space-y-2 p-4">
              <label className="block text-xs font-medium text-[var(--ui-muted)] mb-1">Servicio de impresión en este equipo</label>
              <input
                className="input-field text-sm"
                value={String(appSettings.print_agent?.base_url || 'http://127.0.0.1:49710')}
                onChange={(e) =>
                  setAppSettings((prev) => ({
                    ...prev,
                    print_agent: {
                      ...(prev.print_agent || {}),
                      enabled: 1,
                      base_url: (e.target.value || 'http://127.0.0.1:49710').trim(),
                    },
                  }))
                }
                placeholder="http://127.0.0.1:49710"
              />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Impresoras configuradas en el sistema</p>
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => openSettingsCrudModal('impresoras')}><MdAdd /> Nueva Impresora</button>
            </div>
            <div className="card">
              {(appSettings.impresoras || []).map((pr, i) => (
                <div key={`${pr.name}-${i}`} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><MdPrint className="text-slate-600" /></div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{pr.name}</p>
                      <p className="text-sm text-slate-500">
                        Estación <span className="font-medium text-slate-700">{pr.station || '—'}</span>
                        {' · '}{pr.area || 'Sin área'} · {Number(pr.width_mm || 80)}mm · {Number(pr.copies || 1)} copia(s)
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {String(pr.connection || 'browser').toLowerCase() === 'wifi' && pr.ip_address
                          ? <>Red <code className="bg-slate-100 px-1 rounded text-slate-800">{pr.ip_address}:{Number(pr.port || 9100)}</code></>
                          : <>Navegador (diálogo en el PC)</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={() => toggleAppSection('impresoras', i)} className={`px-2 py-1 text-xs rounded-full ${pr.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{pr.active ? 'Activa' : 'Inactiva'}</button>
                    <button
                      type="button"
                      className="p-2 hover:bg-sky-50 rounded-lg text-sky-600"
                      title={
                        shouldTryServerNetworkPrint(pr)
                          ? 'Probar impresión (red TCP vía servidor)'
                          : shouldSendToNetworkPrinter(pr) && isLocalPrintAgentConfigured(appSettings.print_agent)
                            ? 'Probar impresión (programa local → impresora)'
                            : 'Probar impresión (cuadro del sistema / navegador)'
                      }
                      onClick={() => testPrinterFromSettings(pr)}
                    >
                      <MdPlayArrow className="text-xl" />
                    </button>
                    <button type="button" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" onClick={() => openSettingsCrudModal('impresoras', i)}><MdEdit /></button>
                    <button type="button" className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]" onClick={() => deleteAppSectionItem('impresoras', i, `la impresora "${pr.name}"`)}><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* IMPUESTOS */}
        {activeSection === 'impuestos' && restaurant && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Configuración de impuestos aplicables</p>
            <div className="card space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tasa de Impuesto (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={appSettings.impuestos?.rate ?? restaurant.tax_rate}
                    onChange={e => {
                      const nextRate = Number(e.target.value);
                      updateR('tax_rate', Number.isNaN(nextRate) ? 0 : nextRate);
                      setAppSettings(prev => ({ ...prev, impuestos: { ...(prev.impuestos || {}), rate: Number.isNaN(nextRate) ? 0 : nextRate } }));
                    }}
                    className="input-field"
                  />
                  <p className="text-xs text-slate-400 mt-1">IGV Perú: 18%</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Impuesto</label>
                  <input
                    className="input-field"
                    value={appSettings.impuestos?.name || 'IGV'}
                    onChange={e => setAppSettings(prev => ({ ...prev, impuestos: { ...(prev.impuestos || {}), name: e.target.value } }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Incluido en precio</label>
                  <select
                    className="input-field"
                    value={appSettings.impuestos?.included_in_price ? '1' : '0'}
                    onChange={e => setAppSettings(prev => ({ ...prev, impuestos: { ...(prev.impuestos || {}), included_in_price: Number(e.target.value) } }))}
                  >
                    <option value="1">Sí - Precio incluye impuesto</option>
                    <option value="0">No - Impuesto se agrega al precio</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={saveTaxSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* TARJETAS */}
        {activeSection === 'tarjetas' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Tarjetas de crédito/débito aceptadas</p>
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => openSettingsCrudModal('tarjetas')}><MdAdd /> Nueva Tarjeta</button>
            </div>
            <div className="card">
              {(appSettings.tarjetas || []).map((t, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <MdCreditCard className="text-slate-400 text-xl" />
                    <p className="font-medium text-sm">{t.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Comisión: {Number(t.fee_percent || 0).toFixed(1)}%</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={!!t.active} onChange={() => toggleAppSection('tarjetas', i)} className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-300 peer-checked:bg-gold-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" onClick={() => openSettingsCrudModal('tarjetas', i)}><MdEdit /></button>
                    <button className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]" onClick={() => deleteAppSectionItem('tarjetas', i, `la tarjeta "${t.name}"`)}><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* TURNOS */}
        {activeSection === 'turnos' && restaurant && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Horarios y turnos del restaurante</p>
              <button onClick={saveRestaurant} className="btn-primary flex items-center gap-2 text-sm"><MdSave /> Guardar</button>
            </div>
            <div className="card">
              <div className="space-y-3">
                {DAYS.map(day => (
                  <div key={day} className="flex items-center gap-4 py-2 border-b border-slate-50 last:border-0">
                    <label className="flex items-center gap-2 w-32">
                      <input type="checkbox" checked={restaurant.schedule[day]?.enabled} onChange={e => updateSchedule(day, 'enabled', e.target.checked)} className="rounded text-gold-600" />
                      <span className="font-medium text-sm">{DAY_NAMES[day]}</span>
                    </label>
                    <input type="time" value={restaurant.schedule[day]?.open || '11:00'} onChange={e => updateSchedule(day, 'open', e.target.value)} className="input-field w-auto" disabled={!restaurant.schedule[day]?.enabled} />
                    <span className="text-slate-400">a</span>
                    <input type="time" value={restaurant.schedule[day]?.close || '23:00'} onChange={e => updateSchedule(day, 'close', e.target.value)} className="input-field w-auto" disabled={!restaurant.schedule[day]?.enabled} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* JORNADA Y ASISTENCIA (foto inicio/fin) */}
        {activeSection === 'jornada_laboral' && (() => {
          const { inicio: jlInicio, fin: jlFin } = getJornadaLaboralToggles(appSettings.jornada_laboral);
          const setJlField = (field, checked) => {
            setAppSettings((prev) => {
              const cur = prev.jornada_laboral || {};
              const t = getJornadaLaboralToggles(cur);
              const nextInicio = field === 'inicio' ? checked : t.inicio;
              const nextFin = field === 'fin' ? checked : t.fin;
              return {
                ...prev,
                jornada_laboral: {
                  ...cur,
                  requiere_foto_inicio_sesion: nextInicio ? 1 : 0,
                  requiere_foto_fin_jornada: nextFin ? 1 : 0,
                  requiere_foto_asistencia: nextInicio || nextFin ? 1 : 0,
                },
              };
            });
          };
          return (
            <div className="space-y-4">
              <div className="card space-y-0 divide-y divide-slate-100">
                <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
                  <span className="font-medium text-slate-800 text-sm">Exigir foto al iniciar sesión</span>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={jlInicio}
                      onChange={(e) => setJlField('inicio', e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-checked:bg-gold-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full" />
                  </label>
                </div>
                <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
                  <span className="font-medium text-slate-800 text-sm">Exigir foto al finalizar jornada</span>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={jlFin}
                      onChange={(e) => setJlField('fin', e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-checked:bg-gold-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full" />
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => void saveAppSettings()} className="btn-primary flex items-center gap-2 text-sm">
                  <MdSave /> Guardar
                </button>
              </div>

              <div className="card space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Fotos de inicio y fin de jornada</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Solo se muestran las jornadas del día actual (fecha local del servidor). Indique asistencia para que
                    cuenten en tiempo trabajado.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Usuario</label>
                  <select
                    className="input-field max-w-md"
                    value={attendanceGalleryUserId}
                    onChange={(e) => setAttendanceGalleryUserId(e.target.value)}
                  >
                    <option value="">Seleccione un usuario</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username}
                      </option>
                    ))}
                  </select>
                </div>
                {attendanceGalleryLoading ? (
                  <p className="text-sm text-slate-500">Cargando…</p>
                ) : !attendanceGalleryUserId ? (
                  <p className="text-sm text-slate-500">Elija un usuario para ver las fotos guardadas.</p>
                ) : attendanceGallerySessions.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay jornadas registradas hoy para este usuario.</p>
                ) : (
                  <>
                    <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                      {attendanceGallerySessions.map((row) => (
                        <div key={row.id} className="rounded-lg border border-slate-200 p-3 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-600">Clasificación (tiempo trabajado)</span>
                            <select
                              className="input-field w-48 text-sm"
                              value={attendanceGalleryDraft[row.id] || 'asistente'}
                              onChange={(e) =>
                                setAttendanceGalleryDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                              disabled={attendanceGallerySaving}
                            >
                              <option value="asistente">Asistente</option>
                              <option value="justificado">Justificado</option>
                              <option value="ausente">Ausente</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-slate-600 mb-1">Inicio</p>
                              <p className="text-xs text-slate-500 mb-2">{row.login_at ? formatDateTime(row.login_at) : '—'}</p>
                              {row.photo_login ? (
                                <img
                                  src={row.photo_login}
                                  alt="Inicio de jornada"
                                  loading="lazy"
                                  className="w-full max-h-48 object-contain rounded-md bg-slate-50 border border-slate-100"
                                />
                              ) : (
                                <p className="text-xs text-slate-400">Sin foto</p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-600 mb-1">Fin</p>
                              <p className="text-xs text-slate-500 mb-2">{row.logout_at ? formatDateTime(row.logout_at) : '—'}</p>
                              {row.photo_logout ? (
                                <img
                                  src={row.photo_logout}
                                  alt="Fin de jornada"
                                  loading="lazy"
                                  className="w-full max-h-48 object-contain rounded-md bg-slate-50 border border-slate-100"
                                />
                              ) : (
                                <p className="text-xs text-slate-400">Sin foto</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={attendanceGallerySaving}
                        onClick={() => void saveGalleryAttendance()}
                        className="btn-primary flex items-center gap-2 text-sm"
                      >
                        <MdSave /> Guardar clasificación del día
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* MONEDAS */}
        {activeSection === 'monedas' && restaurant && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Monedas disponibles en el sistema</p>
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => openSettingsCrudModal('monedas')}>
                <MdAdd /> Nueva Moneda
              </button>
            </div>
            <div className="card">
              {(appSettings.monedas || []).map((m, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gold-100 rounded-lg flex items-center justify-center font-bold text-gold-700">{m.symbol}</div>
                    <div><p className="font-medium text-sm">{m.name}</p><p className="text-xs text-slate-400">{m.code}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={!!m.active} onChange={() => toggleAppSection('monedas', i)} className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-300 peer-checked:bg-gold-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" onClick={() => openSettingsCrudModal('monedas', i)}><MdEdit /></button>
                    <button className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]" onClick={() => deleteAppSectionItem('monedas', i, `la moneda "${m.code}"`)}><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* MONEDA DE FACTURACIÓN */}
        {activeSection === 'moneda_facturacion' && restaurant && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Moneda predeterminada para la facturación</p>
            <div className="card space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Moneda Principal</label>
                  <select className="input-field" value={restaurant.currency} onChange={e => updateR('currency', e.target.value)}>
                    <option value="PEN">Sol Peruano (PEN)</option><option value="USD">Dólar (USD)</option><option value="EUR">Euro (EUR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Símbolo</label>
                  <input value={restaurant.currency_symbol} onChange={e => updateR('currency_symbol', e.target.value)} className="input-field" />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={saveRestaurant} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* CUENTAS DE TRANSFERENCIA */}
        {activeSection === 'cuentas_transferencia' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Cuentas bancarias para transferencias</p>
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => openSettingsCrudModal('cuentas_transferencia')}><MdAdd /> Nueva Cuenta</button>
            </div>
            <div className="card">
              {(appSettings.cuentas_transferencia || []).map((c, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center"><MdAccountBalanceWallet className="text-sky-600" /></div>
                    <div><p className="font-medium text-sm">{c.bank}</p><p className="text-xs text-slate-400">{c.type} · {c.account}</p></div>
                  </div>
                  <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" onClick={() => openSettingsCrudModal('cuentas_transferencia', i)}><MdEdit /></button>
                  <button className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]" onClick={() => deleteAppSectionItem('cuentas_transferencia', i, `la cuenta de ${c.bank}`)}><MdDelete /></button>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* GESTIÓN DE MARCAS */}
        {activeSection === 'marcas' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Marcas registradas en el sistema</p>
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => openSettingsCrudModal('marcas')}><MdAdd /> Nueva Marca</button>
            </div>
            <div className="card">
              {!(appSettings.marcas || []).length ? (
                <div className="text-center py-8 text-slate-400">
                  <MdLabel className="text-4xl mx-auto mb-2" />
                  <p className="text-sm">No hay marcas registradas</p>
                  <p className="text-xs mt-1">Agrega marcas para organizar tus productos</p>
                </div>
              ) : (appSettings.marcas || []).map((m, i) => (
                <div key={`${m.name}-${i}`} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3"><MdLabel className="text-slate-400" /><p className="text-sm font-medium">{m.name}</p></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleAppSection('marcas', i)} className={`px-2 py-1 text-xs rounded-full ${m.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{m.active ? 'Activa' : 'Inactiva'}</button>
                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" onClick={() => openSettingsCrudModal('marcas', i)}><MdEdit /></button>
                    <button className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]" onClick={() => deleteAppSectionItem('marcas', i, `la marca "${m.name}"`)}><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* CATEGORÍA ANULAR VENTA */}
        {activeSection === 'categoria_anular' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Motivos de anulación de venta</p>
            <div className="flex justify-between items-center">
              <div />
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => openSettingsCrudModal('categoria_anular')}><MdAdd /> Nuevo Motivo</button>
            </div>
            <div className="card">
              {(appSettings.categoria_anular || []).map((motivo, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <MdDoNotDisturb className="text-[#60A5FA]" />
                    <p className="text-sm font-medium">{motivo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" onClick={() => openSettingsCrudModal('categoria_anular', i)}><MdEdit /></button>
                    <button className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]" onClick={() => deleteAppSectionItem('categoria_anular', i, `el motivo "${motivo}"`)}><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        {/* FORMAS DE PAGO */}
        {activeSection === 'formas_pago' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Métodos de pago aceptados</p>
              <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => openSettingsCrudModal('formas_pago')}><MdAdd /> Nueva Forma de Pago</button>
            </div>
            <div className="card">
              {(appSettings.formas_pago || []).map((fp, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <MdPayment className="text-slate-400 text-xl" />
                    <div><p className="font-medium text-sm">{fp.name}</p><p className="text-xs text-slate-400">{fp.desc}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={!!fp.active} onChange={() => toggleAppSection('formas_pago', i)} className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-300 peer-checked:bg-gold-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400" onClick={() => openSettingsCrudModal('formas_pago', i)}><MdEdit /></button>
                    <button className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]" onClick={() => deleteAppSectionItem('formas_pago', i, `la forma de pago "${fp.name}"`)}><MdDelete /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={saveAppSettings} className="btn-primary flex items-center gap-2"><MdSave /> Guardar</button>
            </div>
          </div>
        )}

        <Modal
          isOpen={settingsCrudModal.isOpen}
          onClose={closeSettingsCrudModal}
          title={`${settingsCrudModal.index === null ? 'Nuevo' : 'Editar'} ${SETTINGS_SECTION_FORMS[settingsCrudModal.section]?.title || 'registro'}`}
          size={
            settingsCrudModal.section === 'locales' && settingsCrudModal.index === null
              ? 'xl'
              : settingsCrudModal.section === 'impresoras'
                ? 'md'
                : 'sm'
          }
        >
          {settingsCrudModal.section === 'locales' && settingsCrudModal.index === null ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-3">
                <p className="font-medium text-amber-900">Sucursal o local adicional</p>
                <p className="text-amber-900/90">
                  La creación de nuevas sucursales está disponible como servicio adicional. Su activación requiere coordinación directa con el proveedor.
                </p>
                <p className="text-amber-900/90">
                  Para obtener información detallada y proceder con la habilitación, por favor comunícate mediante el botón de contacto.
                </p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={closeSettingsCrudModal} className="btn-secondary flex-1">Cancelar</button>
                <a
                  href={WHATSAPP_PROVEEDOR_LOCALES}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary flex-[1.35] inline-flex items-center justify-center gap-2 no-underline whitespace-nowrap text-center px-5"
                  onClick={() => closeSettingsCrudModal()}
                >
                  CONTACTAR AL PROVEEDOR
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={submitSettingsCrudModal} className="space-y-4">
              {(SETTINGS_SECTION_FORMS[settingsCrudModal.section]?.fields || []).map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{field.label}</label>
                  {field.type === 'select' && field.options ? (
                    <select
                      value={settingsCrudForm[field.key] ?? ''}
                      onChange={e => setSettingsCrudForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="input-field"
                      required={!!field.required}
                    >
                      {field.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      step={field.type === 'number' ? '1' : undefined}
                      min={field.type === 'number' && field.key === 'port' ? 1 : undefined}
                      max={field.type === 'number' && field.key === 'port' ? 65535 : undefined}
                      value={settingsCrudForm[field.key] ?? ''}
                      onChange={e => setSettingsCrudForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="input-field"
                      required={!!field.required}
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-3">
                <button type="button" onClick={closeSettingsCrudModal} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1">Guardar</button>
              </div>
            </form>
          )}
        </Modal>

        <Modal
          isOpen={!!historyPreview}
          onClose={() => setHistoryPreview(null)}
          title="Detalle de cambios"
          size="lg"
        >
          {!historyPreview ? null : (
            <div className="space-y-4">
              <div className="text-xs text-slate-500">
                {formatDateTime(historyPreview.created_at)} · {historyPreview.actor_name || 'Sistema'}
              </div>
              {(getHistoryDiff(historyPreview) || []).map(diff => (
                <div key={diff.key} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">{diff.key}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">Antes</p>
                      <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-40">{diff.beforeText}</pre>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">Después</p>
                      <pre className="text-[11px] bg-emerald-50 border border-emerald-200 rounded p-2 overflow-auto max-h-40">{diff.afterText}</pre>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-3 pt-2">
                <button className="btn-secondary" onClick={() => setHistoryPreview(null)}>Cerrar</button>
                <button
                  className="btn-primary"
                  disabled={isRollingBackSettings}
                  onClick={() => {
                    const id = historyPreview.id;
                    setHistoryPreview(null);
                    rollbackAppSettings(id);
                  }}
                >
                  Restaurar esta versión
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}

function UsersSection({
  users,
  appSettings,
  currentUser,
  openNewUser,
  openEditUser,
  handleDelete,
  toggleActive,
  showModal,
  closeUserModal,
  editUser,
  handleSubmit,
  form,
  setForm,
  showPw,
  setShowPw,
}) {
  const [showPermsModal, setShowPermsModal] = useState(false);
  const [permsUser, setPermsUser] = useState(null);
  const [perms, setPerms] = useState({});
  const [permsLoading, setPermsLoading] = useState(false);

  const openPermissions = async (u) => {
    setPermsUser(u);
    setPermsLoading(true);
    setShowPermsModal(true);
    try {
      const data = await api.get(`/users/${u.id}/permissions`);
      const defaults = {};
      ALL_MODULES.forEach(m => {
        defaults[m.id] = data[m.id] === true;
      });
      setPerms(defaults);
    } catch {
      const defaults = {};
      ALL_MODULES.forEach(m => { defaults[m.id] = false; });
      setPerms(defaults);
    } finally { setPermsLoading(false); }
  };

  const savePermissions = async () => {
    try {
      await api.put(`/users/${permsUser.id}/permissions`, { permissions: perms });
      toast.success(`Permisos actualizados para ${permsUser.full_name}`);
      setShowPermsModal(false);
    } catch (err) { toast.error(err.message); }
  };

  const togglePerm = (moduleId) => {
    setPerms(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const resetToDefaults = () => {
    if (!permsUser) return;
    const defaults = {};
    ALL_MODULES.forEach(m => { defaults[m.id] = m.defaultRoles.includes(permsUser.role); });
    setPerms(defaults);
  };

  const cajaNameById = useMemo(() => {
    const m = new Map();
    (appSettings?.cajas || []).forEach((c) => {
      const id = String(c?.id || '').trim();
      if (id) m.set(id, String(c?.name || '').trim() || 'Caja');
    });
    return m;
  }, [appSettings?.cajas]);

  const cajaOptionsForForm = (() => {
    const assigned = new Map();
    (users || []).forEach((u) => {
      if (String(u.role || '').toLowerCase() !== 'cajero') return;
      const cid = String(u.caja_station_id || '').trim();
      if (!cid) return;
      assigned.set(cid, u.id);
    });
    const list = Array.isArray(appSettings?.cajas) ? appSettings.cajas : [];
    return list
      .filter((c) => Number(c?.active || 0) === 1 && String(c?.id || '').trim())
      .filter((c) => {
        const uid = assigned.get(String(c.id).trim());
        return !uid || uid === editUser?.id;
      })
      .map((c) => ({ id: String(c.id).trim(), name: String(c.name || '').trim() || 'Caja' }));
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{users.length} usuario(s) registrado(s)</p>
        <button onClick={openNewUser} className="btn-primary flex items-center gap-2 text-sm"><MdAdd /> Nuevo Usuario</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {Object.entries(ROLES).map(([key, role]) => {
          const count = users.filter(u => u.role === key).length;
          const Icon = role.icon;
          return (
            <div key={key} className="card flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${role.color}`}><Icon className="text-xl" /></div>
              <div><p className="text-xs text-slate-500">{role.label}</p><p className="text-lg font-bold">{count}</p></div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left p-3 font-semibold text-slate-600">Usuario</th>
              <th className="text-left p-3 font-semibold text-slate-600">Rol</th>
              <th className="text-center p-3 font-semibold text-slate-600">Estado</th>
              <th className="text-center p-3 font-semibold text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const roleInfo = ROLES[u.role] || ROLES.mozo;
              const RoleIcon = roleInfo.icon;
              return (
                <tr key={u.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-slate-600">{u.full_name[0]}</span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{u.full_name}</p>
                        <p className="text-xs text-slate-400">@{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${roleInfo.color}`}>
                      <RoleIcon className="text-sm" /> {roleInfo.label}
                    </span>
                    {String(u.role || '').toLowerCase() === 'cajero' && String(u.caja_station_id || '').trim() && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Caja: {cajaNameById.get(String(u.caja_station_id).trim()) || '—'}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => toggleActive(u)} className={`px-3 py-1 rounded-full text-xs font-bold ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--ui-surface-2)] text-[var(--ui-muted)] border border-[color:var(--ui-border)]'}`}>
                      {u.is_active ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEditUser(u)} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-600 rounded-lg hover:bg-sky-100 text-xs font-medium border border-sky-200">
                        <MdEdit className="text-sm" /> Editar
                      </button>
                      <button onClick={() => openPermissions(u)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 text-xs font-medium border border-emerald-200">
                        <MdSecurity className="text-sm" /> Permisos POS
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => handleDelete(u)} className="p-1.5 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]">
                          <MdDelete className="text-sm" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Editar Usuario */}
      <Modal isOpen={showModal} onClose={closeUserModal} title={editUser ? 'Editar Usuario' : 'Nuevo Usuario'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
            <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="input-field" required placeholder="Nombre del empleado" autoComplete="off" name="user-create-full-name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label><input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="input-field" required placeholder="usuario" autoComplete="off" name="user-create-username" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" required placeholder="email@ejemplo.com" autoComplete="off" name="user-create-email" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña {editUser && <span className="text-slate-400 font-normal">(dejar vacío para no cambiar)</span>}</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-field pr-10" required={!editUser} placeholder={editUser ? 'Escribe nueva contraseña' : '••••••••'} minLength={editUser ? 0 : 4} autoComplete="new-password" name="user-create-password" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPw ? <MdVisibilityOff /> : <MdVisibility />}</button>
            </div>
            {editUser && (
              <p className="text-[11px] text-slate-400 mt-1">
                Por seguridad no se puede mostrar la contraseña actual. Puedes ingresar una nueva y verla con el icono de ojo.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Rol</label>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(ROLES).map(([key, role]) => {
                const Icon = role.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        role: key,
                        caja_station_id: key === 'cajero' ? form.caja_station_id : '',
                      })
                    }
                    className={`p-3 rounded-xl border-2 text-center transition-all ${form.role === key ? 'border-gold-500 bg-gold-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <Icon className={`text-2xl mx-auto mb-1 ${form.role === key ? 'text-gold-600' : 'text-slate-400'}`} />
                    <p className="text-xs font-medium">{role.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{role.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
          {String(form.role || '').toLowerCase() === 'cajero' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Caja asignada</label>
              <select
                value={String(form.caja_station_id || '')}
                onChange={(e) => setForm({ ...form, caja_station_id: e.target.value })}
                className="input-field"
              >
                <option value="">— Seleccione una caja —</option>
                {cajaOptionsForForm.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {cajaOptionsForForm.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No hay cajas activas disponibles (o ya están asignadas a otros cajeros). Cree una en Configuración → Cajas.
                </p>
              )}
              {cajaOptionsForForm.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  Si es el primer cajero del local, puede dejar «Seleccione» y se vinculará solo a la Caja Principal.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label><input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" placeholder="999 999 999" autoComplete="off" name="user-create-phone" /></div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
              <select
                value={Number(form.is_active || 0) === 1 ? 1 : 0}
                onChange={(e) => setForm({ ...form, is_active: Number(e.target.value || 0) === 1 ? 1 : 0 })}
                className="input-field"
              >
                <option value={1}>Activo</option>
                <option value={0}>Inactivo</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeUserModal} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">{editUser ? 'Guardar' : 'Crear Usuario'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal Permisos POS */}
      <Modal isOpen={showPermsModal} onClose={() => setShowPermsModal(false)} title={`Permisos POS — ${permsUser?.full_name || ''}`} size="md">
        {permsLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-slate-500">Rol actual: <span className="font-semibold text-slate-700">{ROLES[permsUser?.role]?.label}</span></p>
                <p className="text-xs text-slate-400 mt-0.5">Los módulos marcados serán accesibles para este usuario</p>
              </div>
              <button onClick={resetToDefaults} className="text-xs px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                Restaurar por defecto
              </button>
            </div>

            <div className="space-y-1 max-h-96 overflow-y-auto">
              {ALL_MODULES.map(mod => {
                const Icon = mod.icon;
                const isDefault = mod.defaultRoles.includes(permsUser?.role);
                const isEnabled = perms[mod.id] || false;
                return (
                  <div
                    key={mod.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                      isEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                    }`}
                    onClick={() => togglePerm(mod.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isEnabled ? 'bg-emerald-100' : 'bg-slate-200'}`}>
                        <Icon className={`text-lg ${isEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isEnabled ? 'text-emerald-800' : 'text-slate-500'}`}>{mod.label}</p>
                        {isDefault && <p className="text-[10px] text-slate-400">Incluido por defecto en rol {ROLES[permsUser?.role]?.label}</p>}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isEnabled} onChange={() => togglePerm(mod.id)} className="sr-only peer" />
                      <div className="w-10 h-5 bg-slate-300 peer-checked:bg-emerald-500 rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 pt-4 mt-4 border-t border-slate-200">
              <button onClick={() => setShowPermsModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={savePermissions} className="btn-primary flex-1 flex items-center justify-center gap-2"><MdSave /> Guardar Permisos</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SalonMesasSection() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salones, setSalones] = useState([
    { id: 'principal', name: 'Salón Principal', description: 'Área principal del restaurante' },
  ]);
  const [showSalonModal, setShowSalonModal] = useState(false);
  const [editSalon, setEditSalon] = useState(null);
  const [salonForm, setSalonForm] = useState({ name: '', description: '' });

  const [showMesaModal, setShowMesaModal] = useState(false);
  const [editMesa, setEditMesa] = useState(null);
  const [mesaForm, setMesaForm] = useState({ number: '', name: '', capacity: 4, zone: 'principal' });

  const loadTables = () => {
    api.get('/tables').then(data => {
      setTables(data);
      const zones = [...new Set(data.map(t => t.zone || 'principal'))];
      setSalones(prev => {
        const existing = prev.map(s => s.id);
        const newSalones = [...prev];
        zones.forEach(z => {
          if (!existing.includes(z)) {
            newSalones.push({ id: z, name: z.charAt(0).toUpperCase() + z.slice(1), description: '' });
          }
        });
        return newSalones;
      });
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { loadTables(); }, []);

  const openNewSalon = () => { setEditSalon(null); setSalonForm({ name: '', description: '' }); setShowSalonModal(true); };
  const openEditSalon = (s) => { setEditSalon(s); setSalonForm({ name: s.name, description: s.description || '' }); setShowSalonModal(true); };

  const handleSalonSubmit = (e) => {
    e.preventDefault();
    if (editSalon) {
      setSalones(prev => prev.map(s => s.id === editSalon.id ? { ...s, ...salonForm } : s));
      toast.success('Salón actualizado');
    } else {
      const id = salonForm.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      setSalones(prev => [...prev, { id, ...salonForm }]);
      toast.success('Salón creado');
    }
    setShowSalonModal(false);
  };

  const deleteSalon = (s) => {
    const mesasEnSalon = tables.filter(t => (t.zone || 'principal') === s.id);
    if (mesasEnSalon.length > 0) return toast.error('Elimina primero las mesas de este salón');
    if (!confirm(`¿Eliminar salón "${s.name}"?`)) return;
    setSalones(prev => prev.filter(sal => sal.id !== s.id));
    toast.success('Salón eliminado');
  };

  const openNewMesa = (salonId) => {
    const mesasSalon = tables.filter(t => (t.zone || 'principal') === salonId);
    const nextNum = tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1;
    setEditMesa(null);
    setMesaForm({ number: nextNum, name: '', capacity: 4, zone: salonId });
    setShowMesaModal(true);
  };

  const openEditMesa = (t) => {
    setEditMesa(t);
    setMesaForm({ number: t.number, name: t.name || '', capacity: t.capacity || 4, zone: t.zone || 'principal' });
    setShowMesaModal(true);
  };

  const handleMesaSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editMesa) {
        await api.put(`/tables/${editMesa.id}`, mesaForm);
        toast.success('Mesa actualizada');
      } else {
        await api.post('/tables', { ...mesaForm, name: mesaForm.name || `Mesa ${mesaForm.number}` });
        toast.success('Mesa creada');
      }
      setShowMesaModal(false);
      loadTables();
    } catch (err) { toast.error(err.message); }
  };

  const deleteMesa = async (t) => {
    if (!confirm(`¿Eliminar "${t.name || 'Mesa ' + t.number}"?`)) return;
    try {
      await api.delete(`/tables/${t.id}`);
      toast.success('Mesa eliminada');
      loadTables();
    } catch (err) { toast.error(err.message); }
  };

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{salones.length} salón(es) · {tables.length} mesa(s) en total</p>
        <button onClick={openNewSalon} className="btn-primary flex items-center gap-2 text-sm"><MdAdd /> Nuevo Salón</button>
      </div>

      {salones.map(salon => {
        const mesasSalon = tables.filter(t => (t.zone || 'principal') === salon.id);
        return (
          <div key={salon.id} className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gold-100 rounded-xl flex items-center justify-center">
                  <MdTableRestaurant className="text-xl text-gold-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{salon.name}</h3>
                  {salon.description && <p className="text-xs text-slate-400">{salon.description}</p>}
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">{mesasSalon.length} mesas</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openNewMesa(salon.id)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 text-xs rounded-lg hover:bg-emerald-100 font-medium">
                  <MdAdd /> Agregar Mesa
                </button>
                <button onClick={() => openEditSalon(salon)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><MdEdit /></button>
                <button onClick={() => deleteSalon(salon)} className="p-2 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]"><MdDelete /></button>
              </div>
            </div>

            {mesasSalon.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
                <MdTableRestaurant className="text-3xl text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No hay mesas en este salón</p>
                <button onClick={() => openNewMesa(salon.id)} className="text-xs text-gold-600 font-medium mt-1 hover:underline">Agregar primera mesa</button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left p-3 font-semibold text-slate-600">Mesa</th>
                      <th className="text-left p-3 font-semibold text-slate-600">Nombre</th>
                      <th className="text-center p-3 font-semibold text-slate-600">Personas</th>
                      <th className="text-center p-3 font-semibold text-slate-600">Estado</th>
                      <th className="text-center p-3 font-semibold text-slate-600 w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesasSalon.map(t => (
                      <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              t.status === 'occupied' ? 'bg-[#DBEAFE]' : t.status === 'reserved' ? 'bg-gold-100' : 'bg-emerald-100'
                            }`}>
                              <span className={`text-xs font-bold ${
                                t.status === 'occupied' ? 'text-[#1D4ED8]' : t.status === 'reserved' ? 'text-gold-600' : 'text-emerald-600'
                              }`}>#{t.number}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 font-medium text-slate-700">{t.name || `Mesa ${t.number}`}</td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
                            <MdPeople className="text-sm" /> {t.capacity}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.status === 'occupied' ? 'bg-[#DBEAFE] text-[#1D4ED8]' :
                            t.status === 'reserved' ? 'bg-gold-100 text-gold-700' :
                            t.status === 'maintenance' ? 'bg-slate-200 text-slate-600' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {t.status === 'occupied' ? 'Ocupada' : t.status === 'reserved' ? 'Reservada' : t.status === 'maintenance' ? 'Mantenimiento' : 'Disponible'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditMesa(t)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"><MdEdit className="text-sm" /></button>
                            <button onClick={() => deleteMesa(t)} className="p-1.5 hover:bg-[var(--ui-sidebar-hover)] rounded-lg text-slate-400 hover:text-[var(--ui-accent)]"><MdDelete className="text-sm" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* SALON MODAL */}
      <Modal isOpen={showSalonModal} onClose={() => setShowSalonModal(false)} title={editSalon ? 'Editar Salón' : 'Nuevo Salón'} size="sm">
        <form onSubmit={handleSalonSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Salón</label><input value={salonForm.name} onChange={e => setSalonForm({ ...salonForm, name: e.target.value })} className="input-field" required placeholder="Ej: Terraza, Segundo Piso" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea value={salonForm.description} onChange={e => setSalonForm({ ...salonForm, description: e.target.value })} className="input-field" rows="2" placeholder="Descripción del salón..." /></div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowSalonModal(false)} className="btn-secondary flex-1">Cancelar</button><button type="submit" className="btn-primary flex-1">{editSalon ? 'Guardar' : 'Crear Salón'}</button></div>
        </form>
      </Modal>

      {/* MESA MODAL */}
      <Modal isOpen={showMesaModal} onClose={() => setShowMesaModal(false)} title={editMesa ? 'Editar Mesa' : 'Nueva Mesa'} size="sm">
        <form onSubmit={handleMesaSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Número</label><input type="number" value={mesaForm.number} onChange={e => setMesaForm({ ...mesaForm, number: parseInt(e.target.value) })} className="input-field" required min="1" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Capacidad (personas)</label><input type="number" value={mesaForm.capacity} onChange={e => setMesaForm({ ...mesaForm, capacity: parseInt(e.target.value) })} className="input-field" required min="1" max="20" /></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre (opcional)</label><input value={mesaForm.name} onChange={e => setMesaForm({ ...mesaForm, name: e.target.value })} className="input-field" placeholder={`Mesa ${mesaForm.number}`} /></div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Salón</label>
            <select value={mesaForm.zone} onChange={e => setMesaForm({ ...mesaForm, zone: e.target.value })} className="input-field">
              {salones.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3"><button type="button" onClick={() => setShowMesaModal(false)} className="btn-secondary flex-1">Cancelar</button><button type="submit" className="btn-primary flex-1">{editMesa ? 'Guardar' : 'Crear Mesa'}</button></div>
        </form>
      </Modal>
    </div>
  );
}
