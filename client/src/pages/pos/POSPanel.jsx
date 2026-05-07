import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import {
  api,
  checkPrintingHealth,
  electronPrinting,
  formatCurrency,
  formatPeDateTimeLine,
  formatPeDateTimeParts,
  getPaymentMethodOptions,
  hasElectronPrinting,
  normalizeUsbPrinterList,
  PAYMENT_METHODS,
  printingUnreachableMessage,
  resolveMediaUrl,
} from '../../utils/api';
import { KITCHEN_TAKEOUT_NOTE, orderHasTakeoutNote, buildPrecuentaPlainText, buildNotaVentaPlainText } from '../../utils/ticketPlainText';
import { showStockInOrderingUI } from '../../utils/productStockDisplay';
import { billLineDisplayName, billLineKey, groupItemsByProductNameForBill } from '../../utils/mesaOrderLines';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import { useStaffOrderCart } from '../../hooks/useStaffOrderCart';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import StaffDineInOrderUI from '../../components/StaffDineInOrderUI';
import StaffMesaPedidoTabs from '../../components/StaffMesaPedidoTabs';
import StaffModifierPromptModal from '../../components/StaffModifierPromptModal';
import {
  MdPointOfSale, MdTableRestaurant, MdReceipt,
  MdCheckCircle, MdAttachMoney, MdPeople, MdClose,
  MdAccountBalanceWallet, MdTrendingUp, MdTrendingDown,
  MdRestaurantMenu,
  MdAccessTime, MdPersonAdd, MdEmail, MdSearch,
  MdDeliveryDining,
  MdEdit, MdDelete, MdVisibility, MdPrint, MdSave,
} from 'react-icons/md';

/** Mesa sintética al cobrar cuenta desde Clientes (no existe fila en `tables`). */
const POS_ADMIN_REGISTER_KEY = 'posAdminRegisterId';
const DEFAULT_PRINTING_CONFIG = {
  caja: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, paperWidth: 80, anchoPapel: 80 },
  cocina: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, paperWidth: 80, anchoPapel: 80 },
  bar: { tipo: 'usb', nombre: '', ip: '', puerto: 9100, autoPrint: true, paperWidth: 80, anchoPapel: 80 },
};

const CLIENT_CHECKOUT_TABLE_PREFIX = 'client-checkout:';
function isClientCheckoutTable(table) {
  return Boolean(table && String(table.id || '').startsWith(CLIENT_CHECKOUT_TABLE_PREFIX));
}

/** Recuadro sintético en caja: un slot por pedido delivery pendiente de cobro (misma UX que mesa). */
const POS_DELIVERY_SLOT_PREFIX = 'pos-delivery-slot:';
function isDeliveryCheckoutTable(table) {
  return Boolean(table && String(table.id || '').startsWith(POS_DELIVERY_SLOT_PREFIX));
}
function deliveryOrderIdFromSlotTable(table) {
  return String(table?.id || '').slice(POS_DELIVERY_SLOT_PREFIX.length);
}
const CAJA_OPTIONS = [
  { id: 'cobrar', label: 'Cobrar' },
  { id: 'reservas', label: 'Reservas' },
  { id: 'apertura_cierre', label: 'Apertura y cierre' },
  { id: 'cierres_caja', label: 'Cierres de caja' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'egresos', label: 'Egresos' },
  { id: 'notas_credito', label: 'Notas de credito' },
  { id: 'notas_debito', label: 'Notas de debito' },
  { id: 'consulta_precios', label: 'Consulta de precios' },
  { id: 'impresora', label: 'Impresora' },
];

async function printCajaTicket(payload) {
  try {
    if (hasElectronPrinting()) {
      await electronPrinting.printModule('caja', payload);
    } else {
      await api.printing.post('/printing/print/caja', payload);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'No se pudo imprimir' };
  }
}

const WAREHOUSE_CATEGORY_NAMES = new Set(['PRODUCTOS ALMACEN', 'INSUMOS']);
const DEFAULT_BILLING_FORM = {
  enabled: false,
  doc_type: 'nota_venta',
  customer_doc_type: '0',
  customer_doc_number: '',
  customer_name: '',
  customer_address: '',
  customer_phone: '',
  /** Comprobante: cada ítem del pedido vs una sola línea por consumo */
  invoice_lines_mode: 'detallado',
};
const EMPTY_CUSTOMER_FORM = {
  doc_type: '1',
  doc_number: '',
  name: '',
  phone: '',
  address: '',
  email: '',
};

const normalizeCustomerEmail = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === '@gmail.com') return '';
  if (raw.includes('@')) return raw;
  return `${raw}@gmail.com`;
};

const getOrderChargeTotal = (order) => {
  if (!order) return 0;
  const base = Number(order.subtotal || 0) + Number(order.delivery_fee || 0);
  const discount = Number(order.discount || 0);
  return Math.max(0, base - discount);
};

/** Reconstruye nota y modificador desde `order_items.notes` (mismo formato que al crear el pedido). */
function parseOrderItemNotes(notesStr, product) {
  const s = String(notesStr || '').trim();
  const modId = String(product?.modifier_id || '').trim();
  if (!s) return { itemNote: '', modifierId: modId, modifierOption: '' };
  const parts = s.split(' | ').map((x) => x.trim()).filter(Boolean);
  if (parts.length === 1) {
    const m = parts[0].match(/^([^:]+):\s*(.+)$/);
    if (m && modId) {
      return { itemNote: '', modifierId: modId, modifierOption: m[2].trim() };
    }
    return { itemNote: parts[0], modifierId: modId, modifierOption: '' };
  }
  const itemNote = parts[0];
  const last = parts[parts.length - 1];
  const m = last.match(/^([^:]+):\s*(.+)$/);
  if (m && modId) {
    return { itemNote, modifierId: modId, modifierOption: m[2].trim() };
  }
  return { itemNote: s, modifierId: modId, modifierOption: '' };
}

function canEditOrderLines(order) {
  return (
    order &&
    ['pending', 'preparing'].includes(String(order.status || '')) &&
    String(order.payment_status || 'pending') === 'pending'
  );
}

/** Todos los productos de la mesa agrupados por línea de producto (misma lógica que precuenta/cobro). */
function mergedProductsOnTable(table) {
  const allItems = (table?.orders || []).flatMap((o) => o.items || []);
  return groupItemsByProductNameForBill(allItems);
}

/** Al editar comanda: una fila por línea de producto — ítems iguales (producto/variante/notas/P.unit.) suman cantidad. */
function orderItemsToCart(order, productsById) {
  const m = new Map();
  for (const it of order.items || []) {
    const product = productsById.get(it.product_id);
    const parsed = parseOrderItemNotes(it.notes, product);
    const modId = parsed.modifierId || String(it.modifier_id || '').trim();
    const modOpt = parsed.modifierOption || String(it.modifier_option || '').trim();
    const k = billLineKey(it);
    const qty = Number(it.quantity || 0);
    if (!m.has(k)) {
      m.set(k, {
        line_key: `mg:${order.id}:${k}`,
        source_order_id: order.id,
        product_id: it.product_id,
        name: billLineDisplayName(it),
        price: Number(product?.price ?? it.unit_price ?? 0),
        quantity: 0,
        modifier_id: modId,
        modifier_name: '',
        modifier_option: modOpt,
        note_required: product ? Number(product.note_required || 0) : 0,
        notes: parsed.itemNote,
      });
    }
    const row = m.get(k);
    row.quantity += qty;
  }
  return [...m.values()];
}

