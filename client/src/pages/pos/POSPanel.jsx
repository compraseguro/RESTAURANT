import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { api, formatCurrency, getPaymentMethodOptions } from '../../utils/api';
import { showStockInOrderingUI } from '../../utils/productStockDisplay';
import { groupItemsByProductNameForBill } from '../../utils/mesaOrderLines';
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
  MdPointOfSale, MdTableRestaurant, MdReceipt, MdPrint,
  MdCheckCircle, MdAttachMoney, MdPeople, MdClose,
  MdAccountBalanceWallet, MdTrendingUp, MdTrendingDown,
  MdRestaurantMenu,
  MdAccessTime, MdPersonAdd, MdEmail,
} from 'react-icons/md';

/** Mesa sintética al cobrar cuenta desde Clientes (no existe fila en `tables`). */
const POS_ADMIN_REGISTER_KEY = 'posAdminRegisterId';

const CLIENT_CHECKOUT_TABLE_PREFIX = 'client-checkout:';
function isClientCheckoutTable(table) {
  return Boolean(table && String(table.id || '').startsWith(CLIENT_CHECKOUT_TABLE_PREFIX));
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
];

const WAREHOUSE_CATEGORY_NAMES = new Set(['PRODUCTOS ALMACEN', 'INSUMOS']);
const DEFAULT_BILLING_FORM = {
  enabled: false,
  doc_type: 'boleta',
  customer_doc_type: '1',
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
  } = useStaffOrderCart(modifiers);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [sendingCloseMail, setSendingCloseMail] = useState(false);
  const [activeCajaOption, setActiveCajaOption] = useState(searchParams.get('view') || 'cobrar');
  const [closingData, setClosingData] = useState(null);
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
  const [cajaPrintCfg, setCajaPrintCfg] = useState(null);
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
      const [tablesData, reg, status, stationsRes, prods, cats, modifiersData, cfg, daily, reservationsData, ordersData, printCfgRes] = await Promise.all([
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
        api.get('/orders/print-config').catch(() => null),
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
      setCajaPrintCfg(printCfgRes?.printers?.caja || null);
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
        } else {
          const updated = tablesData.find((t) => t.id === selectedTable.id);
          if (updated) setSelectedTable(updated);
        }
      }
      if (tableDetail) {
        const updatedDetail = tablesData.find(t => t.id === tableDetail.id);
        if (updatedDetail) setTableDetail(updatedDetail);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadData();
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
  }, [billingForm.doc_type, billingForm.customer_doc_type]);

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
    const caja = cajaPrintCfg;
    if (String(caja?.connection || '').toLowerCase() === 'wifi' && String(caja?.ip_address || '').trim()) {
      const text = String(content.innerText || content.textContent || '')
        .replace(/\r\n/g, '\n')
        .trim()
        .slice(0, 12000);
      if (text) {
        try {
          const copies = Math.min(5, Math.max(1, Number(caja.copies || 1)));
          await api.post('/orders/print-network', { station: 'caja', text, copies });
          toast.success('Enviado a impresora de caja (red)');
          return;
        } catch (err) {
          toast.error(err.message || 'No se pudo imprimir por red; se abrirá el navegador');
        }
      }
    }
    const printWin = window.open('', '_blank', 'width=400,height=700');
    printWin.document.write(`
      <html><head><title>Arqueo de Caja</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; max-width: 380px; margin: 0 auto; }
        h2 { text-align: center; margin: 5px 0; font-size: 16px; }
        h3 { text-align: center; margin: 3px 0; font-size: 12px; font-weight: normal; color: #666; }
        .sep { border-top: 1px dashed #333; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .row.bold { font-weight: bold; }
        .center { text-align: center; }
        .total-row { font-size: 14px; font-weight: bold; border-top: 2px solid #333; padding-top: 5px; margin-top: 5px; }
        .diff-pos { color: #16a34a; }
        .diff-neg { color: #dc2626; }
      </style></head><body>
      ${content.innerHTML}
      <div class="sep"></div>
      <p class="center" style="font-size:10px;color:#999">Impreso: ${new Date().toLocaleString('es-PE')}</p>
      <script>window.print();window.onafterprint=()=>window.close();</script>
      </body></html>
    `);
    printWin.document.close();
  };

  const resetBillingForm = () => {
    setBillingForm(DEFAULT_BILLING_FORM);
    setBillingResult(null);
    setMatchedCustomer(null);
    setSearchingCustomer(false);
  };

  const normalizeDocNumber = (value) => String(value || '').replace(/\D/g, '');

  const getActiveDocType = () => (billingForm.doc_type === 'factura' ? '6' : billingForm.customer_doc_type);

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
    return num || 'Comprobante registrado';
  };

  const validateBillingData = () => {
    if (!billingForm.enabled) return null;
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
      invoice_lines_mode: billingForm.invoice_lines_mode,
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

      if (!isClientCheckoutTable(selectedTable)) {
        const updatedTable = await api.get(`/tables/${selectedTable.id}`);
        if (!updatedTable.orders || updatedTable.orders.length === 0) {
          await api.patch(`/tables/${selectedTable.id}/status`, { status: 'available' });
        }
      }
      if (issuedDocs.length > 0) {
        const detail = issuedDocs.map(billingSuccessSummary).join(' · ');
        toast.success(`${payableOrders.length} pedido(s) cobrados. ${detail}`);
        const pdf = issuedDocs.find((d) => d?.pdf_url)?.pdf_url;
        if (pdf) window.open(pdf, '_blank');
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
    setQuickSaleMode(false);
    setSelectedTable(table);
    setShowMenu(true);
    resetCart();
    setSearch('');
    setSelectedCat('all');
    setAmountReceived('');
    resetBillingForm();
  };

  const openQuickSaleMenu = () => {
    setQuickSaleMode(true);
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

  const submitOrder = async () => {
    if (cart.length === 0) return toast.error('Agrega productos al pedido');
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
    const tid = toast.loading(quickSaleMode ? 'Registrando venta…' : 'Enviando pedido…');
    try {
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
          if (doc?.pdf_url) window.open(doc.pdf_url, '_blank');
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
  const filteredProducts = products.filter(p => {
    if (selectedCat !== 'all' && p.category_id !== selectedCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
  const printPrecuenta = () => {
    if (!selectedTable) return;
    const payableOrders = splitMode
      ? (selectedTable.orders || []).filter(o => selectedOrderIds.includes(o.id))
      : (selectedTable.orders || []);
    if (payableOrders.length === 0) return toast.error('No hay pedidos para precuenta');
    const itemLines = payableOrders
      .flatMap(o => o.items || [])
      .map(i => `<tr><td style="padding:4px 0">${i.quantity}x ${i.product_name}</td><td style="text-align:right;padding:4px 0">${formatCurrency(i.subtotal)}</td></tr>`)
      .join('');
    const w = window.open('', '_blank', 'width=420,height=720');
    if (!w) return toast.error('No se pudo abrir la precuenta');
    w.document.write(`
      <html><head><title>Precuenta ${selectedTable.name}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;padding:16px}
        .muted{color:#64748b}.sep{border-top:1px dashed #cbd5e1;margin:8px 0}
        table{width:100%;border-collapse:collapse}
      </style></head><body>
      <h3>PRECUENTA - ${selectedTable.name}</h3>
      <p class="muted">${new Date().toLocaleString('es-PE')} · ${user?.full_name || 'Cajero/a'}</p>
      <div class="sep"></div>
      <table>${itemLines}</table>
      <div class="sep"></div>
      <p><strong>Subtotal:</strong> ${formatCurrency(selectionBaseTotal)}</p>
      <p><strong>Descuento:</strong> ${formatCurrency(discountPreview)}</p>
      <p style="font-size:16px"><strong>Total a pagar:</strong> ${formatCurrency(payableTotal)}</p>
      <script>window.print(); window.onafterprint = () => window.close();</script>
      </body></html>
    `);
    w.document.close();
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
                            {op.opened_at
                              ? `· ${new Date(`${op.opened_at}Z`).toLocaleString('es-PE')}`
                              : ''}
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

  const printTableOrder = (table) => {
    if (!table) return;
    const items = (table.orders || []).flatMap(o => o.items || []);
    if (!items.length) return toast.error('La mesa no tiene pedidos para precuenta');
    const itemLines = items
      .map(i => `<tr><td style="padding:4px 0">${i.quantity}x ${i.product_name}</td><td style="text-align:right;padding:4px 0">${formatCurrency(i.subtotal)}</td></tr>`)
      .join('');
    const w = window.open('', '_blank', 'width=420,height=700');
    if (!w) return toast.error('No se pudo abrir la impresión de precuenta');
    w.document.write(`
      <html><head><title>Precuenta ${table.name}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;padding:16px}
        .muted{color:#64748b}.sep{border-top:1px dashed #cbd5e1;margin:8px 0}
        table{width:100%;border-collapse:collapse}
      </style></head><body>
      <h3>PRECUENTA - ${table.name}</h3>
      <p class="muted">${new Date().toLocaleString('es-PE')} · ${user?.full_name || 'Cajero/a'}</p>
      <div class="sep"></div>
      <table>${itemLines}</table>
      <div class="sep"></div>
      <p style="font-size:16px"><strong>Total a pagar:</strong> ${formatCurrency((table.orders || []).reduce((sum, o) => sum + getOrderChargeTotal(o), 0))}</p>
      <script>window.print(); window.onafterprint = () => window.close();</script>
      </body></html>
    `);
    w.document.close();
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
      <div className="flex items-center justify-between mb-3 gap-2">
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
        <button
          onClick={openQuickSaleMenu}
          className="px-3 py-2 rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] font-medium text-sm flex items-center gap-2"
        >
          <MdPointOfSale className="text-base" /> Venta rápida
        </button>
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

      {tableDetail && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-slate-800">{tableDetail.name}</h3>
              <p className="text-xs text-slate-500">
                {tableDetail.orders?.length ? `${tableDetail.orders.length} pedido(s) activo(s)` : 'Sin pedidos activos'}
              </p>
            </div>
            <p className="text-xl font-bold text-gold-600">{formatCurrency((tableDetail.orders || []).reduce((sum, o) => sum + getOrderChargeTotal(o), 0))}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <button
              onClick={() => openMenuForTable(tableDetail)}
              className="w-full py-2 rounded-lg text-sm font-medium bg-sky-100 text-sky-700 hover:bg-sky-200 flex items-center justify-center gap-2"
            >
              <MdRestaurantMenu /> Tomar Pedido
            </button>
            <button
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
              className="btn-primary w-full py-2 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MdAttachMoney /> Cobrar Mesa
            </button>
            <button
              onClick={() => printTableOrder(tableDetail)}
              disabled={!tableDetail.orders?.length}
              className="w-full py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MdPrint /> Imprimir Precuenta
            </button>
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
                    <td className="py-2">{r.opened_at ? new Date(`${r.opened_at}Z`).toLocaleString('es-PE') : '-'}</td>
                    <td className="py-2">{r.closed_at ? new Date(`${r.closed_at}Z`).toLocaleString('es-PE') : 'Abierta'}</td>
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
      </div>

      {/* Modal tomar pedido / venta rápida */}
      <Modal
        isOpen={showMenu}
        onClose={() => {
          setShowMenu(false);
          setQuickSaleMode(false);
          setAmountReceived('');
          resetBillingForm();
          resetCart();
        }}
        title={quickSaleMode ? 'Venta rápida' : `Agregar Pedido — ${selectedTable?.name || ''}`}
        size="xl"
      >
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
          minHeightClass="min-h-[60vh]"
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
                <div className="rounded-lg border border-[#3B82F6]/30 bg-[#111827] p-2 space-y-2">
                  {!billingForm.enabled && (
                    <p className="text-[11px] text-[#9CA3AF]">Activa «Emitir comprobante» debajo del total para completar boleta o factura.</p>
                  )}
                  {billingForm.enabled && (
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={openCustomerModal}
                          className="px-2 py-1 rounded-lg border border-[#3B82F6]/50 text-[#BFDBFE] text-xs font-medium hover:bg-[#2563EB]/20 flex items-center gap-1"
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
                        </select>
                        <select
                          className="input-field"
                          value={billingForm.customer_doc_type}
                          onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_doc_type: e.target.value }))}
                          disabled={billingForm.doc_type === 'factura'}
                        >
                          <option value="1">DNI</option>
                          <option value="6">RUC</option>
                          <option value="0">Sin documento</option>
                        </select>
                      </div>
                      <div className="rounded-lg border border-[#3B82F6]/25 bg-[#0F172A]/60 p-2 space-y-1.5">
                        <p className="text-[11px] font-medium text-[#E5E7EB]">Detalle en el comprobante</p>
                        <div className="flex flex-wrap gap-3 text-xs text-[#D1D5DB]">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="invoice_lines_quick"
                              checked={billingForm.invoice_lines_mode === 'detallado'}
                              onChange={() => setBillingForm((prev) => ({ ...prev, invoice_lines_mode: 'detallado' }))}
                              className="border-[#3B82F6]/50"
                            />
                            Detallado (cada producto)
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="invoice_lines_quick"
                              checked={billingForm.invoice_lines_mode === 'consumo'}
                              onChange={() => setBillingForm((prev) => ({ ...prev, invoice_lines_mode: 'consumo' }))}
                              className="border-[#3B82F6]/50"
                            />
                            Por consumo (una línea)
                          </label>
                        </div>
                      </div>
                      <input
                        className="input-field"
                        placeholder="N° documento"
                        value={billingForm.customer_doc_number}
                        onChange={(e) =>
                          setBillingForm((prev) => ({ ...prev, customer_doc_number: normalizeDocNumber(e.target.value) }))
                        }
                      />
                      <input
                        className="input-field"
                        placeholder={billingForm.doc_type === 'factura' ? 'Razón social' : 'Nombre cliente'}
                        value={billingForm.customer_name}
                        onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                      />
                      <input
                        className="input-field"
                        placeholder="Celular del cliente (para enviar comprobante por WhatsApp)"
                        value={billingForm.customer_phone}
                        onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
                      />
                      {searchingCustomer && <p className="text-[11px] text-[#9CA3AF]">Buscando cliente por DNI/RUC...</p>}
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
                      onChange={(e) => setBillingForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                      className="rounded border-[#3B82F6]/50"
                    />
                    Emitir comprobante (boleta o factura)
                  </label>
                )}
                <button type="button" onClick={submitOrder} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                  <MdReceipt /> {quickSaleMode ? 'Cobrar venta rápida' : 'Enviar Pedido'}
                </button>
              </>
            ) : null
          }
        />
        ) : selectedTable ? (
          <StaffMesaPedidoTabs
            orders={selectedTable.orders || []}
            formatCurrency={formatCurrency}
            resetKey={selectedTable.id}
            className="min-h-[60vh] max-h-[min(90vh,780px)] flex-1 min-h-0"
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
                  <>
                    <div className="flex justify-between font-bold text-lg text-white">
                      <span>Total</span>
                      <span className="text-[#BFDBFE]">{formatCurrency(cartTotal)}</span>
                    </div>
                    <button type="button" onClick={submitOrder} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                      <MdReceipt /> Enviar Pedido
                    </button>
                  </>
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
            minHeightClass="min-h-[60vh]"
            footer={
              cart.length > 0 ? (
                <>
                  <div className="flex justify-between font-bold text-lg text-white">
                    <span>Total</span>
                    <span className="text-[#BFDBFE]">{formatCurrency(cartTotal)}</span>
                  </div>
                  <button type="button" onClick={submitOrder} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                    <MdReceipt /> Enviar Pedido
                  </button>
                </>
              ) : null
            }
          />
        )}
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
        title={selectedTable && isClientCheckoutTable(selectedTable) ? 'COBRAR CUENTA CLIENTE' : 'COBRAR MESA'}
        size="xl"
        headerClassName="bg-[#1D4ED8]/40 border-b border-[#3B82F6]/30"
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
                  <div className="rounded-xl border border-[#3B82F6]/35 bg-[#111827]/70 backdrop-blur-md shadow-lg shadow-black/20 p-3 sm:p-4 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex flex-col flex-1 min-h-0 gap-2">
                      {!billingForm.enabled ? (
                        <>
                          <h3 className="text-base font-bold text-[#F9FAFB] shrink-0">Pedidos</h3>
                          <div className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.25rem] gap-2 text-[10px] sm:text-xs font-semibold text-[#9CA3AF] border-b border-[#3B82F6]/25 pb-2 shrink-0">
                            <span>Producto</span>
                            <span className="text-center tabular-nums">Cant.</span>
                            <span className="text-right tabular-nums">P. unit.</span>
                            <span className="text-right tabular-nums">Total</span>
                          </div>
                          <div className="overflow-y-auto flex-1 space-y-2 max-h-[min(28vh,220px)] pr-1">
                            {splitMode ? (
                              (selectedTable.orders || []).map((order) => {
                                const sel = selectedOrderIds.includes(order.id);
                                const groupedOrderLines = groupItemsByProductNameForBill(order.items || []);
                                return (
                                  <div
                                    key={order.id}
                                    className={`rounded-lg border p-2 ${
                                      sel ? 'border-[#3B82F6]/50 bg-[#1D4ED8]/10' : 'border-[#3B82F6]/20 bg-[#111827]/40 opacity-70'
                                    }`}
                                  >
                                    <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                                      <input
                                        type="checkbox"
                                        checked={sel}
                                        onChange={() => toggleOrderSelection(order.id)}
                                        className="rounded border-[#3B82F6]/50"
                                      />
                                      <span className="text-xs font-bold text-[#BFDBFE]">Pedido #{order.order_number}</span>
                                    </label>
                                    <div className="space-y-0.5 pl-2 sm:pl-4">
                                      {groupedOrderLines.map((row) => (
                                        <div
                                          key={row.key}
                                          className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.25rem] gap-2 text-xs sm:text-sm text-[#D1D5DB] py-0.5 border-b border-[#3B82F6]/10 last:border-0"
                                        >
                                          <span className="min-w-0 truncate">{row.name}</span>
                                          <span className="text-center tabular-nums text-[#F9FAFB]">{row.qty}</span>
                                          <span className="text-right tabular-nums text-[#D1D5DB]">{formatCurrency(row.unitPrice)}</span>
                                          <span className="text-right tabular-nums font-medium text-[#F9FAFB]">{formatCurrency(row.subtotal)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })
                            ) : billLineItemsGrouped.length === 0 ? (
                              <p className="text-sm text-[#9CA3AF] text-center py-6">Sin ítems</p>
                            ) : (
                              billLineItemsGrouped.map((row) => (
                                <div
                                  key={row.key}
                                  className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.25rem] gap-2 text-sm text-[#D1D5DB] py-1.5 border-b border-[#3B82F6]/10 last:border-0"
                                >
                                  <span className="min-w-0 truncate">{row.name}</span>
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
                              className="px-2 py-1 rounded-lg border border-[#3B82F6]/50 text-[#BFDBFE] text-xs font-medium hover:bg-[#2563EB]/20 flex items-center gap-1 shrink-0"
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
                            </select>
                            <select
                              className="input-field text-sm"
                              value={billingForm.customer_doc_type}
                              onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_doc_type: e.target.value }))}
                              disabled={billingForm.doc_type === 'factura'}
                            >
                              <option value="1">DNI</option>
                              <option value="6">RUC</option>
                              <option value="0">Sin documento</option>
                            </select>
                            <div className="sm:col-span-2 rounded-lg border border-[#3B82F6]/25 bg-[#0F172A]/60 p-2 space-y-1.5">
                              <p className="text-xs font-medium text-[#E5E7EB]">Detalle en el comprobante</p>
                              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 text-xs text-[#D1D5DB]">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="invoice_lines_mesa"
                                    checked={billingForm.invoice_lines_mode === 'detallado'}
                                    onChange={() => setBillingForm((prev) => ({ ...prev, invoice_lines_mode: 'detallado' }))}
                                    className="border-[#3B82F6]/50"
                                  />
                                  Detallado (cada producto)
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="invoice_lines_mesa"
                                    checked={billingForm.invoice_lines_mode === 'consumo'}
                                    onChange={() => setBillingForm((prev) => ({ ...prev, invoice_lines_mode: 'consumo' }))}
                                    className="border-[#3B82F6]/50"
                                  />
                                  Por consumo (una línea)
                                </label>
                              </div>
                            </div>
                            <input
                              className="input-field text-sm"
                              placeholder="N° documento"
                              value={billingForm.customer_doc_number}
                              onChange={(e) =>
                                setBillingForm((prev) => ({ ...prev, customer_doc_number: normalizeDocNumber(e.target.value) }))
                              }
                            />
                            <input
                              className="input-field text-sm"
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
                                placeholder="Para enviar el PDF del comprobante por WhatsApp"
                                value={billingForm.customer_phone}
                                onChange={(e) => setBillingForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              {searchingCustomer && <p className="text-xs text-[#9CA3AF]">Buscando cliente por DNI/RUC...</p>}
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
                              className="px-3 py-2 rounded-lg border border-[#3B82F6]/40 text-[#BFDBFE] text-xs"
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
                <div className="lg:border-l lg:border-[#3B82F6]/25 lg:pl-4">
                  <div className="rounded-xl border border-[#3B82F6]/35 bg-[#111827]/70 backdrop-blur-md p-3 sm:p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-bold text-[#F9FAFB] shrink-0">Cobro</h3>
                      <p className="text-base sm:text-lg font-extrabold text-[#F9FAFB] tracking-wide text-right leading-tight">
                        {selectedTable?.name?.trim()
                          || (selectedTable?.number != null && selectedTable?.number !== ''
                            ? `Mesa ${selectedTable.number}`
                            : '—')}
                      </p>
                    </div>
                    <div className="text-right border-b border-[#3B82F6]/25 pb-3">
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
                            onClick={() => window.open(billingResult.pdf_url, '_blank')}
                          >
                            Ver PDF
                          </button>
                        )}
                      </div>
                    )}

                    <label className="flex items-start gap-2 text-sm font-medium text-[#F9FAFB] cursor-pointer pt-1 border-t border-[#3B82F6]/20">
                      <input
                        type="checkbox"
                        checked={billingForm.enabled}
                        onChange={(e) => setBillingForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                        className="rounded border-[#3B82F6]/50 mt-0.5"
                      />
                      <span>Emitir comprobante (boleta o factura) en esta cobranza</span>
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
            <div className="shrink-0 flex flex-wrap items-center gap-3 py-3 px-1 mt-1 border-t border-[#3B82F6]/40 bg-[#0f172a]/95 backdrop-blur-md rounded-b-lg">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={togglePartialSelection}
                  className="px-4 py-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1D4ED8] text-white text-sm font-semibold border border-[#3B82F6]/40 shadow-md shadow-black/20"
                >
                  {splitMode ? 'Cerrar dividir cuentas' : 'Dividir cuentas'}
                </button>
                <button
                  type="button"
                  onClick={handleDiscountButton}
                  className="px-4 py-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1D4ED8] text-white text-sm font-semibold border border-[#3B82F6]/40 shadow-md shadow-black/20"
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
      <Modal isOpen={showCloseModal} onClose={() => setShowCloseModal(false)} title="Arqueo y Cierre de Caja" size="lg">
        {closingData && (
          <div>
            <div ref={printRef}>
              <h2>ARQUEO DE CAJA</h2>
              <h3>{user?.full_name} — {new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
              <div className="sep"></div>
              <div className="row"><span>Apertura:</span><span>{new Date(closingData.opened_at).toLocaleString('es-PE')}</span></div>
              <div className="row"><span>Cierre:</span><span>{new Date().toLocaleString('es-PE')}</span></div>
              <div className="sep"></div>
              <div className="row bold"><span>MONTO APERTURA</span><span>{formatCurrency(openingAmt)}</span></div>
              <div className="sep"></div>
              <div className="row"><span>Ventas en Efectivo</span><span>{formatCurrency(totalCash)}</span></div>
              <div className="row"><span>Ventas en Yape</span><span>{formatCurrency(totalYape)}</span></div>
              <div className="row"><span>Ventas en Plin</span><span>{formatCurrency(totalPlin)}</span></div>
              <div className="row"><span>Ventas en Tarjeta</span><span>{formatCurrency(totalCard)}</span></div>
              <div className="sep"></div>
              <div className="row total-row"><span>TOTAL VENTAS</span><span>{formatCurrency(registerSales)}</span></div>
              <div className="row bold"><span>N° de operaciones</span><span>{closingData.order_count || 0}</span></div>
              <div className="sep"></div>
              <div className="row bold"><span>EFECTIVO ESPERADO</span><span>{formatCurrency(expectedCash)}</span></div>
              <div className="row"><span style={{ fontSize: '10px', color: '#888' }}>(Apertura + Ventas Efectivo)</span></div>
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
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2"><MdAccountBalanceWallet /> Resumen de Ventas</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border">
                    <p className="text-xs text-slate-400">Efectivo</p>
                    <p className="font-bold text-lg text-emerald-600">{formatCurrency(totalCash)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <p className="text-xs text-slate-400">Yape</p>
                    <p className="font-bold text-lg text-purple-600">{formatCurrency(totalYape)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <p className="text-xs text-slate-400">Plin</p>
                    <p className="font-bold text-lg text-sky-600">{formatCurrency(totalPlin)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <p className="text-xs text-slate-400">Tarjeta</p>
                    <p className="font-bold text-lg text-gold-600">{formatCurrency(totalCard)}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200">
                  <span className="font-bold text-slate-700">Total Ventas</span>
                  <span className="font-bold text-xl text-emerald-600">{formatCurrency(registerSales)}</span>
                </div>
              </div>

              <div className="bg-gold-50 rounded-xl p-4 border border-gold-200">
                <h3 className="font-semibold text-slate-700 mb-3">Conteo de Efectivo</h3>
                <div className="mb-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">Arqueo por denominación</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {denomDefs.map(d => (
                      <div key={d.key} className="bg-white rounded-lg border p-2">
                        <label className="block text-xs text-slate-500 mb-1">{d.label}</label>
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
                          <span className="text-xs font-semibold text-slate-500 min-w-16 text-right">
                            {formatCurrency((parseFloat(denominations[d.key]) || 0) * d.value)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-2 p-2 rounded-lg bg-white border border-gold-200">
                    <span className="text-xs font-medium text-slate-600">Total por arqueo</span>
                    <span className="font-bold text-gold-700">{formatCurrency(calculateDenominationTotal())}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Efectivo esperado en caja</label>
                    <div className="bg-white rounded-lg p-3 border">
                      <p className="font-bold text-lg">{formatCurrency(expectedCash)}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Efectivo contado real</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">S/</span>
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
                  <div className={`flex items-center justify-between p-3 rounded-lg ${
                    difference === 0 ? 'bg-emerald-100 border border-emerald-300' :
                    difference > 0 ? 'bg-sky-100 border border-sky-300' :
                    'bg-red-100 border border-red-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      {difference === 0 ? <MdCheckCircle className="text-emerald-600 text-xl" /> :
                       difference > 0 ? <MdTrendingUp className="text-sky-600 text-xl" /> :
                       <MdTrendingDown className="text-red-600 text-xl" />}
                      <span className="font-medium text-sm">
                        {difference === 0 ? 'Caja cuadrada' :
                         difference > 0 ? 'Sobrante' : 'Faltante'}
                      </span>
                    </div>
                    <span className={`font-bold text-lg ${
                      difference === 0 ? 'text-emerald-700' :
                      difference > 0 ? 'text-sky-700' : 'text-red-700'
                    }`}>
                      {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones</label>
                <textarea
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  className="input-field"
                  rows="2"
                  placeholder="Notas sobre el turno, incidencias, etc."
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 mt-4 border-t border-slate-200">
              <button onClick={() => setShowCloseModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handlePrint} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm border border-slate-300">
                <MdPrint /> Enviar a impresora
              </button>
              <button
                onClick={sendCloseByEmail}
                disabled={sendingCloseMail}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