function filterUnpaidDeliveryOrdersForCaja(orders) {
  return (orders || [])
    .filter(
      (o) =>
        o.type === 'delivery' &&
        String(o.payment_status || '') !== 'paid' &&
        ['pending', 'preparing', 'ready'].includes(String(o.status || ''))
    )
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
function buildDeliveryCajaSlots(orders) {
  return filterUnpaidDeliveryOrdersForCaja(orders).map((o, idx) => ({
    id: `${POS_DELIVERY_SLOT_PREFIX}${o.id}`,
    number: o.order_number,
    name: `DELIVERY ${idx + 1}`,
    zone: 'delivery',
    orders: [o],
    status: 'occupied',
    order_total: getOrderChargeTotal(o),
    order_count: 1,
  }));
}

export default function POSPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const clientCheckoutOpenedKeyRef = useRef('');
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [register, setRegister] = useState(null);
  const [registerStatus, setRegisterStatus] = useState({ is_open: false, register: null });
  const [dailySales, setDailySales] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableDetail, setTableDetail] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [discountConfig, setDiscountConfig] = useState({ active: false, applied: false, type: 'amount', value: '', reason: '' });
  const [showMenu, setShowMenu] = useState(false);
  const [viewOrdersModal, setViewOrdersModal] = useState(null);
  const [quickSaleMode, setQuickSaleMode] = useState(false);
  const [products, setProducts] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [paymentOptions, setPaymentOptions] = useState(getPaymentMethodOptions(null, { includeOnline: false }));
  const [amountReceived, setAmountReceived] = useState('');
  const [billingForm, setBillingForm] = useState(DEFAULT_BILLING_FORM);
  const [billingResult, setBillingResult] = useState(null);
  const {
    cart,
    noteEditorLineKey,
    setNoteEditorLineKey,
    modifierPrompt,
    setModifierPrompt,
    addToCart,
    confirmModifierForCart,
    addProductWithoutOptionalModifier,
    updateQty,
    removeFromCart,
    updateItemNote,
    cartTotal,
    resetCart,
    setCart,
  } = useStaffOrderCart(modifiers);
  const [editingOrderId, setEditingOrderId] = useState('');
  /** Comanda “principal” (nuevas líneas sin `source_order_id` y nota para llevar). */
  const [editingSessionOrderIds, setEditingSessionOrderIds] = useState([]);
  /** Comanda cocina/bar: «PARA LLEVAR» en mayúsculas (orders.notes). Solo mesa/salón, no venta rápida. */
  const [paraLlevarMesa, setParaLlevarMesa] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [consultaPadronLoading, setConsultaPadronLoading] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [sendingCloseMail, setSendingCloseMail] = useState(false);
  const [activeCajaOption, setActiveCajaOption] = useState(searchParams.get('view') || 'cobrar');
  const [printingConfig, setPrintingConfig] = useState(DEFAULT_PRINTING_CONFIG);
  const [detectedPrinters, setDetectedPrinters] = useState([]);
  const [printingBusy, setPrintingBusy] = useState(false);
  const [closingData, setClosingData] = useState(null);
  /** Momento fijo al abrir el cierre (misma referencia que “Cierre” en el arqueo). */
  const [closingAtPreview, setClosingAtPreview] = useState(null);
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [denominations, setDenominations] = useState({
    b200: '',
    b100: '',
    b50: '',
    b20: '',
    b10: '',
    m5: '',
    m2: '',
    m1: '',
    c50: '',
  });
  const [registerHistory, setRegisterHistory] = useState([]);
  const [billingStatus, setBillingStatus] = useState({
    billing_enabled: 0,
    offline_mode: 1,
    auto_retry_enabled: 1,
    provider_reachable: false,
    pending_documents: 0,
    checked_at: '',
  });
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [debitNotes, setDebitNotes] = useState([]);
  const [movementForm, setMovementForm] = useState({ amount: '', concept: '' });
  const [noteForm, setNoteForm] = useState({ amount: '', reason: '' });
  const [priceQuery, setPriceQuery] = useState('');
  const [priceResults, setPriceResults] = useState([]);
  const printRef = useRef(null);
  const [printRestaurantInfo, setPrintRestaurantInfo] = useState({ name: 'Resto-FADEY', logo: '' });
  const { user } = useAuth();
  const [cajaStations, setCajaStations] = useState([]);
  const [adminRegisterId, setAdminRegisterId] = useState(() => {
    try {
      return String(sessionStorage.getItem(POS_ADMIN_REGISTER_KEY) || '').trim();
    } catch {
      return '';
    }
  });

  const appendPosRegisterId = useCallback(
    (path) => {
      const rid = String(adminRegisterId || '').trim();
      if (String(user?.role || '').toLowerCase() !== 'admin' || !rid) return path;
      const sep = path.includes('?') ? '&' : '?';
      return `${path}${sep}register_id=${encodeURIComponent(rid)}`;
    },
    [user?.role, adminRegisterId]
  );

  const posRegisterBody = useCallback(() => {
    const rid = String(adminRegisterId || '').trim();
    if (String(user?.role || '').toLowerCase() !== 'admin' || !rid) return {};
    return { register_id: rid };
  }, [user?.role, adminRegisterId]);
  const openCajaView = (view) => {
    setActiveCajaOption(view);
    setSearchParams({ view }, { replace: true });
  };

  const loadData = async (opts = {}) => {
    try {
      const adminRid =
        opts.adminRegisterOverride !== undefined
          ? String(opts.adminRegisterOverride || '').trim()
          : String(adminRegisterId || '').trim();
      const currentRegPath =
        String(user?.role || '').toLowerCase() === 'admin' && adminRid
          ? `/pos/current-register?register_id=${encodeURIComponent(adminRid)}`
          : '/pos/current-register';
      const [tablesData, reg, status, stationsRes, prods, cats, modifiersData, cfg, daily, reservationsData, ordersData, restaurantRes] = await Promise.all([
        api.get('/tables'),
        api.get(currentRegPath),
        api.get('/pos/register-status'),
        api.get('/pos/caja-stations').catch(() => ({ stations: [] })),
        api.get('/products?active_only=true'),
        api.get('/categories/active'),
        api.get('/admin-modules/modifiers').catch(() => []),
        api.get('/admin-modules/config/app').catch(() => null),
        api.get('/reports/daily').catch(() => null),
        api.get('/admin-modules/reservations').catch(() => []),
        api.get('/orders?limit=600').catch(() => []),
        api.get('/restaurant').catch(() => null),
      ]);
      setCajaStations(Array.isArray(stationsRes?.stations) ? stationsRes.stations : []);
      if (String(user?.role || '').toLowerCase() === 'admin' && adminRid && !reg) {
        try {
          sessionStorage.removeItem(POS_ADMIN_REGISTER_KEY);
        } catch (_) {
          /* noop */
        }
        setAdminRegisterId('');
      }
      setPrintRestaurantInfo({
        name: String(restaurantRes?.name || 'Resto-FADEY').trim() || 'Resto-FADEY',
        logo: resolveMediaUrl(restaurantRes?.logo || ''),
      });
      const visibleCategories = cats.filter(c => !WAREHOUSE_CATEGORY_NAMES.has((c.name || '').toUpperCase()));
      const visibleCategoryIds = new Set(visibleCategories.map(c => c.id));
      const visibleProducts = prods.filter(p => visibleCategoryIds.has(p.category_id));
      setTables(tablesData);
      setReservations(reservationsData || []);
      setAllOrders(ordersData || []);
      setRegister(reg);
      setRegisterStatus(status);
      setProducts(visibleProducts);
      setModifiers(Array.isArray(modifiersData) ? modifiersData : []);
      setCategories(visibleCategories);
      setPaymentOptions(getPaymentMethodOptions(cfg, { includeOnline: false }));
      setDailySales(
        daily?.sales?.total_sales === undefined || daily?.sales?.total_sales === null
          ? null
          : Number(daily.sales.total_sales || 0)
      );
      if (selectedTable) {
        if (isClientCheckoutTable(selectedTable)) {
          const cid = String(selectedTable.id).slice(CLIENT_CHECKOUT_TABLE_PREFIX.length);
          const fresh = (ordersData || []).filter(
            (o) =>
              String(o.customer_id || '') === cid &&
              String(o.payment_status || '') !== 'paid' &&
              String(o.status || '') !== 'cancelled'
          );
          setSelectedTable((prev) =>
            prev && isClientCheckoutTable(prev) ? { ...prev, orders: fresh } : prev
          );
        } else if (isDeliveryCheckoutTable(selectedTable)) {
          const slots = buildDeliveryCajaSlots(ordersData);
          const next = slots.find((s) => s.id === selectedTable.id);
          if (next) setSelectedTable(next);
          else {
            setSelectedTable(null);
            setShowBill(false);
            setSplitMode(false);
            setSelectedOrderIds([]);
          }
        } else {
          const updated = tablesData.find((t) => t.id === selectedTable.id);
          if (updated) setSelectedTable(updated);
        }
      }
      if (tableDetail) {
        if (isDeliveryCheckoutTable(tableDetail)) {
          const slots = buildDeliveryCajaSlots(ordersData);
          const next = slots.find((s) => s.id === tableDetail.id);
          if (next) setTableDetail(next);
          else setTableDetail(null);
        } else {
          const updatedDetail = tablesData.find(t => t.id === tableDetail.id);
          if (updatedDetail) setTableDetail(updatedDetail);
        }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadPrinterConfig = async () => {
    try {
      const cfg = hasElectronPrinting()
        ? await electronPrinting.getConfig()
        : await api.printing.get('/printing/config');
      setPrintingConfig({
        caja: { ...DEFAULT_PRINTING_CONFIG.caja, ...(cfg?.caja || {}) },
        cocina: { ...DEFAULT_PRINTING_CONFIG.cocina, ...(cfg?.cocina || {}) },
        bar: { ...DEFAULT_PRINTING_CONFIG.bar, ...(cfg?.bar || {}) },
      });
    } catch (err) {
      console.warn('[printing] fallback POS config por error de carga:', err?.message || err);
      setPrintingConfig(DEFAULT_PRINTING_CONFIG);
    }
  };

  const detectUsbPrinters = async () => {
    try {
      setPrintingBusy(true);
      if (hasElectronPrinting()) {
        await electronPrinting.health();
      } else {
        await checkPrintingHealth();
      }
      const data = hasElectronPrinting()
        ? await electronPrinting.getPrinters('caja')
        : await api.printing.get('/printers?module=caja');
      setDetectedPrinters(normalizeUsbPrinterList(data));
    } catch (err) {
      toast.error(err.message || printingUnreachableMessage());
    } finally {
      setPrintingBusy(false);
    }
  };

  const savePrinterConfig = async () => {
    try {
      setPrintingBusy(true);
      const next = hasElectronPrinting()
        ? await electronPrinting.saveConfig({ caja: printingConfig.caja })
        : await api.printing.put('/printing/config', { caja: printingConfig.caja });
      setPrintingConfig(next || printingConfig);
      toast.success('Impresora de caja guardada');
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar');
    } finally {
      setPrintingBusy(false);
    }
  };

  useEffect(() => {
    loadData();
    loadPrinterConfig();
  }, []);
  useActiveInterval(loadData, 10000);
  useSocket('order-update', loadData);
  useSocket('table-update', loadData);

  useEffect(() => {
    if (!paymentOptions.some(opt => opt.value === paymentMethod)) {
      setPaymentMethod(paymentOptions[0]?.value || 'efectivo');
    }
  }, [paymentOptions, paymentMethod]);

  useEffect(() => {
    const requestedView = searchParams.get('view');
    const isValidView = CAJA_OPTIONS.some(option => option.id === requestedView);
    if (isValidView && requestedView !== activeCajaOption) {
      setActiveCajaOption(requestedView);
      return;
    }
    if (!isValidView && activeCajaOption !== 'cobrar') {
      setSearchParams({ view: activeCajaOption }, { replace: true });
      return;
    }
    if (!isValidView && !requestedView) {
      setSearchParams({ view: 'cobrar' }, { replace: true });
    }
  }, [activeCajaOption, searchParams, setSearchParams]);

  const loadCajaExtras = async () => {
    try {
      const history = await api.get('/pos/history');
      setRegisterHistory(history);
    } catch {
      setRegisterHistory([]);
    }
    if (!register) return;
    try {
      const [incomeData, expenseData, creditData, debitData] = await Promise.all([
        api.get(appendPosRegisterId('/pos/movements?type=income')),
        api.get(appendPosRegisterId('/pos/movements?type=expense')),
        api.get(appendPosRegisterId('/pos/notes?note_type=credit')),
        api.get(appendPosRegisterId('/pos/notes?note_type=debit')),
      ]);
      setIncomes(incomeData);
      setExpenses(expenseData);
      setCreditNotes(creditData);
      setDebitNotes(debitData);
    } catch {
      setIncomes([]);
      setExpenses([]);
      setCreditNotes([]);
      setDebitNotes([]);
    }
  };

  useEffect(() => { loadCajaExtras(); }, [register?.id, appendPosRegisterId]);

  const loadBillingStatus = async () => {
    try {
      const status = await api.get('/billing/provider-status');
      setBillingStatus(status || {});
    } catch (_) {
      setBillingStatus(prev => ({ ...prev, provider_reachable: false, checked_at: new Date().toISOString() }));
    }
  };

  useEffect(() => {
    loadBillingStatus();
    const timer = setInterval(loadBillingStatus, 15000);
    const handleOnline = () => loadBillingStatus();
    const handleOffline = () => setBillingStatus(prev => ({ ...prev, provider_reachable: false }));
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (billingForm.doc_type === 'factura' && billingForm.customer_doc_type !== '6') {
      setBillingForm(prev => ({ ...prev, customer_doc_type: '6' }));
    }
    if (billingForm.doc_type === 'nota_venta' && billingForm.customer_doc_type !== '0') {
      setBillingForm(prev => ({ ...prev, customer_doc_type: '0' }));
    }
    if (billingForm.doc_type === 'nota_venta' && billingForm.invoice_lines_mode !== 'detallado') {
      setBillingForm(prev => ({ ...prev, invoice_lines_mode: 'detallado' }));
    }
  }, [billingForm.doc_type, billingForm.customer_doc_type, billingForm.invoice_lines_mode]);

  useEffect(() => {
    if (!billingForm.enabled) {
      setMatchedCustomer(null);
      setSearchingCustomer(false);
      return;
    }
    const docNumber = normalizeDocNumber(billingForm.customer_doc_number);
    const docType = getActiveDocType();
    const requiredLength = docType === '6' ? 11 : docType === '1' ? 8 : 0;
    if (!docNumber || (requiredLength && docNumber.length !== requiredLength)) {
      setMatchedCustomer(null);
      setSearchingCustomer(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setSearchingCustomer(true);
        const found = await api.get(`/admin-modules/customers/by-document?doc_number=${encodeURIComponent(docNumber)}`);
        if (cancelled) return;
        setMatchedCustomer(found || null);
        if (found) {
          applyCustomerToBilling(found);
        }
      } catch (_) {
        if (!cancelled) setMatchedCustomer(null);
      } finally {
        if (!cancelled) setSearchingCustomer(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [billingForm.enabled, billingForm.customer_doc_number, billingForm.customer_doc_type, billingForm.doc_type]);

  const denomDefs = [
    { key: 'b200', label: 'Billete S/200', value: 200 },
    { key: 'b100', label: 'Billete S/100', value: 100 },
    { key: 'b50', label: 'Billete S/50', value: 50 },
    { key: 'b20', label: 'Billete S/20', value: 20 },
    { key: 'b10', label: 'Billete S/10', value: 10 },
    { key: 'm5', label: 'Moneda S/5', value: 5 },
    { key: 'm2', label: 'Moneda S/2', value: 2 },
    { key: 'm1', label: 'Moneda S/1', value: 1 },
    { key: 'c50', label: 'Moneda S/0.50', value: 0.5 },
  ];

  const openRegisterForCajero = async () => {
    if (openingAmount === '') return toast.error('Ingresa el monto inicial de caja');
    const amount = parseFloat(openingAmount);
    if (Number.isNaN(amount) || amount < 0) return toast.error('El monto inicial no es válido');
    try {
      const reg = await api.post('/pos/open-register', { opening_amount: amount });
      setRegister(reg);
      setRegisterStatus({ is_open: true, register: { user_id: user?.id, cajero_name: user?.full_name, opened_at: reg.opened_at } });
      setOpeningAmount('');
      toast.success(`Caja abierta con ${formatCurrency(amount)}`);
      await loadData();
    } catch (err) { toast.error(err.message); }
  };

  const openStationRegisterForAdmin = async (stationId) => {
    if (openingAmount === '') return toast.error('Ingresa el monto inicial de caja');
    const amount = parseFloat(openingAmount);
    if (Number.isNaN(amount) || amount < 0) return toast.error('El monto inicial no es válido');
    const sid = String(stationId || '').trim();
    if (!sid) return toast.error('Caja no válida');
    try {
      const reg = await api.post('/pos/open-register', { opening_amount: amount, caja_station_id: sid });
      try {
        sessionStorage.setItem(POS_ADMIN_REGISTER_KEY, reg.id);
      } catch (_) {
        /* noop */
      }
      setAdminRegisterId(reg.id);
      setRegister(reg);
      setRegisterStatus({ is_open: true, register: { user_id: user?.id, cajero_name: user?.full_name, opened_at: reg.opened_at } });
      setOpeningAmount('');
      toast.success(`Caja abierta con ${formatCurrency(amount)}`);
      await loadData({ adminRegisterOverride: reg.id });
    } catch (err) { toast.error(err.message); }
  };

  const attachAdminToRegister = async (registerId) => {
    const rid = String(registerId || '').trim();
    if (!rid) return;
    try {
      sessionStorage.setItem(POS_ADMIN_REGISTER_KEY, rid);
    } catch (_) {
      /* noop */
    }
    setAdminRegisterId(rid);
    await loadData({ adminRegisterOverride: rid });
  };

  const clearAdminRegisterContext = async () => {
    try {
      sessionStorage.removeItem(POS_ADMIN_REGISTER_KEY);
    } catch (_) {
      /* noop */
    }
    setAdminRegisterId('');
    await loadData({ adminRegisterOverride: '' });
  };

  const prepareClose = () => {
    setClosingAtPreview(new Date());
    setClosingData(register);
    setClosingAmount('');
    setClosingNotes('');
    setDenominations({
      b200: '',
      b100: '',
      b50: '',
      b20: '',
      b10: '',
      m5: '',
      m2: '',
      m1: '',
      c50: '',
    });
    setShowCloseModal(true);
  };

  const calculateDenominationTotal = () => {
    return denomDefs.reduce((sum, d) => sum + (parseFloat(denominations[d.key]) || 0) * d.value, 0);
  };

  const updateDenomination = (key, value) => {
    const safeValue = value === '' ? '' : Math.max(0, parseFloat(value) || 0);
    const updated = { ...denominations, [key]: safeValue };
    setDenominations(updated);
    const total = denomDefs.reduce((sum, d) => sum + (parseFloat(updated[d.key]) || 0) * d.value, 0);
    setClosingAmount(total.toFixed(2));
  };

  const closeRegister = async () => {
    if (closingAmount === '') return toast.error('Ingresa el efectivo contado para cerrar caja');
    const amount = parseFloat(closingAmount);
    if (Number.isNaN(amount) || amount < 0) return toast.error('El efectivo contado no es válido');
    try {
      await api.post('/pos/close-register', {
        closing_amount: amount,
        notes: closingNotes,
        arqueo: {
          expected_cash: expectedCash,
          counted_cash: amount,
          difference,
          denominations,
          observations: closingNotes,
        },
        ...posRegisterBody(),
      });
      toast.success('Caja cerrada — Informe guardado');
      setShowCloseModal(false);
      setClosingAtPreview(null);
      setRegister(null);
      if (String(user?.role || '').toLowerCase() === 'admin') {
        try {
          sessionStorage.removeItem(POS_ADMIN_REGISTER_KEY);
        } catch (_) {
          /* noop */
        }
        setAdminRegisterId('');
      }
    } catch (err) { toast.error(err.message); }
  };
  const sendCloseByEmail = async () => {
    if (closingAmount === '') return toast.error('Ingresa el efectivo contado para enviar el reporte');
    const amount = parseFloat(closingAmount);
    if (Number.isNaN(amount) || amount < 0) return toast.error('El efectivo contado no es válido');
    try {
      setSendingCloseMail(true);
      await api.post('/pos/send-close-email', {
        ...posRegisterBody(),
        closing_amount: amount,
        notes: closingNotes,
        arqueo: {
          expected_cash: expectedCash,
          counted_cash: amount,
          difference,
          denominations,
          observations: closingNotes,
        },
      });
      toast.success('Reporte enviado al correo configurado');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingCloseMail(false);
    }
  };

  const handlePrint = async () => {
    const content = printRef.current;
    if (!content) return;
    const textForPrint = String(content.innerText || content.textContent || '')
      .replace(/\r\n/g, '\n')
      .trim()
      .slice(0, 12000);
    if (!textForPrint) {
      toast.error('No hay contenido para imprimir');
      return;
    }
    const r = await printCajaTicket({
      title: 'PRE CUENTA',
      mesa: selectedTable.name,
      items: groupedPrecuenta.map((row) => ({ quantity: row.qty, name: row.name })),
      text: plain,
    });
    if (r.ok) toast.success('Acción completada');
    else toast.error(r.error || 'No se pudo imprimir');
  };

  const resetBillingForm = () => {
    setBillingForm(DEFAULT_BILLING_FORM);
    setBillingResult(null);
    setMatchedCustomer(null);
    setSearchingCustomer(false);
  };

  const normalizeDocNumber = (value) => String(value || '').replace(/\D/g, '');

  const getActiveDocType = () => (billingForm.doc_type === 'factura' ? '6' : billingForm.customer_doc_type);

  const handleConsultaPadron = useCallback(async () => {
    const docType = billingForm.doc_type === 'factura' ? '6' : billingForm.customer_doc_type;
    if (docType !== '1' && docType !== '6') {
      toast.error('Seleccione DNI o RUC');
      return;
    }
    const num = normalizeDocNumber(billingForm.customer_doc_number);
    const okLen = docType === '6' ? num.length === 11 : num.length === 8;
    if (!okLen) {
      toast.error(docType === '6' ? 'Ingrese RUC de 11 dígitos' : 'Ingrese DNI de 8 dígitos');
      return;
    }
    try {
      setConsultaPadronLoading(true);
      const data = await api.get(
        `/admin-modules/consulta-padron?doc_type=${encodeURIComponent(docType)}&numero=${encodeURIComponent(num)}`
      );
      const nombre = String(data?.nombre || '').trim();
      if (!nombre) {
        toast.error('No se recibió el nombre del padrón');
        return;
      }
      setBillingForm((prev) => ({
        ...prev,
        customer_name: nombre,
        customer_address:
          data?.direccion != null && String(data.direccion).trim()
            ? String(data.direccion).trim()
            : prev.customer_address,
      }));
      setMatchedCustomer(null);
      toast.success(docType === '6' ? 'Razón social obtenida del padrón' : 'Nombre obtenido del padrón');
    } catch (err) {
      toast.error(err?.message || 'No se pudo consultar el padrón');
    } finally {
      setConsultaPadronLoading(false);
    }
  }, [billingForm.customer_doc_number, billingForm.doc_type, billingForm.customer_doc_type]);

  const applyCustomerToBilling = (customer) => {
    if (!customer) return;
    setBillingForm(prev => ({
      ...prev,
      customer_doc_type: String(customer.doc_type || prev.customer_doc_type || '1'),
      customer_doc_number: String(customer.doc_number || prev.customer_doc_number || ''),
      customer_name: String(customer.name || prev.customer_name || ''),
      customer_address: String(customer.address || prev.customer_address || ''),
      customer_phone: String(customer.phone || prev.customer_phone || ''),
    }));
  };

  /** Desde Clientes: abrir modal de cobro con pedidos del cliente (misma API que mesa). */
  useEffect(() => {
    const payload = location.state?.clientCheckout;
    if (!payload?.customerId || !Array.isArray(payload.orderIds) || !payload.orderIds.length) return;

    const byId = new Map((allOrders || []).map((o) => [o.id, o]));
    const missing = payload.orderIds.some((id) => !byId.has(id));
    if (missing) return;

    const orders = payload.orderIds
      .map((id) => byId.get(id))
      .filter((o) => String(o.payment_status || '') !== 'paid' && String(o.status || '') !== 'cancelled');

    const navKey = `${payload.customerId}:${payload.orderIds.slice().sort().join(',')}`;

    if (!orders.length) {
      clientCheckoutOpenedKeyRef.current = '';
      toast.error('Esos pedidos ya no están pendientes de cobro.');
      navigate('/admin/caja?view=cobrar', { replace: true, state: {} });
      return;
    }

    if (clientCheckoutOpenedKeyRef.current === navKey) return;
    clientCheckoutOpenedKeyRef.current = navKey;

    setActiveCajaOption('cobrar');
    setSearchParams({ view: 'cobrar' }, { replace: true });
    setTableDetail(null);
    setSelectedTable({
      id: `${CLIENT_CHECKOUT_TABLE_PREFIX}${payload.customerId}`,
      name: String(payload.customerName || 'Cliente').trim() || 'Cliente',
      number: '',
      orders,
    });
    setShowBill(true);
    setPaymentMethod('efectivo');
    setAmountReceived('');
    setSplitMode(false);
    setSelectedOrderIds(orders.map((o) => o.id));
    setDiscountConfig({ active: false, applied: false, type: 'amount', value: '', reason: '' });
    resetBillingForm();
    if (payload.customerForBilling) {
      applyCustomerToBilling(payload.customerForBilling);
    }
    toast.success(`Caja: cobrar cuenta de ${payload.customerName || 'cliente'}`);
    navigate('/admin/caja?view=cobrar', { replace: true, state: {} });
  }, [location.state, allOrders, navigate, setSearchParams]);

  const billingSuccessSummary = (doc) => {
    const num = String(doc?.full_number || '').trim();
    const st = String(doc?.provider_status || '').toLowerCase();
    const sunat = String(doc?.sunat_description || '').trim();
    if (st === 'accepted') {
      return sunat ? `${num} — ${sunat}` : `${num} — aceptado por SUNAT`;
    }
    if (st === 'pending') {
      return `${num || 'Comprobante'} — guardado; pendiente de sincronizar con SUNAT`;
    }
    if (st === 'local') {
      return num ? `${num} — nota de venta (registro local)` : 'Nota de venta (registro local)';
    }
    return num || 'Comprobante registrado';
  };

  const validateBillingData = () => {
    if (!billingForm.enabled) return null;
    if (billingForm.doc_type === 'nota_venta') return null;
    const docNumber = String(billingForm.customer_doc_number || '').trim();
    const customerName = String(billingForm.customer_name || '').trim();
    if (billingForm.doc_type === 'factura') {
      if (!/^\d{11}$/.test(docNumber)) return 'Para factura debes ingresar RUC válido (11 dígitos)';
      if (!customerName) return 'Para factura debes ingresar razón social';
    }
    if (billingForm.customer_doc_type === '1' && docNumber && !/^\d{8}$/.test(docNumber)) {
      return 'DNI inválido (8 dígitos)';
    }
    if (billingForm.customer_doc_type === '6' && docNumber && !/^\d{11}$/.test(docNumber)) {
      return 'RUC inválido (11 dígitos)';
    }
    return null;
  };

  const issueElectronicDocument = async (orderId) => {
    const doc = await api.post('/billing/issue', {
      order_id: orderId,
      doc_type: billingForm.doc_type,
      invoice_lines_mode: billingForm.doc_type === 'nota_venta' ? 'detallado' : billingForm.invoice_lines_mode,
      customer: {
        doc_type: billingForm.customer_doc_type,
        doc_number: billingForm.customer_doc_number,
        name: billingForm.customer_name,
        address: billingForm.customer_address,
        phone: billingForm.customer_phone,
      },
    });
    setBillingResult(doc);
    return doc;
  };

  const openCustomerModal = () => {
    const initialDocType = getActiveDocType();
    setCustomerForm({
      ...EMPTY_CUSTOMER_FORM,
      doc_type: initialDocType === '0' ? '1' : initialDocType,
      doc_number: normalizeDocNumber(billingForm.customer_doc_number),
      name: String(billingForm.customer_name || ''),
      phone: String(billingForm.customer_phone || ''),
      address: String(billingForm.customer_address || ''),
    });
    setShowCustomerModal(true);
  };

  const saveCustomerFromBilling = async () => {
    const docType = String(customerForm.doc_type || '1');
    const docNumber = normalizeDocNumber(customerForm.doc_number);
    const name = String(customerForm.name || '').trim();
    if (!name) return toast.error('Ingresa el nombre del cliente');
    if (docType === '1' && docNumber && !/^\d{8}$/.test(docNumber)) {
      return toast.error('DNI inválido (8 dígitos)');
    }
    if (docType === '6' && docNumber && !/^\d{11}$/.test(docNumber)) {
      return toast.error('RUC inválido (11 dígitos)');
    }
    try {
      setSavingCustomer(true);
      const created = await api.post('/admin-modules/customers', {
        name,
        doc_type: docType,
        doc_number: docNumber,
        phone: String(customerForm.phone || '').trim(),
        address: String(customerForm.address || '').trim(),
        email: normalizeCustomerEmail(customerForm.email),
      });
      applyCustomerToBilling(created);
      setBillingForm((prev) => ({
        ...prev,
        customer_phone: String(customerForm.phone || created?.phone || prev.customer_phone || ''),
      }));
      setMatchedCustomer(created);
      setShowCustomerModal(false);
      setCustomerForm(EMPTY_CUSTOMER_FORM);
      toast.success('Cliente guardado y cargado en el comprobante');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingCustomer(false);
    }
  };

  const cobrarMesa = async () => {
    if (!selectedTable) return;
    const payableOrders = splitMode
      ? (selectedTable.orders || []).filter(o => selectedOrderIds.includes(o.id))
      : (selectedTable.orders || []);
    if (payableOrders.length === 0) return toast.error('Selecciona al menos un pedido para cobrar');
    if (paymentMethod === 'efectivo' && receivedAmount < payableTotal) {
      return toast.error(`Monto insuficiente. Falta ${formatCurrency(payableTotal - receivedAmount)}`);
    }
    const billingError = validateBillingData();
    if (billingError) return toast.error(billingError);
    try {
      const discountValue = Math.max(0, parseFloat(discountConfig.value) || 0);
      const totalOrdersAmount = payableOrders.reduce((sum, o) => sum + getOrderChargeTotal(o), 0);
      const totalDiscountToApply = !discountConfig.applied
        ? 0
        : (discountConfig.type === 'percent'
          ? Math.min(totalOrdersAmount, totalOrdersAmount * (discountValue / 100))
          : Math.min(totalOrdersAmount, discountValue));
      let remainingAmountDiscount = totalDiscountToApply;
      const discountsByOrder = {};
      for (let idx = 0; idx < payableOrders.length; idx += 1) {
        const order = payableOrders[idx];
        const orderTotal = getOrderChargeTotal(order);
        let extraDiscount = 0;
        if (totalDiscountToApply > 0) {
          if (discountConfig.type === 'percent') {
            extraDiscount = Math.min(orderTotal, orderTotal * (discountValue / 100));
          } else if (idx === payableOrders.length - 1) {
            extraDiscount = Math.min(orderTotal, remainingAmountDiscount);
          } else {
            extraDiscount = Math.min(orderTotal, (totalDiscountToApply * orderTotal) / (totalOrdersAmount || 1));
          }
          remainingAmountDiscount = Math.max(0, remainingAmountDiscount - extraDiscount);
          discountsByOrder[order.id] = extraDiscount;
        }
      }

      const issuedDocs = [];
      if (billingForm.enabled) {
        for (const order of payableOrders) {
          const doc = await issueElectronicDocument(order.id);
          issuedDocs.push(doc);
        }
      }

      await api.post('/pos/checkout-table', {
        ...posRegisterBody(),
        order_ids: payableOrders.map(o => o.id),
        payment_method: paymentMethod,
        discount_reason: discountConfig.reason,
        discounts_by_order: discountsByOrder,
      });

      if (!isClientCheckoutTable(selectedTable) && !isDeliveryCheckoutTable(selectedTable)) {
        const updatedTable = await api.get(`/tables/${selectedTable.id}`);
        if (!updatedTable.orders || updatedTable.orders.length === 0) {
          await api.patch(`/tables/${selectedTable.id}/status`, { status: 'available' });
        }
      }
      if (issuedDocs.length > 0) {
        const detail = issuedDocs.map(billingSuccessSummary).join(' · ');
        toast.success(`${payableOrders.length} pedido(s) cobrados. ${detail}`);
        const pdf = issuedDocs.find((d) => d?.pdf_url)?.pdf_url;
        /** Sin resolveMediaUrl, `/uploads/...` se abre en el host del front (p. ej. Vercel) y la SPA puede redirigir a /admin en lugar del PDF en la API. */
        if (pdf && billingForm.doc_type !== 'nota_venta') {
          window.open(resolveMediaUrl(pdf), '_blank', 'noopener,noreferrer');
        }
        if (billingForm.doc_type === 'nota_venta') {
          await printNotaVenta({
            tableName: selectedTable?.name || '',
            orders: payableOrders,
            docs: issuedDocs,
            customer: {
              doc_number: billingForm.customer_doc_number,
              name: billingForm.customer_name,
              address: billingForm.customer_address,
              phone: billingForm.customer_phone,
            },
          });
        }
      } else {
        toast.success(`${payableOrders.length} pedido(s) cobrados en ${selectedTable.name}`);
      }
      setShowBill(false);
      setSplitMode(false);
      setSelectedOrderIds([]);
      setDiscountConfig({ active: false, applied: false, type: 'amount', value: '', reason: '' });
      clientCheckoutOpenedKeyRef.current = '';
      setSelectedTable(null);
      setAmountReceived('');
      resetBillingForm();
      loadData();
    } catch (err) { toast.error(err.message); }
  };

  const toggleOrderSelection = (orderId) => {
    setSelectedOrderIds(prev => prev.includes(orderId)
      ? prev.filter(id => id !== orderId)
      : [...prev, orderId]);
  };

  const togglePartialSelection = () => {
    const allIds = (selectedTable?.orders || []).map((o) => o.id);
    if (splitMode) {
      setSplitMode(false);
      setSelectedOrderIds(allIds);
    } else {
      setSplitMode(true);
      // Todas seleccionadas al entrar: el cajero desmarca lo que no cobra (antes quedaba 0 y el total en S/ 0.00)
      setSelectedOrderIds(allIds);
    }
  };

  const handleDiscountButton = () => {
    if (discountConfig.applied) {
      setDiscountConfig({ active: false, applied: false, type: 'amount', value: '', reason: '' });
      toast.success('Descuento anulado');
      return;
    }

    if (!discountConfig.active) {
      setDiscountConfig(prev => ({ ...prev, active: true }));
      return;
    }

    const value = parseFloat(discountConfig.value);
    if (Number.isNaN(value) || value <= 0) return toast.error('Ingresa un descuento válido');
    if (!discountConfig.reason.trim()) return toast.error('Ingresa el motivo del descuento');

    setDiscountConfig(prev => ({ ...prev, active: false, applied: true }));
    toast.success('Descuento aplicado a la cuenta');
  };

  const openMenuForTable = (table) => {
    if (isDeliveryCheckoutTable(table)) return;
    setQuickSaleMode(false);
    setEditingOrderId('');
    setEditingSessionOrderIds([]);
    setParaLlevarMesa(false);
    setSelectedTable(table);
    setShowMenu(true);
    resetCart();
    setSearch('');
    setSelectedCat('all');
    setAmountReceived('');
    resetBillingForm();
  };

  /** @returns {boolean} si se abrió el editor */
  const openEditOrderFromToolbar = () => {
    const list = tableDetail?.orders || [];
    const editable = list.filter((o) => canEditOrderLines(o));
    if (editable.length === 0) {
      if (list.length === 0) {
        toast.error('No hay pedidos para modificar.');
      } else {
        toast.error('Ninguna comanda se puede modificar desde aquí (estado o cobro).');
      }
      return;
    }
    const sorted = [...editable].sort((a, b) => {
      const na = Number(a.order_number);
      const nb = Number(b.order_number);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    const primary = sorted[0];
    setQuickSaleMode(false);
    setEditingSessionOrderIds(editable.map((o) => o.id));
    setEditingOrderId(primary.id);
    setParaLlevarMesa(editable.some((o) => orderHasTakeoutNote(o)));
    setSelectedTable(tableDetail);
    setSearch('');
    setSelectedCat('all');
    setCart(editable.flatMap((o) => orderItemsToCart(o, productsById)));
    setShowMenu(true);
    setAmountReceived('');
    resetBillingForm();
  };

  const confirmCancelOrder = async (order) => {
    if (!order?.id) return false;
    const ok = window.confirm(`¿Anular el pedido #${order.order_number}? Se devolverá stock si aplica.`);
    if (!ok) return false;
    const tid = toast.loading('Anulando pedido…');
    try {
      await api.put(`/orders/${order.id}/status`, {
        status: 'cancelled',
        cancellation_reason: 'Anulado desde caja',
      });
      toast.success('Pedido anulado', { id: tid });
      await loadData();
      return true;
    } catch (err) {
      toast.error(err.message || 'No se pudo anular', { id: tid });
      return false;
    }
  };

  /** Modificar pedido: carrito vacío → anular pedido y liberar mesa si no quedan pedidos activos. */
  const liberarMesaDesdeEdicionPedidoVacio = async () => {
    if (!editingOrderId || !selectedTable) return;
    const idsToCancel =
      editingSessionOrderIds.length > 0 ? editingSessionOrderIds : [editingOrderId];
    const ok = window.confirm(
      idsToCancel.length > 1
        ? `¿Anular ${idsToCancel.length} pedidos de esta mesa y marcarla libre si no queda ningún pedido activo?`
        : '¿Anular este pedido sin productos y marcar la mesa como libre si no quedan otros pedidos activos?'
    );
    if (!ok) return;
    const tid = toast.loading('Liberando mesa…');
    try {
      for (const oid of idsToCancel) {
        await api.put(`/orders/${oid}/status`, {
          status: 'cancelled',
          cancellation_reason: 'Pedido vaciado desde caja — liberar mesa',
        });
      }
      if (!isClientCheckoutTable(selectedTable) && !isDeliveryCheckoutTable(selectedTable) && selectedTable.id) {
        const updatedTable = await api.get(`/tables/${selectedTable.id}`);
        const remaining = (updatedTable.orders || []).filter((o) =>
          ['pending', 'preparing', 'ready'].includes(String(o.status || ''))
        );
        if (remaining.length === 0) {
          await api.patch(`/tables/${selectedTable.id}/status`, { status: 'available' });
        }
      }
      toast.success(
        idsToCancel.length > 1
          ? 'Pedidos anulados. Mesa liberada si no había otros pedidos activos.'
          : 'Pedido anulado. Mesa liberada si no había otros pedidos activos.',
        { id: tid }
      );
      setShowMenu(false);
      setEditingOrderId('');
      setEditingSessionOrderIds([]);
      resetCart();
      loadData();
    } catch (err) {
      toast.error(err.message || 'No se pudo completar', { id: tid });
    }
  };

  const openQuickSaleMenu = () => {
    setQuickSaleMode(true);
    setEditingOrderId('');
    setEditingSessionOrderIds([]);
    setParaLlevarMesa(false);
    setSelectedTable(null);
    setPaymentMethod('efectivo');
    setShowMenu(true);
    resetCart();
    setSearch('');
    setSelectedCat('all');
    setAmountReceived('');
    resetBillingForm();
  };

  const receivedAmount = Math.max(0, parseFloat(amountReceived) || 0);
  const quickSaleChange = Math.max(0, receivedAmount - cartTotal);
  const quickSaleMissing = Math.max(0, cartTotal - receivedAmount);

  const showParaLlevarToggle =
    !quickSaleMode &&
    selectedTable &&
    !isClientCheckoutTable(selectedTable) &&
    !isDeliveryCheckoutTable(selectedTable);

  const paraLlevarToggleButton = showParaLlevarToggle ? (
    <button
      type="button"
      onClick={() => setParaLlevarMesa((v) => !v)}
      className={`w-1/2 mx-auto rounded-lg border py-1 px-2 text-xs font-semibold uppercase tracking-wide transition-colors flex items-center justify-center ${
        paraLlevarMesa
          ? 'bg-[var(--ui-accent)] text-white border-transparent shadow-sm'
          : 'border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] text-[#E5E7EB] hover:bg-[var(--ui-sidebar-hover)]'
      }`}
    >
      PARA LLEVAR
    </button>
  ) : null;

  const submitOrder = async () => {
    if (cart.length === 0) {
      if (editingOrderId) {
        return toast.error('Quitaste todos los productos. Pulsa «Liberar mesa» para anular el pedido.');
      }
      return toast.error('Agrega productos al pedido');
    }
    const missingRequiredNote = cart.find(i => Number(i.note_required || 0) === 1 && !String(i.notes || '').trim());
    if (missingRequiredNote) {
      setNoteEditorLineKey(missingRequiredNote.line_key);
      return toast.error(`"${missingRequiredNote.name}" requiere una nota obligatoria`);
    }
    if (quickSaleMode && paymentMethod === 'efectivo' && receivedAmount < cartTotal) {
      return toast.error(`Monto insuficiente. Falta ${formatCurrency(cartTotal - receivedAmount)}`);
    }
    if (quickSaleMode) {
      const billingError = validateBillingData();
      if (billingError) return toast.error(billingError);
    }
    const tid = toast.loading(
      editingOrderId ? 'Guardando cambios…' : quickSaleMode ? 'Registrando venta…' : 'Enviando pedido…'
    );
    try {
      if (editingOrderId) {
        const noteOrder = paraLlevarMesa ? KITCHEN_TAKEOUT_NOTE : '';
        const sessionIds =
          editingSessionOrderIds.length > 0 ? editingSessionOrderIds : [editingOrderId];
        const byOrder = new Map();
        for (const i of cart) {
          const oid = String(i.source_order_id || editingOrderId);
          if (!byOrder.has(oid)) byOrder.set(oid, []);
          byOrder.get(oid).push(i);
        }
        const linesPayload = (lines) =>
          lines.map((x) => ({
            product_id: x.product_id,
            quantity: x.quantity,
            modifier_id: x.modifier_id || '',
            modifier_option: x.modifier_option || '',
            notes: String(x.notes || '').trim(),
          }));
        const updatedOrderIds = [];
        for (const oid of sessionIds) {
          const lines = byOrder.get(oid) || [];
          if (lines.length === 0) {
            await api.put(`/orders/${oid}/status`, {
              status: 'cancelled',
              cancellation_reason: 'Líneas retiradas al editar mesa desde caja',
            });
          } else {
            await api.put(`/orders/${oid}/lines`, {
              items: linesPayload(lines),
              notes: noteOrder,
            });
            updatedOrderIds.push(oid);
          }
        }
        toast.success(sessionIds.length > 1 ? 'Pedidos actualizados' : 'Pedido actualizado', { id: tid });
        setShowMenu(false);
        setEditingOrderId('');
        setEditingSessionOrderIds([]);
        resetCart();
        loadData();
        return;
      }
      const createdOrder = await api.post('/orders', {
        items: cart.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          modifier_id: i.modifier_id || '',
          modifier_option: i.modifier_option || '',
          notes: String(i.notes || '').trim(),
        })),
        type: quickSaleMode ? 'pickup' : 'dine_in',
        table_number: quickSaleMode ? '' : String(selectedTable.number),
        customer_name: quickSaleMode ? 'VENTA RAPIDA' : `Mesa ${selectedTable.number}`,
        payment_method: paymentMethod,
        notes: !quickSaleMode && paraLlevarMesa ? KITCHEN_TAKEOUT_NOTE : '',
      });
      if (quickSaleMode) {
        let doc = null;
        if (billingForm.enabled) {
          doc = await issueElectronicDocument(createdOrder.id);
        }
        await api.put(`/orders/${createdOrder.id}/payment`, {
          payment_method: paymentMethod,
          payment_status: 'paid',
        });
        await api.put(`/orders/${createdOrder.id}/status`, { status: 'delivered' });
        if (billingForm.enabled && doc) {
          toast.success(`Venta rápida cobrada · ${billingSuccessSummary(doc)}`, { id: tid });
          if (doc?.pdf_url) window.open(resolveMediaUrl(doc.pdf_url), '_blank', 'noopener,noreferrer');
        } else {
          toast.success('Venta rápida cobrada', { id: tid });
        }
      } else {
        toast.success(`Pedido agregado a ${selectedTable.name}`, { id: tid });
      }
      setShowMenu(false);
      setQuickSaleMode(false);
      resetCart();
      setAmountReceived('');
      resetBillingForm();
      loadData();
    } catch (err) {
      toast.error(err.message || 'No se pudo completar la operación', { id: tid });
    }
  };

  const registerMovement = async (type) => {
    const amount = parseFloat(movementForm.amount);
    if (Number.isNaN(amount) || amount <= 0) return toast.error('Monto inválido');
    try {
      await api.post('/pos/movements', { type, amount, concept: movementForm.concept, ...posRegisterBody() });
      toast.success(type === 'income' ? 'Ingreso registrado' : 'Egreso registrado');
      setMovementForm({ amount: '', concept: '' });
      await Promise.all([loadData(), loadCajaExtras()]);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const registerNote = async (noteType) => {
    const amount = parseFloat(noteForm.amount);
    if (Number.isNaN(amount) || amount <= 0) return toast.error('Monto inválido');
    try {
      await api.post('/pos/notes', { note_type: noteType, amount, reason: noteForm.reason, ...posRegisterBody() });
      toast.success(noteType === 'credit' ? 'Nota de crédito registrada' : 'Nota de débito registrada');
      setNoteForm({ amount: '', reason: '' });
      loadCajaExtras();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const searchPrices = async () => {
    try {
      const q = priceQuery.trim();
      const result = await api.get(`/pos/price-lookup${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setPriceResults(result);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const occupiedTables = tables.filter(t => t.orders && t.orders.length > 0);
  const reservationQueue = useMemo(() => {
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const pendingReservations = (reservations || []).filter((r) => {
      const st = normalize(r.status);
      return !['cancelled', 'completed', 'cancelada', 'completada'].includes(st);
    });
    const isOrderPendingPayment = (o) =>
      String(o.payment_status || '') !== 'paid' &&
      String(o.status || '') !== 'cancelled';

    return pendingReservations.map((reservation) => {
      const marker = `RESERVA_ID:${reservation.id}`;
      const reservationName = normalize(reservation.client_name);
      const reservationDate = String(reservation.date || '');
      const reservationTime = String(reservation.time || '').slice(0, 5);
      const legacyStamp = `Reserva: ${reservationDate}${reservationTime ? ` ${reservationTime}` : ''}`;
      const linkedOrders = (allOrders || []).filter((o) => {
        if (!isOrderPendingPayment(o)) return false;
        const notes = String(o.notes || '');

        // Vinculación exacta (nueva): siempre prioritaria e independiente.
        if (notes.includes(marker)) return true;

        // Compatibilidad con reservas antiguas (antes de RESERVA_ID)
        // Reglas estrictas para no mezclar reservas entre sí:
        // 1) Debe incluir sello completo "Reserva: fecha hora".
        // 2) Debe coincidir cliente (o customer_id si existiera en ambos).
        if (!notes.includes(legacyStamp)) return false;
        const byCustomerId =
          reservation.customer_id &&
          o.customer_id &&
          String(reservation.customer_id).trim() === String(o.customer_id).trim();
        if (byCustomerId) return true;
        const sameCustomer = normalize(o.customer_name) === reservationName;
        return sameCustomer;
      });
      const total = linkedOrders.reduce((sum, o) => sum + getOrderChargeTotal(o), 0);
      return { reservation, linkedOrders, total };
    }).filter((entry) => entry.linkedOrders.length > 0);
  }, [reservations, allOrders]);
  const stableTables = [...tables].sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  const deliveryCajaSlots = useMemo(() => buildDeliveryCajaSlots(allOrders), [allOrders]);
  const filteredProducts = products.filter(p => {
    if (selectedCat !== 'all' && p.category_id !== selectedCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const registerSales = Number(register?.total_sales || 0);
  const todaySales = registerSales;
  const openingAmt = register?.opening_amount || 0;

  const totalCash = register?.total_cash || 0;
  const totalYape = register?.total_yape || 0;
  const totalPlin = register?.total_plin || 0;
  const totalCard = register?.total_card || 0;
  const totalIncome = register?.total_income || 0;
  const totalExpense = register?.total_expense || 0;
  const expectedCash = register?.expected_cash ?? (openingAmt + totalCash + totalIncome - totalExpense);

  const closingAmt = parseFloat(closingAmount) || 0;
  const difference = closingAmt - expectedCash;

  /**
   * Totales por método (API) alineados con gestión: mismos ids que pedidos pagados del turno.
   * Incluye filas configuradas en Ajustes y, si hubo ventas «online» sin estar en la lista, una fila extra.
   */
  const registerPaymentRows = useMemo(() => {
    const by = {
      efectivo: Number(register?.total_cash || 0),
      yape: Number(register?.total_yape || 0),
      plin: Number(register?.total_plin || 0),
      tarjeta: Number(register?.total_card || 0),
      online: Number(register?.total_online || 0),
    };
    const opts = paymentOptions || [];
    const rows = opts.map((opt) => ({
      value: opt.value,
      label: opt.label,
      amount: by[opt.value] ?? 0,
    }));
    const hasOnlineRow = rows.some((r) => r.value === 'online');
    if (!hasOnlineRow && by.online > 0) {
      rows.push({
        value: 'online',
        label: PAYMENT_METHODS.online || 'Online',
        amount: by.online,
      });
    }
    return rows;
  }, [register, paymentOptions]);

  const paymentRowAmountClass = (value) => {
    switch (value) {
      case 'efectivo':
        return 'text-emerald-400';
      case 'yape':
        return 'text-fuchsia-400';
      case 'plin':
        return 'text-sky-400';
      case 'tarjeta':
        return 'text-amber-300';
      case 'online':
        return 'text-violet-400';
      default:
        return 'text-[#f9fafb]';
    }
  };

  const arqueoOpeningParts = useMemo(
    () => (closingData?.opened_at ? formatPeDateTimeParts(closingData.opened_at) : { date: '—', time: '—' }),
    [closingData?.opened_at]
  );
  const { arqueoClosingParts, arqueoHeaderDayLabel } = useMemo(() => {
    const inst = closingAtPreview || new Date();
    return {
      arqueoClosingParts: formatPeDateTimeParts(inst),
      arqueoHeaderDayLabel: inst.toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    };
  }, [closingAtPreview]);

  const selectedOrders = (selectedTable?.orders || []).filter(o => selectedOrderIds.includes(o.id));
  const selectedTotal = selectedOrders.reduce((sum, o) => sum + getOrderChargeTotal(o), 0);
  const selectionEnabled = splitMode;
  const selectionBaseTotal = splitMode
    ? selectedTotal
    : (selectedTable?.orders || []).reduce((sum, o) => sum + getOrderChargeTotal(o), 0);
  const discountValue = Math.max(0, parseFloat(discountConfig.value) || 0);
  const discountPreview = !discountConfig.applied
    ? 0
    : (discountConfig.type === 'percent'
      ? Math.min(selectionBaseTotal, selectionBaseTotal * (discountValue / 100))
      : Math.min(selectionBaseTotal, discountValue));
  const payableTotal = Math.max(0, selectionBaseTotal - discountPreview);
  const billLineItemsGrouped = useMemo(() => {
    const ordersForBill = !selectedTable
      ? []
      : splitMode
        ? (selectedTable.orders || []).filter((o) => selectedOrderIds.includes(o.id))
        : (selectedTable.orders || []);
    return groupItemsByProductNameForBill(ordersForBill.flatMap((o) => o.items || []));
  }, [selectedTable, splitMode, selectedOrderIds]);
  const occupiedHours = (() => {
    const timestamps = (selectedTable?.orders || [])
      .map(o => o.created_at)
      .filter(Boolean)
      .map(v => new Date(`${v}Z`).getTime())
      .filter(Boolean);
    if (timestamps.length === 0) return 0;
    const first = Math.min(...timestamps);
    return Math.max(0, Math.round((Date.now() - first) / (1000 * 60 * 60)));
  })();
  const printPrecuenta = async () => {
    if (!selectedTable) return;
    const payableOrders = splitMode
      ? (selectedTable.orders || []).filter(o => selectedOrderIds.includes(o.id))
      : (selectedTable.orders || []);
    if (payableOrders.length === 0) return toast.error('No hay pedidos para precuenta');
    const restaurantName = String(printRestaurantInfo?.name || 'Resto-FADEY').trim() || 'Resto-FADEY';
    const groupedPrecuenta = groupItemsByProductNameForBill(payableOrders.flatMap((o) => o.items || []));
    const precuentaParaLlevar = payableOrders.some((o) => orderHasTakeoutNote(o));
    const customerLines = [
      billingForm.customer_name && `Cliente: ${billingForm.customer_name}`,
      billingForm.customer_doc_number && `Doc: ${billingForm.customer_doc_number}`,
      billingForm.customer_phone && `Tel: ${billingForm.customer_phone}`,
      billingForm.customer_address && `Dir: ${billingForm.customer_address}`,
    ].filter(Boolean);
    const widthMm = 80;
    const copies = 1;
    const plain = buildPrecuentaPlainText({
      restaurantName,
      tableName: selectedTable.name,
      userLine: `${formatPeDateTimeLine(new Date())} · ${user?.full_name || 'Cajero/a'}`,
      takeoutLine: precuentaParaLlevar ? KITCHEN_TAKEOUT_NOTE : '',
      customerLines,
      groupedRows: groupedPrecuenta,
      formatCurrencyFn: formatCurrency,
      subtotal: selectionBaseTotal,
      discount: discountPreview,
      payableTotal,
      widthMm,
    });
    const r = await printCajaTicket({
      title: 'NOTA DE VENTA',
      mesa: tableName || '',
      items: groupedNota.map((row) => ({ quantity: row.qty, name: row.name })),
      text: plain,
    });
    if (r.ok) toast.success('Acción completada');
    else toast.error(r.error || 'No se pudo imprimir');
  };

  const printNotaVenta = async ({ tableName, orders, docs, customer }) => {
    const restaurantName = String(printRestaurantInfo?.name || 'Resto-FADEY').trim() || 'Resto-FADEY';
    const docText = (docs || []).map((d) => String(d?.full_number || '').trim()).filter(Boolean).join(' · ');
    const groupedNota = groupItemsByProductNameForBill((orders || []).flatMap((o) => o.items || []));
    const total = (orders || []).reduce((sum, o) => sum + getOrderChargeTotal(o), 0);
    const customerLines = [
      customer?.name && `Cliente: ${customer.name}`,
      customer?.doc_number && `Doc: ${customer.doc_number}`,
      customer?.phone && `Tel: ${customer.phone}`,
      customer?.address && `Dir: ${customer.address}`,
    ].filter(Boolean);
    const widthMm = 80;
    const copies = 1;
    const plain = buildNotaVentaPlainText({
      restaurantName,
      docLine: docText,
      tableName: tableName || '',
      dateLine: formatPeDateTimeLine(new Date()),
      customerLines,
      groupedRows: groupedNota,
      formatCurrencyFn: formatCurrency,
      total,
      widthMm,
    });
    const r = await printCajaTicket({
      title: 'PRE CUENTA',
      mesa: table.name,
      items: groupedTable.map((row) => ({ quantity: row.qty, name: row.name })),
      text: plain,
    });
    if (r.ok) toast.success('Acción completada');
    else toast.error(r.error || 'No se pudo imprimir');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;

  if (!register) {
    const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
    if (isAdmin) {
      return (
        <div className="flex items-center justify-center py-12 px-4">
          <div className="card max-w-3xl w-full">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
              <div>
                <MdPointOfSale className="text-5xl text-gold-500 mb-2" />
                <h2 className="text-xl font-bold text-slate-800">Cajas del local</h2>
                <p className="text-sm text-slate-500">
                  AGREGUE EL MONTO DE APERTURA PARA ABRIR UN TURNO DE CAJA O SELECCIONE UN TURNO YA ABIERTO PARA INSPECCIONAR.
                </p>
              </div>
              {String(adminRegisterId || '').trim() ? (
                <button
                  type="button"
                  onClick={() => void clearAdminRegisterContext()}
                  className="btn-secondary text-sm shrink-0"
                >
                  Quitar selección
                </button>
              ) : null}
            </div>

            <div className="mb-6 text-left">
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto de apertura (nuevos turnos)</label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">S/</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                  className="input-field pl-10 text-lg font-bold text-center"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">Se usa al pulsar «Abrir turno» en una caja sin sesión activa.</p>
            </div>

            {!cajaStations.length ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No hay cajas activas en configuración. Defínalas en <strong>Configuración → Cajas</strong>.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cajaStations.map((st) => {
                  const op = st.open_register;
                  return (
                    <div
                      key={st.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-left flex flex-col gap-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{st.name}</p>
                        {op ? (
                          <p className="text-xs text-slate-500 mt-1">
                            Turno abierto · {op.cajero_name || 'Usuario'}{' '}
                            {op.opened_at ? `· ${formatPeDateTimeLine(op.opened_at)}` : ''}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 mt-1">Sin turno abierto</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-auto">
                        {op ? (
                          <button
                            type="button"
                            onClick={() => void attachAdminToRegister(op.id)}
                            className="btn-primary text-sm flex items-center gap-1"
                          >
                            <MdPointOfSale /> Operar esta caja
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void openStationRegisterForAdmin(st.id)}
                            disabled={openingAmount === ''}
                            className="btn-primary text-sm flex items-center gap-1 disabled:opacity-50"
                          >
                            <MdPointOfSale /> Abrir turno
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center py-20">
        <div className="card text-center max-w-md">
          <MdPointOfSale className="text-6xl text-gold-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Abrir Caja</h2>
          {cajaStations[0]?.name ? (
            <p className="text-sm text-slate-600 mb-2">
              Caja asignada: <span className="font-semibold text-slate-800">{cajaStations[0].name}</span>
            </p>
          ) : null}
          <p className="text-slate-500 mb-6">Ingresa el monto inicial y abre la caja para comenzar a operar</p>

          <div className="mb-4 text-left">
            <label className="block text-sm font-medium text-slate-700 mb-1">Monto de apertura</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">S/</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="0.00"
                className="input-field pl-10 text-lg font-bold text-center"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Dinero en efectivo al iniciar el turno</p>
          </div>

          <button
            type="button"
            onClick={() => void openRegisterForCajero()}
            disabled={openingAmount === ''}
            className="btn-primary w-full py-3 text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MdPointOfSale /> Abrir Caja
          </button>
        </div>
      </div>
    );
  }

  const printTableOrder = async (table) => {
    if (!table) return;
    const groupedTable = mergedProductsOnTable(table);
    if (!groupedTable.length) return toast.error('La mesa no tiene pedidos para precuenta');
    const restaurantName = String(printRestaurantInfo?.name || 'Resto-FADEY').trim() || 'Resto-FADEY';
    const precuentaParaLlevar = (table.orders || []).some((o) => orderHasTakeoutNote(o));
    const tableTotal = (table.orders || []).reduce((sum, o) => sum + getOrderChargeTotal(o), 0);
    const customerLines = [
      billingForm.customer_name && `Cliente: ${billingForm.customer_name}`,
      billingForm.customer_doc_number && `Doc: ${billingForm.customer_doc_number}`,
      billingForm.customer_phone && `Tel: ${billingForm.customer_phone}`,
      billingForm.customer_address && `Dir: ${billingForm.customer_address}`,
    ].filter(Boolean);
    const widthMm = 80;
    const copies = 1;
    const plain = buildPrecuentaPlainText({
      restaurantName,
      tableName: table.name,
      userLine: `${formatPeDateTimeLine(new Date())} · ${user?.full_name || 'Cajero/a'}`,
      takeoutLine: precuentaParaLlevar ? KITCHEN_TAKEOUT_NOTE : '',
      customerLines,
      groupedRows: groupedTable,
      formatCurrencyFn: formatCurrency,
      subtotal: tableTotal,
      discount: 0,
      payableTotal: tableTotal,
      widthMm,
    });
    const r = await printCajaTicket({
      title: 'PRE CUENTA',
      mesa: table.name,
      items: groupedTable.map((row) => ({ quantity: row.qty, name: row.name })),
      text: plain,
    });
    if (r.ok) toast.success('Acción completada');
    else toast.error(r.error || 'No se pudo imprimir');
  };
  const chargeReservation = async (entry) => {
    const orders = entry?.linkedOrders || [];
    if (!orders.length) return toast.error('Esta reserva no tiene pedidos pendientes para cobrar');
    try {
      await api.post('/pos/checkout-table', {
        ...posRegisterBody(),
        order_ids: orders.map(o => o.id),
        payment_method: paymentMethod || 'efectivo',
      });
      await api.put(`/admin-modules/reservations/${entry.reservation.id}`, { status: 'completed' }).catch(() => {});
      toast.success(`Reserva de ${entry.reservation.client_name} cobrada correctamente`);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="mb-4 -mt-4">
      {activeCajaOption === 'cobrar' && (
        <>
      <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
        <div
          className={`inline-flex items-center justify-center w-9 h-9 rounded-full border ${
            billingStatus.provider_reachable
              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
              : 'bg-red-50 border-red-200 text-red-600'
          }`}
          title={billingStatus.provider_reachable ? 'En línea' : 'Sin conexión'}
        >
          {billingStatus.provider_reachable ? <MdCheckCircle className="text-xl" /> : <MdClose className="text-xl" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('pos-delivery-caja');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              if (!deliveryCajaSlots.length) {
                toast.error('No hay pedidos delivery pendientes de cobro');
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5"
          >
            <MdDeliveryDining className="text-base shrink-0" />
            Delivery
          </button>
          <button
            type="button"
            onClick={openQuickSaleMenu}
            className="px-4 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] font-medium text-sm inline-flex items-center gap-2"
          >
            <MdPointOfSale className="text-base" /> Venta rápida
          </button>
        </div>
      </div>
      <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><MdTableRestaurant /> Mapa de mesas</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {stableTables.map(table => {
          const isOccupied = Boolean(table.orders && table.orders.length > 0);
          const isSelected = tableDetail?.id === table.id;
          return (
            <button
              key={table.id}
              onClick={() => setTableDetail(table)}
              className={`card text-left transition-all border-l-4 hover:shadow-lg ${
                isOccupied ? 'border-l-red-500' : 'border-l-lime-500'
              } ${isSelected ? 'ring-2 ring-gold-400' : ''}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOccupied ? 'bg-red-100' : 'bg-emerald-100'}`}>
                  <MdTableRestaurant className={`${isOccupied ? 'text-red-600' : 'text-emerald-600'} text-xl`} />
                </div>
                <div>
                  <p className="font-bold text-slate-800">{table.name}</p>
                  <p className="text-xs text-slate-500">{isOccupied ? `${table.orders.length} pedido(s)` : 'Sin pedidos activos'}</p>
                </div>
              </div>
              <p className={`text-xs font-semibold ${isOccupied ? 'text-red-700' : 'text-emerald-700'}`}>
                {isOccupied ? 'Ocupada' : 'Libre'}
              </p>
            </button>
          );
        })}
      </div>

      {deliveryCajaSlots.length > 0 && (
        <>
          <h2 id="pos-delivery-caja" className="font-semibold text-slate-700 mb-4 flex items-center gap-2 scroll-mt-4"><MdDeliveryDining /> Delivery en caja</h2>
          <p className="text-sm text-slate-500 mb-3">Un recuadro por pedido delivery pendiente de cobro. Al cobrar, desaparece de esta lista.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {deliveryCajaSlots.map((slot) => {
              const isSelected = tableDetail?.id === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setTableDetail(slot)}
                  className={`card text-left transition-all border-l-4 border-l-sky-500 hover:shadow-lg bg-slate-50/80 ${isSelected ? 'ring-2 ring-gold-400' : ''}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-100">
                      <MdDeliveryDining className="text-sky-700 text-xl" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{slot.name}</p>
                      <p className="text-xs text-slate-500">Pedido #{slot.orders?.[0]?.order_number ?? '—'}</p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-sky-800">Por cobrar · {formatCurrency((slot.orders || []).reduce((s, o) => s + getOrderChargeTotal(o), 0))}</p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {tableDetail && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-slate-800">{tableDetail.name}</h3>
              <p className="text-xs text-slate-500">
                {isDeliveryCheckoutTable(tableDetail)
                  ? (() => {
                      const o = tableDetail.orders?.[0];
                      if (!o) return 'Sin pedido';
                      return [o.customer_name, o.delivery_address].filter(Boolean).join(' · ') || 'Delivery';
                    })()
                  : tableDetail.orders?.length
                    ? `${tableDetail.orders.length} pedido(s) activo(s)`
                    : 'Sin pedidos activos'}
              </p>
            </div>
            <p className="text-xl font-bold text-gold-600">{formatCurrency((tableDetail.orders || []).reduce((sum, o) => sum + getOrderChargeTotal(o), 0))}</p>
          </div>

          <div className="flex flex-col gap-3">
            <div
              className={`flex flex-wrap gap-2 items-stretch ${
                isDeliveryCheckoutTable(tableDetail) ? '' : ''
              }`}
            >
              {!isDeliveryCheckoutTable(tableDetail) && (
                <button
                  type="button"
                  onClick={() => openMenuForTable(tableDetail)}
                  className="flex-1 min-w-[140px] py-2 rounded-lg text-sm font-semibold border border-sky-400/70 bg-sky-300 text-sky-950 shadow-sm hover:bg-sky-200 hover:border-sky-300 active:bg-sky-500 active:text-white active:border-sky-600 transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-surface)]"
                >
                  <MdRestaurantMenu /> Tomar Pedido
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedTable(tableDetail);
                  setShowBill(true);
                  setPaymentMethod('efectivo');
                  setAmountReceived('');
                  setSplitMode(false);
                  setSelectedOrderIds((tableDetail.orders || []).map(o => o.id));
                  setDiscountConfig({ active: false, applied: false, type: 'amount', value: '', reason: '' });
                }}
                disabled={!tableDetail.orders?.length}
                className="flex-1 min-w-[140px] py-2 rounded-lg text-sm font-semibold border border-sky-400/70 bg-sky-300 text-sky-950 shadow-sm hover:bg-sky-200 hover:border-sky-300 active:bg-sky-500 active:text-white active:border-sky-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sky-300 disabled:active:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-surface)]"
              >
                <MdAttachMoney /> {isDeliveryCheckoutTable(tableDetail) ? 'Cobrar delivery' : 'Cobrar Mesa'}
              </button>
              <div className="flex flex-1 min-w-[200px] gap-2">
                <button
                  type="button"
                  title="Ver pedido"
                  onClick={() => setViewOrdersModal({ table: tableDetail, orderId: null })}
                  disabled={!tableDetail.orders?.length}
                  className="shrink-0 w-11 h-11 rounded-lg font-semibold border border-sky-400/70 bg-sky-300 text-sky-950 shadow-sm hover:bg-sky-200 hover:border-sky-300 active:bg-sky-500 active:text-white active:border-sky-600 transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sky-300 disabled:active:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-surface)]"
                >
                  <MdVisibility className="text-xl" />
                </button>
                <button
                  type="button"
                  title="Modificar pedido"
                  onClick={openEditOrderFromToolbar}
                  disabled={
                    !tableDetail.orders?.length ||
                    isClientCheckoutTable(tableDetail) ||
                    !(tableDetail.orders || []).some((o) => canEditOrderLines(o))
                  }
                  className="shrink-0 w-11 h-11 rounded-lg font-semibold border border-sky-400/70 bg-sky-300 text-sky-950 shadow-sm hover:bg-sky-200 hover:border-sky-300 active:bg-sky-500 active:text-white active:border-sky-600 transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sky-300 disabled:active:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-surface)]"
                >
                  <MdEdit className="text-xl" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <button
          onClick={() => openCajaView('reservas')}
          className="card flex items-center gap-3 hover:border-indigo-300 text-left"
        >
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <MdReceipt className="text-indigo-600 text-xl" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Reservas</p>
            <p className="text-xl font-bold text-indigo-700">{reservationQueue.length}</p>
          </div>
        </button>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><MdTableRestaurant className="text-sky-600 text-xl" /></div>
          <div><p className="text-xs text-slate-500">Total Mesas</p><p className="text-xl font-bold">{tables.length}</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><MdPeople className="text-red-600 text-xl" /></div>
          <div><p className="text-xs text-slate-500">Ocupadas</p><p className="text-xl font-bold text-red-600">{occupiedTables.length}</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><MdCheckCircle className="text-emerald-600 text-xl" /></div>
          <div><p className="text-xs text-slate-500">Disponibles</p><p className="text-xl font-bold text-emerald-600">{tables.length - occupiedTables.length}</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <MdAttachMoney className="text-emerald-600 text-xl" />
          </div>
          <div>
            <p className="text-xs text-emerald-600">Ventas del día</p>
            <p className="text-xl font-bold text-emerald-700">{formatCurrency(todaySales)}</p>
          </div>
        </div>
        <button
          onClick={prepareClose}
          className="card flex items-center gap-3 hover:border-red-300 text-left"
        >
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <MdClose className="text-red-600 text-xl" />
          </div>
          <p className="text-xl font-bold text-red-700">Cerrar Caja</p>
        </button>
      </div>
        </>
      )}

      {activeCajaOption === 'reservas' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Reservas para cobro</h3>
            <span className="text-xs text-slate-500">Total: {reservationQueue.length}</span>
          </div>
          {reservationQueue.length === 0 ? (
            <p className="text-slate-500">No hay reservas pendientes.</p>
          ) : (
            <div className="space-y-3">
              {reservationQueue.map((entry) => (
                <div key={entry.reservation.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{entry.reservation.client_name}</p>
                      <p className="text-xs text-slate-500">{entry.reservation.date} · {entry.reservation.time} · {entry.reservation.guests} comensales</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Total pedido</p>
                      <p className="font-bold text-emerald-700">{formatCurrency(entry.total)}</p>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    {entry.reservation.notes || 'Sin nota adicional'}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => chargeReservation(entry)}
                      disabled={!entry.linkedOrders.length}
                      className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {entry.linkedOrders.length ? 'Cobrar reserva' : 'Sin pedido para cobrar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeCajaOption === 'apertura_cierre' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Apertura y cierre</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Apertura</p><p className="font-bold">{formatCurrency(openingAmt)}</p></div>
            <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Efectivo esperado</p><p className="font-bold">{formatCurrency(expectedCash)}</p></div>
            <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500">Ventas del turno</p><p className="font-bold">{formatCurrency(registerSales)}</p></div>
          </div>
          <button onClick={prepareClose} className="btn-primary">Ir al cierre de caja</button>
        </div>
      )}

      {activeCajaOption === 'cierres_caja' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Historial de cierres de caja</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Cajero</th><th className="text-left py-2">Apertura</th><th className="text-left py-2">Cierre</th><th className="text-right py-2">Ventas</th></tr></thead>
              <tbody>
                {registerHistory.map(r => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="py-2">{r.user_name}</td>
                    <td className="py-2">{r.opened_at ? formatPeDateTimeLine(r.opened_at) : '-'}</td>
                    <td className="py-2">{r.closed_at ? formatPeDateTimeLine(r.closed_at) : 'Abierta'}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(r.total_sales || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeCajaOption === 'ingresos' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Ingresos</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <input className="input-field" type="number" min="0" step="0.01" placeholder="Monto" value={movementForm.amount} onChange={e => setMovementForm({ ...movementForm, amount: e.target.value })} />
            <input className="input-field md:col-span-2" placeholder="Concepto" value={movementForm.concept} onChange={e => setMovementForm({ ...movementForm, concept: e.target.value })} />
          </div>
          <button onClick={() => registerMovement('income')} className="btn-primary mb-4">Registrar ingreso</button>
          <div className="space-y-2">
            {incomes.map(m => <div key={m.id} className="text-sm flex justify-between border-b border-slate-100 pb-1"><span>{m.concept || 'Sin concepto'}</span><strong>{formatCurrency(m.amount)}</strong></div>)}
          </div>
        </div>
      )}

      {activeCajaOption === 'egresos' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Egresos</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <input className="input-field" type="number" min="0" step="0.01" placeholder="Monto" value={movementForm.amount} onChange={e => setMovementForm({ ...movementForm, amount: e.target.value })} />
            <input className="input-field md:col-span-2" placeholder="Concepto" value={movementForm.concept} onChange={e => setMovementForm({ ...movementForm, concept: e.target.value })} />
          </div>
          <button onClick={() => registerMovement('expense')} className="btn-primary mb-4">Registrar egreso</button>
          <div className="space-y-2">
            {expenses.map(m => <div key={m.id} className="text-sm flex justify-between border-b border-slate-100 pb-1"><span>{m.concept || 'Sin concepto'}</span><strong>{formatCurrency(m.amount)}</strong></div>)}
          </div>
        </div>
      )}

      {activeCajaOption === 'notas_credito' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Notas de credito</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <input className="input-field" type="number" min="0" step="0.01" placeholder="Monto" value={noteForm.amount} onChange={e => setNoteForm({ ...noteForm, amount: e.target.value })} />
            <input className="input-field md:col-span-2" placeholder="Motivo" value={noteForm.reason} onChange={e => setNoteForm({ ...noteForm, reason: e.target.value })} />
          </div>
          <button onClick={() => registerNote('credit')} className="btn-primary mb-4">Registrar nota de crédito</button>
          <div className="space-y-2">
            {creditNotes.map(n => <div key={n.id} className="text-sm flex justify-between border-b border-slate-100 pb-1"><span>{n.reason || 'Sin motivo'}</span><strong>{formatCurrency(n.amount)}</strong></div>)}
          </div>
        </div>
      )}

      {activeCajaOption === 'notas_debito' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Notas de debito</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <input className="input-field" type="number" min="0" step="0.01" placeholder="Monto" value={noteForm.amount} onChange={e => setNoteForm({ ...noteForm, amount: e.target.value })} />
            <input className="input-field md:col-span-2" placeholder="Motivo" value={noteForm.reason} onChange={e => setNoteForm({ ...noteForm, reason: e.target.value })} />
          </div>
          <button onClick={() => registerNote('debit')} className="btn-primary mb-4">Registrar nota de débito</button>
          <div className="space-y-2">
            {debitNotes.map(n => <div key={n.id} className="text-sm flex justify-between border-b border-slate-100 pb-1"><span>{n.reason || 'Sin motivo'}</span><strong>{formatCurrency(n.amount)}</strong></div>)}
          </div>
        </div>
      )}

      {activeCajaOption === 'consulta_precios' && (
        <div className="card">
          <h3 className="font-bold text-slate-800 mb-4">Consulta de precios</h3>
          <div className="flex gap-2 mb-3">
            <input className="input-field" placeholder="Buscar por producto o categoría..." value={priceQuery} onChange={e => setPriceQuery(e.target.value)} />
            <button onClick={searchPrices} className="btn-primary">Buscar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Producto</th><th className="text-left py-2">Categoría</th><th className="text-right py-2">Precio</th><th className="text-right py-2">Stock</th></tr></thead>
              <tbody>
                {priceResults.map(p => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-slate-500">{p.category_name || '-'}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(p.price)}</td>
                    <td className="py-2 text-right">{showStockInOrderingUI(p) ? p.stock : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeCajaOption === 'impresora' && (
        <div className="card max-w-3xl">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MdPrint /> Configuración de Impresora (Caja)</h3>
          {(() => {
            const cfg = printingConfig?.caja || { tipo: 'usb', nombre: '', ip: '', puerto: 9100 };
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                    <select
                      className="input-field"
                      value={cfg.tipo || 'usb'}
                      onChange={(e) => setPrintingConfig((prev) => ({
                        ...prev,
                        caja: { ...(prev.caja || {}), tipo: e.target.value },
                      }))}
                    >
                      <option value="usb">USB</option>
                      <option value="red">Red</option>
                    </select>
                  </div>
                  {(cfg.tipo || 'usb') === 'usb' ? (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Impresora USB</label>
                      <select
                        className="input-field"
                        value={cfg.nombre || ''}
                        onChange={(e) => setPrintingConfig((prev) => ({
                          ...prev,
                          caja: { ...(prev.caja || {}), nombre: e.target.value },
                        }))}
                      >
                        <option value="">Seleccione una impresora</option>
                        {detectedPrinters.map((p) => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">IP</label>
                        <input
                          className="input-field"
                          value={cfg.ip || ''}
                          onChange={(e) => setPrintingConfig((prev) => ({
                            ...prev,
                            caja: { ...(prev.caja || {}), ip: e.target.value },
                          }))}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Puerto</label>
                        <input
                          className="input-field"
                          type="number"
                          min="1"
                          max="65535"
                          value={Number(cfg.puerto || 9100)}
                          onChange={(e) => setPrintingConfig((prev) => ({
                            ...prev,
                            caja: { ...(prev.caja || {}), puerto: Number(e.target.value || 9100) },
                          }))}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={detectUsbPrinters} disabled={printingBusy}>
                    Detectar impresoras USB
                  </button>
                  <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={savePrinterConfig} disabled={printingBusy}>
                    <MdSave /> Guardar configuración
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      </div>

      {/* Modal tomar pedido / venta rápida */}
      <Modal
        isOpen={showMenu}
        onClose={() => {
          setShowMenu(false);
          setQuickSaleMode(false);
          setEditingOrderId('');
          setEditingSessionOrderIds([]);
          setParaLlevarMesa(false);
          setAmountReceived('');
          resetBillingForm();
          resetCart();
        }}
        title={(() => {
          if (quickSaleMode) return 'Venta rápida';
          if (editingOrderId && selectedTable) {
            if (editingSessionOrderIds.length > 1) {
              const nums = (selectedTable.orders || [])
                .filter((x) => editingSessionOrderIds.includes(x.id))
                .map((x) => x.order_number)
                .filter((n) => n != null);
              const suffix = nums.length ? ` · #${nums.join(', #')}` : '';
              return `Modificar pedidos — ${selectedTable.name || ''}${suffix}`;
            }
            const o = (selectedTable.orders || []).find((x) => x.id === editingOrderId);
            return o
              ? `Modificar pedido #${o.order_number} — ${selectedTable.name || ''}`
              : `Modificar pedido — ${selectedTable.name || ''}`;
          }
          return `Agregar Pedido — ${selectedTable?.name || ''}`;
        })()}
        size={editingOrderId ? 'md' : 'xl'}
        bodyClassName="!overflow-hidden flex min-h-0 flex-1 flex-col p-6"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {quickSaleMode ? (
        <StaffDineInOrderUI
          search={search}
          onSearchChange={setSearch}
          selectedCat={selectedCat}
          onSelectedCatChange={setSelectedCat}
          categories={categories}
          filteredProducts={filteredProducts}
          onProductPick={addToCart}
          cart={cart}
          noteEditorLineKey={noteEditorLineKey}
          setNoteEditorLineKey={setNoteEditorLineKey}
          updateQty={updateQty}
          removeFromCart={removeFromCart}
          updateItemNote={updateItemNote}
          cartTotal={cartTotal}
          formatCurrency={formatCurrency}
          minHeightClass="min-h-0 flex-1"
          sidebarTop={(
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-[#E5E7EB] mb-1">Método de pago</label>
                  <select className="input-field" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {paymentOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {paymentMethod === 'efectivo' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-[#E5E7EB] mb-1">Paga con</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-field"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/35 p-2 text-sm">
                      <p className="text-[#9CA3AF]">
                        Vuelto: <span className="font-bold text-emerald-300">{formatCurrency(quickSaleChange)}</span>
                      </p>
                      {quickSaleMissing > 0 && (
                        <p className="text-xs text-red-400 mt-1">Falta: {formatCurrency(quickSaleMissing)}</p>
                      )}
                    </div>
                  </>
                )}
                <div className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-2 space-y-2">
                  {!billingForm.enabled && (
                    <p className="text-[11px] text-[#9CA3AF]">Activa «Emitir comprobante» debajo del total para completar boleta o factura.</p>
                  )}
                  {billingForm.enabled && (
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={openCustomerModal}
                          className="px-2 py-1 rounded-lg border border-[color:var(--ui-accent)] text-[#BFDBFE] text-xs font-medium hover:bg-[#2563EB]/20 flex items-center gap-1"
                        >
                          <MdPersonAdd className="text-sm" />
                          Agregar cliente
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="input-field"
                          value={billingForm.doc_type}
                          onChange={(e) => setBillingForm((prev) => ({ ...prev, doc_type: e.target.value }))}
                        >
                          <option value="boleta">Boleta</option>
                          <option value="factura">Factura</option>
                          <option value="nota_venta">Nota de venta</option>
                        </select>
                        <select
                          className="input-field"
                          value={billingForm.customer_doc_type}
                          onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_doc_type: e.target.value }))}
                          disabled={billingForm.doc_type === 'factura' || billingForm.doc_type === 'nota_venta'}
                        >
                          <option value="1">DNI</option>
                          <option value="6">RUC</option>
                          <option value="0">Sin documento</option>
                        </select>
                      </div>
                      <div className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]/60 p-2 space-y-1.5">
                        <p className="text-[11px] font-medium text-[#E5E7EB]">Detalle en el comprobante</p>
                        <div className="flex flex-wrap gap-3 text-xs text-[#D1D5DB]">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="invoice_lines_quick"
                              checked={billingForm.invoice_lines_mode === 'detallado'}
                              onChange={() => setBillingForm((prev) => ({ ...prev, invoice_lines_mode: 'detallado' }))}
                              className="border-[color:var(--ui-accent)]"
                              disabled={billingForm.doc_type === 'nota_venta'}
                            />
                            Detallado (cada producto)
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="invoice_lines_quick"
                              checked={billingForm.invoice_lines_mode === 'consumo'}
                              onChange={() => setBillingForm((prev) => ({ ...prev, invoice_lines_mode: 'consumo' }))}
                              className="border-[color:var(--ui-accent)]"
                              disabled={billingForm.doc_type === 'nota_venta'}
                            />
                            Por consumo (una línea)
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2 items-stretch">
                        <input
                          className="input-field flex-1 min-w-0"
                          placeholder="N° documento"
                          value={billingForm.customer_doc_number}
                          onChange={(e) =>
                            setBillingForm((prev) => ({ ...prev, customer_doc_number: normalizeDocNumber(e.target.value) }))
                          }
                        />
                        {(billingForm.doc_type !== 'nota_venta' && (billingForm.customer_doc_type === '1' || billingForm.customer_doc_type === '6')) && (
                          <button
                            type="button"
                            title="Consultar nombre o razón social en padrón (requiere PERU_CONSULTAS_TOKEN en el servidor)"
                            onClick={() => void handleConsultaPadron()}
                            disabled={consultaPadronLoading}
                            className="shrink-0 px-2.5 py-2 rounded-lg border border-[color:var(--ui-accent)] text-[#BFDBFE] text-xs font-medium hover:bg-[#2563EB]/20 flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <MdSearch className="text-lg shrink-0" />
                            <span className="hidden sm:inline">Padrón</span>
                          </button>
                        )}
                      </div>
                      <input
                        className="input-field"
                        placeholder={billingForm.doc_type === 'factura' ? 'Razón social' : 'Nombre cliente'}
                        value={billingForm.customer_name}
                        onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                      />
                      <input
                        className="input-field"
                        placeholder="Dirección (opcional)"
                        value={billingForm.customer_address}
                        onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_address: e.target.value }))}
                      />
                      <input
                        className="input-field"
                        placeholder=""
                        value={billingForm.customer_phone}
                        onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
                      />
                      {searchingCustomer && <p className="text-[11px] text-[#9CA3AF]">Buscando cliente en el registro local...</p>}
                      {matchedCustomer && (
                        <p className="text-[11px] text-emerald-400">Cliente encontrado: {matchedCustomer.name}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
          )}
          footer={
            cart.length > 0 ? (
              <>
                <div className="flex justify-between font-bold text-lg text-white">
                  <span>Total</span>
                  <span className="text-[#BFDBFE]">{formatCurrency(cartTotal)}</span>
                </div>
                {quickSaleMode && (
                  <label className="flex items-center gap-2 text-xs font-medium text-[#F9FAFB] mb-1">
                    <input
                      type="checkbox"
                      checked={billingForm.enabled}
                      onChange={(e) => setBillingForm((prev) => (e.target.checked
                        ? {
                          ...prev,
                          enabled: true,
                          doc_type: 'nota_venta',
                          customer_doc_type: '0',
                          invoice_lines_mode: 'detallado',
                        }
                        : { ...prev, enabled: false }))}
                      className="rounded border-[color:var(--ui-accent)]"
                    />
                    Emitir Comprovate
                  </label>
                )}
                <button type="button" onClick={submitOrder} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                  <MdReceipt /> {quickSaleMode ? 'Cobrar venta rápida' : editingOrderId ? 'Guardar cambios' : 'Enviar Pedido'}
                </button>
              </>
            ) : null
          }
        />
        ) : selectedTable && editingOrderId ? (
          <div className="flex min-h-0 max-h-[min(72vh,520px)] flex-1 flex-col overflow-hidden text-[#E5E7EB]">
            <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Productos en la mesa</p>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#9CA3AF]">No quedan productos. Puedes liberar la mesa.</p>
              ) : (
                <ul className="space-y-1.5 text-sm text-[#D1D5DB]">
                  {cart.map((item) => {
                    const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);
                    return (
                      <li
                        key={item.line_key}
                        className="flex flex-wrap items-center gap-2 border-b border-[#374151]/80 pb-1.5 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-white">{item.name}</span>
                          <span className="text-[#9CA3AF]"> × {item.quantity}</span>
                          {item.modifier_option ? (
                            <p className="truncate text-[11px] text-[#BFDBFE]">{item.modifier_option}</p>
                          ) : null}
                          {item.notes?.trim() ? (
                            <p className="truncate text-[11px] text-[#9CA3AF]">{item.notes}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 tabular-nums font-medium text-[#BFDBFE]">{formatCurrency(lineTotal)}</span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.line_key)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-500/45 bg-red-950/40 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-900/55"
                        >
                          <MdDelete className="text-sm" /> Eliminar
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="mt-4 shrink-0 space-y-3 border-t border-[color:var(--ui-border)] pt-4">
              {cart.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-base font-bold text-white">
                    <span>Total</span>
                    <span className="text-[#BFDBFE]">{formatCurrency(cartTotal)}</span>
                  </div>
                  {paraLlevarToggleButton}
                  <button
                    type="button"
                    onClick={submitOrder}
                    className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-base"
                  >
                    <MdReceipt /> Guardar cambios
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void liberarMesaDesdeEdicionPedidoVacio()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/60 bg-amber-950/50 py-3 text-base font-semibold text-amber-100 hover:bg-amber-900/60"
                >
                  <MdTableRestaurant /> Liberar mesa
                </button>
              )}
            </div>
          </div>
        ) : selectedTable ? (
          <StaffMesaPedidoTabs
            orders={selectedTable.orders || []}
            formatCurrency={formatCurrency}
            resetKey={selectedTable.id}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <StaffDineInOrderUI
              search={search}
              onSearchChange={setSearch}
              selectedCat={selectedCat}
              onSelectedCatChange={setSelectedCat}
              categories={categories}
              filteredProducts={filteredProducts}
              onProductPick={addToCart}
              cart={cart}
              noteEditorLineKey={noteEditorLineKey}
              setNoteEditorLineKey={setNoteEditorLineKey}
              updateQty={updateQty}
              removeFromCart={removeFromCart}
              updateItemNote={updateItemNote}
              cartTotal={cartTotal}
              formatCurrency={formatCurrency}
              minHeightClass="min-h-0 flex-1"
              className="flex-1 min-h-0"
              footer={
                cart.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between font-bold text-lg text-white">
                      <span>Total</span>
                      <span className="text-[#BFDBFE]">{formatCurrency(cartTotal)}</span>
                    </div>
                    {paraLlevarToggleButton}
                    <button type="button" onClick={submitOrder} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                      <MdReceipt /> Enviar Pedido
                    </button>
                  </div>
                ) : null
              }
            />
          </StaffMesaPedidoTabs>
        ) : (
          <StaffDineInOrderUI
            search={search}
            onSearchChange={setSearch}
            selectedCat={selectedCat}
            onSelectedCatChange={setSelectedCat}
            categories={categories}
            filteredProducts={filteredProducts}
            onProductPick={addToCart}
            cart={cart}
            noteEditorLineKey={noteEditorLineKey}
            setNoteEditorLineKey={setNoteEditorLineKey}
            updateQty={updateQty}
            removeFromCart={removeFromCart}
            updateItemNote={updateItemNote}
            cartTotal={cartTotal}
            formatCurrency={formatCurrency}
            minHeightClass="min-h-0 flex-1"
            footer={
              cart.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-lg text-white">
                    <span>Total</span>
                    <span className="text-[#BFDBFE]">{formatCurrency(cartTotal)}</span>
                  </div>
                  {paraLlevarToggleButton}
                  <button type="button" onClick={submitOrder} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                    <MdReceipt /> Enviar Pedido
                  </button>
                </div>
              ) : null
            }
          />
        )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(viewOrdersModal?.table)}
        onClose={() => setViewOrdersModal(null)}
        title={(() => {
          const t = viewOrdersModal?.table;
          if (!t) return 'Pedidos';
          const name = String(t.name || '').trim();
          return name || 'Pedidos';
        })()}
        size="md"
      >
        {viewOrdersModal?.table ? (() => {
          const tbl = viewOrdersModal.table;
          const lines = mergedProductsOnTable(tbl);
          const totalMesa = (tbl.orders || []).reduce((s, o) => s + getOrderChargeTotal(o), 0);
          return (
            <div className="max-h-[min(70vh,480px)] overflow-y-auto space-y-3 pr-1 text-[#E5E7EB]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">Productos en la mesa</p>
              {lines.length === 0 ? (
                <p className="text-center text-[#9CA3AF] py-6">No hay productos para mostrar.</p>
              ) : (
                <ul className="space-y-1.5 text-sm text-[#D1D5DB]">
                  {lines.map((row) => (
                    <li
                      key={row.key}
                      className="flex justify-between gap-2 border-b border-[#374151]/80 pb-1.5 last:border-0 last:pb-0"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-white">{row.name}</span>
                        <span className="text-[#9CA3AF]"> × {row.qty}</span>
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-[#BFDBFE]">{formatCurrency(row.subtotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {lines.length > 0 && (
                <div className="flex justify-between border-t border-[color:var(--ui-border)] pt-3 text-base font-bold text-white">
                  <span>Total</span>
                  <span className="text-[#BFDBFE]">{formatCurrency(totalMesa)}</span>
                </div>
              )}
            </div>
          );
        })() : null}
      </Modal>

      <StaffModifierPromptModal
        open={modifierPrompt.open}
        onClose={() => setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' })}
        modifierPrompt={modifierPrompt}
        setModifierPrompt={setModifierPrompt}
        onConfirm={confirmModifierForCart}
        onSkipOptional={addProductWithoutOptionalModifier}
      />

      {/* Modal cobro mesa: pedidos o boleta/factura (izq) | cuenta | cobro (mesa arriba del total) */}
      <Modal
        isOpen={showBill}
        onClose={() => {
          clientCheckoutOpenedKeyRef.current = '';
          setShowBill(false);
          setAmountReceived('');
          resetBillingForm();
        }}
        title={
          selectedTable && isClientCheckoutTable(selectedTable)
            ? 'COBRAR CUENTA CLIENTE'
            : selectedTable && isDeliveryCheckoutTable(selectedTable)
              ? 'COBRAR DELIVERY'
              : 'COBRAR MESA'
        }
        size="xl"
        headerClassName="bg-[var(--ui-surface-2)] border-b border-[color:var(--ui-border)]"
        titleClassName="text-[#F9FAFB] font-extrabold tracking-wide uppercase"
        closeButtonClassName="hover:bg-[#1E3A8A]/50"
        closeIconClassName="text-[#BFDBFE]"
      >
        {selectedTable && (
          <div className="flex flex-col -m-1 min-h-0 max-h-[min(78vh,560px)]">
            <div className="flex-1 overflow-y-auto min-h-0 pb-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 items-start">
                {/* Pedidos o formulario de facturación (reemplazo al activar emitir comprobante) */}
                <div className="flex flex-col gap-2 min-h-0">
                  <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]/70 backdrop-blur-md shadow-lg shadow-black/20 p-3 sm:p-4 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex flex-col flex-1 min-h-0 gap-2">
                      {!billingForm.enabled ? (
                        <>
                          <h3 className="text-base font-bold text-[#F9FAFB] shrink-0">Productos</h3>
                          <div className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.25rem] gap-2 text-[10px] sm:text-xs font-semibold text-[#9CA3AF] border-b border-[color:var(--ui-border)] pb-2 shrink-0">
                            <span>Producto</span>
                            <span className="text-center tabular-nums">Cant.</span>
                            <span className="text-right tabular-nums">P. unit.</span>
                            <span className="text-right tabular-nums">Total</span>
                          </div>
                          <div className="overflow-y-auto flex-1 space-y-2 max-h-[min(28vh,220px)] pr-1">
                            {splitMode && (
                                <div className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]/50 px-2 py-1.5 space-y-1.5 shrink-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Incluir en cobro</p>
                                  <div className="flex flex-wrap gap-2">
                                    {(selectedTable.orders || []).map((order) => {
                                      const sel = selectedOrderIds.includes(order.id);
                                      return (
                                        <label
                                          key={order.id}
                                          className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                                            sel
                                              ? 'border-[color:var(--ui-accent)] bg-[var(--ui-sidebar-active-bg)] text-[#BFDBFE]'
                                              : 'border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]/40 text-[#9CA3AF]'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={sel}
                                            onChange={() => toggleOrderSelection(order.id)}
                                            className="rounded border-[color:var(--ui-accent)]"
                                          />
                                          <span className="font-bold tabular-nums">#{order.order_number}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            {billLineItemsGrouped.length === 0 ? (
                              <p className="text-sm text-[#9CA3AF] text-center py-6">Sin ítems</p>
                            ) : (
                              billLineItemsGrouped.map((row) => (
                                <div
                                  key={row.key}
                                  className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.25rem] gap-2 text-sm text-[#D1D5DB] py-1.5 border-b border-[#3B82F6]/10 last:border-0"
                                >
                                  <span className="min-w-0 break-words leading-snug">{row.name}</span>
                                  <span className="text-center tabular-nums text-[#F9FAFB]">{row.qty}</span>
                                  <span className="text-right tabular-nums text-[#D1D5DB]">{formatCurrency(row.unitPrice)}</span>
                                  <span className="text-right tabular-nums font-medium text-[#F9FAFB]">{formatCurrency(row.subtotal)}</span>
                                </div>
                              ))
                            )}
                          </div>
                          {splitMode && (
                            <p className="text-[11px] text-[#9CA3AF] shrink-0">Desmarca los pedidos que no vas a cobrar en esta operación.</p>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col gap-3 overflow-y-auto max-h-[min(50vh,400px)] pr-1">
                          <h3 className="text-base font-bold text-[#F9FAFB] shrink-0">Datos del comprobante</h3>
                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={openCustomerModal}
                              className="px-2 py-1 rounded-lg border border-[color:var(--ui-accent)] text-[#BFDBFE] text-xs font-medium hover:bg-[#2563EB]/20 flex items-center gap-1 shrink-0"
                            >
                              <MdPersonAdd className="text-sm" />
                              Agregar cliente
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              className="input-field text-sm"
                              value={billingForm.doc_type}
                              onChange={(e) => setBillingForm((prev) => ({ ...prev, doc_type: e.target.value }))}
                            >
                              <option value="boleta">Boleta</option>
                              <option value="factura">Factura</option>
                              <option value="nota_venta">Nota de venta</option>
                            </select>
                            <select
                              className="input-field text-sm"
                              value={billingForm.customer_doc_type}
                              onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_doc_type: e.target.value }))}
                              disabled={billingForm.doc_type === 'factura' || billingForm.doc_type === 'nota_venta'}
                            >
                              <option value="1">DNI</option>
                              <option value="6">RUC</option>
                              <option value="0">Sin documento</option>
                            </select>
                            <div className="sm:col-span-2 rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]/60 p-2 space-y-1.5">
                              <p className="text-xs font-medium text-[#E5E7EB]">Detalle en el comprobante</p>
                              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 text-xs text-[#D1D5DB]">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="invoice_lines_mesa"
                                    checked={billingForm.invoice_lines_mode === 'detallado'}
                                    onChange={() => setBillingForm((prev) => ({ ...prev, invoice_lines_mode: 'detallado' }))}
                                    className="border-[color:var(--ui-accent)]"
                                    disabled={billingForm.doc_type === 'nota_venta'}
                                  />
                                  Detallado (cada producto)
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="invoice_lines_mesa"
                                    checked={billingForm.invoice_lines_mode === 'consumo'}
                                    onChange={() => setBillingForm((prev) => ({ ...prev, invoice_lines_mode: 'consumo' }))}
                                    className="border-[color:var(--ui-accent)]"
                                    disabled={billingForm.doc_type === 'nota_venta'}
                                  />
                                  Por consumo (una línea)
                                </label>
                              </div>
                            </div>
                            <div className="sm:col-span-2 flex gap-2 items-stretch">
                              <input
                                className="input-field text-sm flex-1 min-w-0"
                                placeholder="N° documento"
                                value={billingForm.customer_doc_number}
                                onChange={(e) =>
                                  setBillingForm((prev) => ({ ...prev, customer_doc_number: normalizeDocNumber(e.target.value) }))
                                }
                              />
                              {(billingForm.doc_type !== 'nota_venta' && (billingForm.customer_doc_type === '1' || billingForm.customer_doc_type === '6')) && (
                                <button
                                  type="button"
                                  title="Consultar nombre o razón social en padrón (requiere PERU_CONSULTAS_TOKEN en el servidor)"
                                  onClick={() => void handleConsultaPadron()}
                                  disabled={consultaPadronLoading}
                                  className="shrink-0 px-2.5 py-2 rounded-lg border border-[color:var(--ui-accent)] text-[#BFDBFE] text-xs font-medium hover:bg-[#2563EB]/20 flex items-center justify-center gap-1 disabled:opacity-50"
                                >
                                  <MdSearch className="text-lg shrink-0" />
                                  <span className="hidden sm:inline">Padrón</span>
                                </button>
                              )}
                            </div>
                            <input
                              className="input-field text-sm sm:col-span-2"
                              placeholder={billingForm.doc_type === 'factura' ? 'Razón social' : 'Nombre cliente'}
                              value={billingForm.customer_name}
                              onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                            />
                            <input
                              className="input-field text-sm sm:col-span-2"
                              placeholder="Dirección (opcional)"
                              value={billingForm.customer_address}
                              onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_address: e.target.value }))}
                            />
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-[#E5E7EB] mb-1">Celular del cliente</label>
                              <input
                                className="input-field text-sm w-full"
                                placeholder=""
                                value={billingForm.customer_phone}
                                onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              {searchingCustomer && <p className="text-xs text-[#9CA3AF]">Buscando cliente en el registro local...</p>}
                              {matchedCustomer && (
                                <p className="text-xs text-emerald-400">Cliente encontrado: {matchedCustomer.name}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {discountConfig.active && !discountConfig.applied && (
                        <div className="p-2.5 rounded-lg border border-amber-500/35 bg-amber-950/20 space-y-2 shrink-0">
                          <p className="text-xs font-medium text-amber-200/90">Definir descuento</p>
                          <select
                            className="input-field text-sm"
                            value={discountConfig.type}
                            onChange={(e) => setDiscountConfig((prev) => ({ ...prev, type: e.target.value }))}
                          >
                            <option value="amount">Monto fijo (S/)</option>
                            <option value="percent">Porcentaje (%)</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field text-sm"
                            placeholder={discountConfig.type === 'percent' ? 'Ej. 10' : 'Ej. 5.00'}
                            value={discountConfig.value}
                            onChange={(e) => setDiscountConfig((prev) => ({ ...prev, value: e.target.value }))}
                          />
                          <input
                            className="input-field text-sm"
                            placeholder="Motivo (obligatorio)"
                            value={discountConfig.reason}
                            onChange={(e) => setDiscountConfig((prev) => ({ ...prev, reason: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleDiscountButton}
                              className="flex-1 py-2 rounded-lg bg-amber-600/90 text-white text-xs font-semibold hover:bg-amber-600"
                            >
                              Aplicar descuento
                            </button>
                            <button
                              type="button"
                              onClick={() => setDiscountConfig((prev) => ({ ...prev, active: false, value: '', reason: '' }))}
                              className="px-3 py-2 rounded-lg border border-[color:var(--ui-border)] text-[#BFDBFE] text-xs"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cobro */}
                <div className="lg:border-l lg:border-[color:var(--ui-border)] lg:pl-4">
                  <div className="rounded-xl border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]/70 backdrop-blur-md p-3 sm:p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-bold text-[#F9FAFB] shrink-0">Cobro</h3>
                      <p className="text-base sm:text-lg font-extrabold text-[#F9FAFB] tracking-wide text-right leading-tight">
                        {selectedTable?.name?.trim()
                          || (selectedTable?.number != null && selectedTable?.number !== ''
                            ? `Mesa ${selectedTable.number}`
                            : '—')}
                      </p>
                    </div>
                    <div className="text-right border-b border-[color:var(--ui-border)] pb-3">
                      <p className="text-2xl sm:text-3xl font-bold text-[#BFDBFE] tabular-nums">{formatCurrency(payableTotal)}</p>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">Total a pagar</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#E5E7EB] mb-1">Método de pago</label>
                      <select
                        className="input-field w-full"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      >
                        {paymentOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#E5E7EB] mb-1">Paga con</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input-field w-full"
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(e.target.value)}
                          placeholder="0.00"
                          disabled={paymentMethod !== 'efectivo'}
                        />
                      </div>
                      <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/35 px-3 py-2 flex flex-col justify-center">
                        <p className="text-xs text-[#9CA3AF]">Vuelto</p>
                        <p className="text-lg font-bold text-emerald-300 tabular-nums">
                          {paymentMethod === 'efectivo'
                            ? formatCurrency(Math.max(0, receivedAmount - payableTotal))
                            : formatCurrency(0)}
                        </p>
                        {paymentMethod === 'efectivo' && receivedAmount < payableTotal && (
                          <p className="text-xs text-red-400">Falta: {formatCurrency(payableTotal - receivedAmount)}</p>
                        )}
                      </div>
                    </div>

                    {billingResult && (
                      <div className="text-xs rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 py-2 text-emerald-200 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {billingResult.full_number} · {billingResult.provider_status}
                        </span>
                        {billingResult.pdf_url && (
                          <button
                            type="button"
                            className="px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                            onClick={() => window.open(resolveMediaUrl(billingResult.pdf_url), '_blank', 'noopener,noreferrer')}
                          >
                            Ver PDF
                          </button>
                        )}
                      </div>
                    )}

                    <label className="flex items-start gap-2 text-sm font-medium text-[#F9FAFB] cursor-pointer pt-1 border-t border-[color:var(--ui-border)]">
                      <input
                        type="checkbox"
                        checked={billingForm.enabled}
                        onChange={(e) => setBillingForm((prev) => (e.target.checked
                          ? {
                            ...prev,
                            enabled: true,
                            doc_type: 'nota_venta',
                            customer_doc_type: '0',
                            invoice_lines_mode: 'detallado',
                          }
                          : { ...prev, enabled: false }))}
                        className="rounded border-[color:var(--ui-accent)] mt-0.5"
                      />
                      <span>Emitir Comprovate</span>
                    </label>

                    <button
                      type="button"
                      onClick={cobrarMesa}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white font-bold text-lg sm:text-xl hover:from-[#1D4ED8] hover:to-[#1E40AF] shadow-lg shadow-[#1D4ED8]/25 uppercase tracking-wide"
                    >
                      COBRAR MESA
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Barra fija inferior: solo dividir / descuento (la mesa va arriba del total a pagar) */}
            <div className="shrink-0 flex flex-wrap items-center gap-3 py-3 px-1 mt-1 border-t border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]/95 backdrop-blur-md rounded-b-lg">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={togglePartialSelection}
                  className="px-4 py-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1D4ED8] text-white text-sm font-semibold border border-[color:var(--ui-border)] shadow-md shadow-black/20"
                >
                  {splitMode ? 'Cerrar dividir cuentas' : 'Dividir cuentas'}
                </button>
                <button
                  type="button"
                  onClick={handleDiscountButton}
                  className="px-4 py-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1D4ED8] text-white text-sm font-semibold border border-[color:var(--ui-border)] shadow-md shadow-black/20"
                >
                  {discountConfig.applied
                    ? 'Anular descuento'
                    : discountConfig.active
                      ? 'Aplicar descuento'
                      : 'Agregar descuento'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showCustomerModal}
        onClose={() => {
          if (savingCustomer) return;
          setShowCustomerModal(false);
        }}
        title="Agregar cliente"
        size="md"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo documento</label>
              <select
                className="input-field"
                value={customerForm.doc_type}
                onChange={(e) => setCustomerForm(prev => ({ ...prev, doc_type: e.target.value }))}
              >
                <option value="1">DNI</option>
                <option value="6">RUC</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">N° documento</label>
              <input
                className="input-field"
                value={customerForm.doc_number}
                onChange={(e) => setCustomerForm(prev => ({ ...prev, doc_number: normalizeDocNumber(e.target.value) }))}
                placeholder={customerForm.doc_type === '6' ? '11 dígitos' : '8 dígitos'}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre / Razón social</label>
            <input
              className="input-field"
              value={customerForm.name}
              onChange={(e) => setCustomerForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder={customerForm.doc_type === '6' ? 'Razón social' : 'Nombre completo'}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono (opcional)</label>
              <input
                className="input-field"
                value={customerForm.phone}
                onChange={(e) => setCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email (opcional)</label>
              <input
                className="input-field"
                type="text"
                name="pos-customer-email"
                autoComplete="off"
                value={customerForm.email}
                onChange={(e) => setCustomerForm(prev => ({ ...prev, email: e.target.value }))}
                onBlur={(e) => setCustomerForm(prev => ({ ...prev, email: normalizeCustomerEmail(e.target.value) }))}
                placeholder="@gmail.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dirección (opcional)</label>
            <input
              className="input-field"
              value={customerForm.address}
              onChange={(e) => setCustomerForm(prev => ({ ...prev, address: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCustomerModal(false)}
              className="btn-secondary flex-1"
              disabled={savingCustomer}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveCustomerFromBilling}
              className="btn-primary flex-1"
              disabled={savingCustomer}
            >
              {savingCustomer ? 'Guardando...' : 'Guardar cliente'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Cerrar Caja / Arqueo */}
      <Modal isOpen={showCloseModal} onClose={() => { setShowCloseModal(false); setClosingAtPreview(null); }} title="Arqueo y Cierre de Caja" size="wide">
        {closingData && (
          <div className="text-[#e2e8f0]">
            <div ref={printRef} className="cash-close-print space-y-0.5">
              <h2>ARQUEO DE CAJA</h2>
              <h3>{user?.full_name} — {arqueoHeaderDayLabel}</h3>
              <div className="sep"></div>
              <div className="row">
                <span>Apertura: </span>
                <span className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5 text-right">
                  <span className="text-[#f8fafc]">{arqueoOpeningParts.date}</span>
                  <span className="tabular-nums text-[#cbd5e1]">{arqueoOpeningParts.time}</span>
                </span>
              </div>
              <div className="row">
                <span>Cierre: </span>
                <span className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5 text-right">
                  <span className="text-[#f8fafc]">{arqueoClosingParts.date}</span>
                  <span className="tabular-nums text-[#cbd5e1]">{arqueoClosingParts.time}</span>
                </span>
              </div>
              <div className="sep"></div>
              <div className="row bold"><span>MONTO APERTURA</span><span>{formatCurrency(openingAmt)}</span></div>
              <div className="sep"></div>
              {registerPaymentRows.map((row) => (
                <div key={row.value} className="row">
                  <span>Ventas ({row.label})</span>
                  <span>{formatCurrency(row.amount)}</span>
                </div>
              ))}
              <div className="sep"></div>
              <div className="row total-row"><span>TOTAL VENTAS</span><span>{formatCurrency(registerSales)}</span></div>
              <div className="row bold"><span>N° de operaciones</span><span>{closingData.order_count || 0}</span></div>
              <div className="sep"></div>
              <div className="row bold"><span>EFECTIVO ESPERADO</span><span>{formatCurrency(expectedCash)}</span></div>
              <div className="row"><span style={{ fontSize: '10px', color: '#94a3b8' }}>(Apertura + ventas en efectivo del turno)</span></div>
              <div className="sep"></div>
              <div className="row bold"><span>DETALLE ARQUEO</span><span></span></div>
              {denomDefs
                .filter(d => (parseFloat(denominations[d.key]) || 0) > 0)
                .map(d => (
                  <div key={d.key} className="row">
                    <span>{d.label} x {parseFloat(denominations[d.key]) || 0}</span>
                    <span>{formatCurrency((parseFloat(denominations[d.key]) || 0) * d.value)}</span>
                  </div>
                ))}
              <div className="row bold"><span>EFECTIVO CONTADO</span><span>{formatCurrency(closingAmt)}</span></div>
              <div className={`row bold ${difference >= 0 ? 'diff-pos' : 'diff-neg'}`}><span>DIFERENCIA</span><span>{difference > 0 ? '+' : ''}{formatCurrency(difference)}</span></div>
              {closingNotes && <div className="row"><span>OBS:</span><span>{closingNotes}</span></div>}
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl p-4 border border-[color:var(--ui-border)] bg-[var(--ui-surface)]">
                <h3 className="font-semibold text-[#f8fafc] mb-3 flex items-center gap-2"><MdAccountBalanceWallet className="text-[#93c5fd]" /> Resumen de ventas (métodos activos)</h3>
                <div className={`grid gap-3 ${registerPaymentRows.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
                  {registerPaymentRows.map((row) => (
                    <div key={row.value} className="rounded-lg p-3 border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]">
                      <p className="text-xs text-[#94a3b8]">{row.label}</p>
                      <p className={`font-bold text-lg ${paymentRowAmountClass(row.value)}`}>{formatCurrency(row.amount)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-[color:var(--ui-border)]">
                  <span className="font-bold text-[#f1f5f9]">Total ventas</span>
                  <span className="font-bold text-xl text-emerald-400">{formatCurrency(registerSales)}</span>
                </div>
              </div>

              <div className="rounded-xl p-4 border border-[color:var(--ui-border)] bg-[var(--ui-surface)]">
                <h3 className="font-semibold text-[#f8fafc] mb-1">Conteo de efectivo</h3>
                <div className="mb-3">
                  <p className="text-xs font-semibold text-[#cbd5e1] mb-2">Arqueo por denominación (soles)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {denomDefs.map(d => (
                      <div key={d.key} className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)] p-2">
                        <label className="block text-xs text-[#cbd5e1] mb-1">{d.label}</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={denominations[d.key]}
                            onChange={e => updateDenomination(d.key, e.target.value)}
                            className="input-field py-1.5 text-sm"
                            placeholder="0"
                          />
                          <span className="text-xs font-semibold text-[#e2e8f0] min-w-16 text-right tabular-nums">
                            {formatCurrency((parseFloat(denominations[d.key]) || 0) * d.value)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2 p-2 rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]">
                    <span className="text-xs font-medium text-[#cbd5e1]">Total por arqueo</span>
                    <span className="font-bold text-amber-300 tabular-nums">{formatCurrency(calculateDenominationTotal())}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-[#cbd5e1] mb-1">Efectivo esperado en caja</label>
                    <div className="rounded-lg p-3 border border-[color:var(--ui-border)] bg-[var(--ui-surface-2)]">
                      <p className="font-bold text-lg text-[#f9fafb] tabular-nums">{formatCurrency(expectedCash)}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#cbd5e1] mb-1">Efectivo contado real</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] font-medium text-sm">S/</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={closingAmount}
                        onChange={e => setClosingAmount(e.target.value)}
                        placeholder="0.00"
                        className="input-field pl-9 text-lg font-bold"
                      />
                    </div>
                  </div>
                </div>

                {closingAmount !== '' && (
                  <div className={`flex items-center justify-between p-3 rounded-lg border ${
                    difference === 0 ? 'bg-emerald-950/50 border-emerald-600/60' :
                    difference > 0 ? 'bg-sky-950/40 border-sky-600/50' :
                    'bg-red-950/40 border-red-600/50'
                  }`}>
                    <div className="flex items-center gap-2 text-[#e2e8f0]">
                      {difference === 0 ? <MdCheckCircle className="text-emerald-400 text-xl" /> :
                       difference > 0 ? <MdTrendingUp className="text-sky-400 text-xl" /> :
                       <MdTrendingDown className="text-red-400 text-xl" />}
                      <span className="font-medium text-sm">
                        {difference === 0 ? 'Caja cuadrada' :
                         difference > 0 ? 'Sobrante' : 'Faltante'}
                      </span>
                    </div>
                    <span className={`font-bold text-lg tabular-nums ${
                      difference === 0 ? 'text-emerald-300' :
                      difference > 0 ? 'text-sky-300' : 'text-red-300'
                    }`}>
                      {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#cbd5e1] mb-1">Observaciones</label>
                <textarea
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  className="input-field"
                  rows="2"
                  placeholder="Notas sobre el turno, incidencias, etc."
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-4 mt-4 border-t border-[color:var(--ui-border)]">
              <button onClick={() => setShowCloseModal(false)} className="btn-secondary flex-1 min-w-[120px]">Cancelar</button>
              <button
                onClick={sendCloseByEmail}
                disabled={sendingCloseMail}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm btn-secondary disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
              >
                <MdEmail /> {sendingCloseMail ? 'Enviando...' : 'Enviar a correo'}
              </button>
              <button onClick={closeRegister} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <MdCheckCircle /> Cerrar Caja
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
