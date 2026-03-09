import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, formatCurrency, getPaymentMethodOptions } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { useActiveInterval } from '../../hooks/useActiveInterval';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import {
  MdPointOfSale, MdTableRestaurant, MdReceipt, MdPrint,
  MdCheckCircle, MdAttachMoney, MdPeople, MdClose,
  MdAccountBalanceWallet, MdTrendingUp, MdTrendingDown,
  MdAdd, MdRemove, MdDelete, MdSearch, MdShoppingCart, MdRestaurantMenu,
  MdAccessTime, MdPersonAdd, MdEmail, MdEditNote
} from 'react-icons/md';

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
};
const EMPTY_CUSTOMER_FORM = {
  doc_type: '1',
  doc_number: '',
  name: '',
  phone: '',
  address: '',
  email: '',
};

const getOrderChargeTotal = (order) => {
  if (!order) return 0;
  const base = Number(order.subtotal || 0) + Number(order.delivery_fee || 0);
  const discount = Number(order.discount || 0);
  return Math.max(0, base - discount);
};

export default function POSPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [billTab, setBillTab] = useState('cuenta');
  const [splitMode, setSplitMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [discountConfig, setDiscountConfig] = useState({ active: false, applied: false, type: 'amount', value: '', reason: '' });
  const [showMenu, setShowMenu] = useState(false);
  const [quickSaleMode, setQuickSaleMode] = useState(false);
  const [products, setProducts] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [noteEditorLineKey, setNoteEditorLineKey] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [paymentOptions, setPaymentOptions] = useState(getPaymentMethodOptions(null, { includeOnline: false }));
  const [amountReceived, setAmountReceived] = useState('');
  const [billingForm, setBillingForm] = useState(DEFAULT_BILLING_FORM);
  const [billingResult, setBillingResult] = useState(null);
  const [modifierPrompt, setModifierPrompt] = useState({
    open: false,
    product: null,
    modifier: null,
    selectedOption: '',
  });
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
  const { user } = useAuth();
  const openCajaView = (view) => {
    setActiveCajaOption(view);
    setSearchParams({ view }, { replace: true });
  };

  const loadData = async () => {
    try {
      const [tablesData, reg, status, prods, cats, modifiersData, cfg, daily, reservationsData, ordersData] = await Promise.all([
        api.get('/tables'),
        api.get('/pos/current-register'),
        api.get('/pos/register-status'),
        api.get('/products?active_only=true'),
        api.get('/categories/active'),
        api.get('/admin-modules/modifiers').catch(() => []),
        api.get('/admin-modules/config/app').catch(() => null),
        api.get('/reports/daily').catch(() => null),
        api.get('/admin-modules/reservations').catch(() => []),
        api.get('/orders?limit=600').catch(() => []),
      ]);
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
        const updated = tablesData.find(t => t.id === selectedTable.id);
        if (updated) setSelectedTable(updated);
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
        api.get('/pos/movements?type=income'),
        api.get('/pos/movements?type=expense'),
        api.get('/pos/notes?note_type=credit'),
        api.get('/pos/notes?note_type=debit'),
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

  useEffect(() => { loadCajaExtras(); }, [register?.id]);

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

  const openRegister = async () => {
    if (openingAmount === '') return toast.error('Ingresa el monto inicial de caja');
    const amount = parseFloat(openingAmount);
    if (Number.isNaN(amount) || amount < 0) return toast.error('El monto inicial no es válido');
    try {
      const reg = await api.post('/pos/open-register', { opening_amount: amount });
      setRegister(reg);
      setRegisterStatus({ is_open: true, register: { user_id: user?.id, cajero_name: user?.full_name, opened_at: reg.opened_at } });
      setOpeningAmount('');
      toast.success(`Caja abierta con ${formatCurrency(amount)}`);
    } catch (err) { toast.error(err.message); }
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
      });
      toast.success('Caja cerrada — Informe guardado');
      setShowCloseModal(false);
      setRegister(null);
    } catch (err) { toast.error(err.message); }
  };
  const sendCloseByEmail = async () => {
    if (closingAmount === '') return toast.error('Ingresa el efectivo contado para enviar el reporte');
    const amount = parseFloat(closingAmount);
    if (Number.isNaN(amount) || amount < 0) return toast.error('El efectivo contado no es válido');
    try {
      setSendingCloseMail(true);
      await api.post('/pos/send-close-email', {
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

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
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
    }));
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
      customer: {
        doc_type: billingForm.customer_doc_type,
        doc_number: billingForm.customer_doc_number,
        name: billingForm.customer_name,
        address: billingForm.customer_address,
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
        email: String(customerForm.email || '').trim(),
      });
      applyCustomerToBilling(created);
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

      await api.post('/pos/checkout-table', {
        order_ids: payableOrders.map(o => o.id),
        payment_method: paymentMethod,
        discount_reason: discountConfig.reason,
        discounts_by_order: discountsByOrder,
      });

      const issuedDocs = [];
      if (billingForm.enabled) {
        for (const order of payableOrders) {
          const doc = await issueElectronicDocument(order.id);
          issuedDocs.push(doc);
        }
      }

      const updatedTable = await api.get(`/tables/${selectedTable.id}`);
      if (!updatedTable.orders || updatedTable.orders.length === 0) {
        await api.patch(`/tables/${selectedTable.id}/status`, { status: 'available' });
      }
      if (issuedDocs.length > 0) {
        toast.success(`${payableOrders.length} pedido(s) cobrados y ${issuedDocs.length} comprobante(s) generado(s)`);
        if (issuedDocs.length === 1 && issuedDocs[0]?.pdf_url) {
          window.open(issuedDocs[0].pdf_url, '_blank');
        }
      } else {
        toast.success(`${payableOrders.length} pedido(s) cobrados en ${selectedTable.name}`);
      }
      setShowBill(false);
      setSplitMode(false);
      setSelectedOrderIds([]);
      setDiscountConfig({ active: false, applied: false, type: 'amount', value: '', reason: '' });
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
    if (splitMode) {
      setSplitMode(false);
      setSelectedOrderIds((selectedTable?.orders || []).map(o => o.id));
    } else {
      setSplitMode(true);
      setSelectedOrderIds([]);
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
    setCart([]);
    setNoteEditorLineKey('');
    setSearch('');
    setSelectedCat('all');
    setAmountReceived('');
    setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' });
    resetBillingForm();
  };

  const openQuickSaleMenu = () => {
    setQuickSaleMode(true);
    setSelectedTable(null);
    setPaymentMethod('efectivo');
    setShowMenu(true);
    setCart([]);
    setNoteEditorLineKey('');
    setSearch('');
    setSelectedCat('all');
    setAmountReceived('');
    setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' });
    resetBillingForm();
  };

  const appendToCart = (product, { modifierId = '', modifierName = '', modifierOption = '' } = {}) => {
    const lineKey = `${product.id}::${modifierId}::${modifierOption}`;
    setCart(prev => {
      const existing = prev.find(i => i.line_key === lineKey);
      if (existing) return prev.map(i => i.line_key === lineKey ? { ...i, quantity: i.quantity + 1 } : i);
      return [
        ...prev,
        {
          line_key: lineKey,
          product_id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          modifier_id: modifierId,
          modifier_name: modifierName,
          modifier_option: modifierOption,
          note_required: Number(product.note_required || 0) === 1 ? 1 : 0,
          notes: '',
        },
      ];
    });
  };

  const addToCart = (product) => {
    const modifierId = String(product?.modifier_id || '').trim();
    if (!modifierId) {
      appendToCart(product);
      return;
    }
    const modifier = (modifiers || []).find(m => m.id === modifierId && Number(m.active ?? 1) === 1);
    if (!modifier) {
      appendToCart(product);
      return;
    }
    const options = Array.isArray(modifier.options) ? modifier.options.filter(Boolean) : [];
    if (options.length === 0) {
      if (Number(modifier.required || 0) === 1) {
        toast.error(`El modificador "${modifier.name}" no tiene opciones configuradas`);
        return;
      }
      appendToCart(product);
      return;
    }
    setModifierPrompt({
      open: true,
      product,
      modifier,
      selectedOption: '',
    });
  };

  const confirmModifierForCart = () => {
    const modifier = modifierPrompt.modifier;
    const product = modifierPrompt.product;
    if (!modifier || !product) return;
    const required = Number(modifier.required || 0) === 1;
    const option = String(modifierPrompt.selectedOption || '').trim();
    if (required && !option) {
      toast.error(`Debes seleccionar ${modifier.name}`);
      return;
    }
    appendToCart(product, {
      modifierId: modifier.id,
      modifierName: modifier.name,
      modifierOption: option,
    });
    setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' });
  };

  const addProductWithoutOptionalModifier = () => {
    const modifier = modifierPrompt.modifier;
    const product = modifierPrompt.product;
    if (!modifier || !product) return;
    const required = Number(modifier.required || 0) === 1;
    if (required) return;
    appendToCart(product);
    setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' });
  };

  const updateQty = (lineKey, delta) => {
    setCart(prev => prev.map(i => {
      if (i.line_key !== lineKey) return i;
      const newQty = i.quantity + delta;
      return newQty > 0 ? { ...i, quantity: newQty } : i;
    }).filter(i => i.quantity > 0));
  };

  const removeFromCart = (lineKey) => setCart(prev => prev.filter(i => i.line_key !== lineKey));
  const updateItemNote = (lineKey, nextNote) => {
    setCart(prev => prev.map(i => (i.line_key === lineKey ? { ...i, notes: String(nextNote || '') } : i)));
  };
  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
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
        await api.put(`/orders/${createdOrder.id}/payment`, {
          payment_method: paymentMethod,
          payment_status: 'paid',
        });
        await api.put(`/orders/${createdOrder.id}/status`, { status: 'delivered' });
        if (billingForm.enabled) {
          const doc = await issueElectronicDocument(createdOrder.id);
          toast.success(`Venta rápida cobrada · ${doc.full_number || 'Comprobante generado'}`);
          if (doc?.pdf_url) window.open(doc.pdf_url, '_blank');
        } else {
          toast.success('Venta rápida cobrada');
        }
      } else {
        toast.success(`Pedido agregado a ${selectedTable.name}`);
      }
      setShowMenu(false);
      setQuickSaleMode(false);
      setCart([]);
      setNoteEditorLineKey('');
      setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' });
      setAmountReceived('');
      resetBillingForm();
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const registerMovement = async (type) => {
    const amount = parseFloat(movementForm.amount);
    if (Number.isNaN(amount) || amount <= 0) return toast.error('Monto inválido');
    try {
      await api.post('/pos/movements', { type, amount, concept: movementForm.concept });
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
      await api.post('/pos/notes', { note_type: noteType, amount, reason: noteForm.reason });
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
    const blockedByOther = false;
    return (
      <div className="flex items-center justify-center py-20">
        <div className="card text-center max-w-md">
          <MdPointOfSale className="text-6xl text-gold-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Abrir Caja</h2>
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
                onChange={e => setOpeningAmount(e.target.value)}
                placeholder="0.00"
                className="input-field pl-10 text-lg font-bold text-center"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Dinero en efectivo al iniciar el turno</p>
            {blockedByOther && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-700 font-medium">
                  Caja en uso por {registerStatus.register?.cajero_name || 'otro usuario'}
                </p>
                <p className="text-xs text-amber-600">
                  Abierta: {registerStatus.register?.opened_at ? new Date(`${registerStatus.register.opened_at}Z`).toLocaleString('es-PE') : '-'}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={openRegister}
            disabled={openingAmount === '' || blockedByOther}
            className="btn-primary w-full py-3 text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MdPointOfSale /> {blockedByOther ? 'Caja en uso' : 'Abrir Caja'}
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

          {tableDetail.orders?.length ? (
            <div className="space-y-1 mb-3">
              {tableDetail.orders.flatMap(o => o.items || []).map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-slate-600">
                  <span>{item.quantity}x {item.product_name}</span>
                  <span>{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mb-3">Esta mesa está libre por ahora.</p>
          )}

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
                setBillTab('cuenta');
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
                    <td className="py-2 text-right">{p.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* Modal Cobrar Mesa */}
      <Modal
        isOpen={showMenu}
        onClose={() => {
          setShowMenu(false);
          setQuickSaleMode(false);
          setAmountReceived('');
          resetBillingForm();
        }}
        title={quickSaleMode ? 'Venta rápida' : `Agregar Pedido — ${selectedTable?.name || ''}`}
        size="xl"
      >
        <div className="flex gap-4" style={{ minHeight: '60vh' }}>
          <div className="flex-1 flex flex-col">
            <div className="mb-3">
              <div className="relative">
                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="input-field pl-10" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap mb-3">
              <button onClick={() => setSelectedCat('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCat === 'all' ? 'bg-gold-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Todos</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setSelectedCat(c.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCat === c.id ? 'bg-gold-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{c.name}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {filteredProducts.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)} className="bg-slate-50 rounded-xl p-3 text-left hover:shadow-md transition-shadow border border-slate-100 hover:border-gold-300">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-gold-600 font-bold text-sm mt-1">{formatCurrency(p.price)}</p>
                    <p className="text-xs text-slate-400">Stock: {p.stock}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="w-72 border-l pl-4 flex flex-col">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <MdShoppingCart /> Pedido
              {cart.length > 0 && <span className="text-xs bg-gold-100 text-gold-600 px-2 py-0.5 rounded-full">{cart.length}</span>}
            </h3>

            {quickSaleMode && (
              <div className="mb-3 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Método de pago</label>
                  <select className="input-field" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    {paymentOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {paymentMethod === 'efectivo' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Paga con</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-field"
                        value={amountReceived}
                        onChange={e => setAmountReceived(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm">
                      <p className="text-slate-600">Vuelto: <span className="font-bold text-emerald-700">{formatCurrency(quickSaleChange)}</span></p>
                      {quickSaleMissing > 0 && (
                        <p className="text-xs text-red-600 mt-1">Falta: {formatCurrency(quickSaleMissing)}</p>
                      )}
                    </div>
                  </>
                )}
                <div className="rounded-lg border border-slate-200 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={billingForm.enabled}
                        onChange={e => setBillingForm(prev => ({ ...prev, enabled: e.target.checked }))}
                      />
                      Emitir comprobante de pago
                    </label>
                    <button
                      type="button"
                      onClick={openCustomerModal}
                      className="px-2 py-1 rounded border border-[#2563EB] text-[#2563EB] text-xs font-medium hover:bg-[#2563EB]/10 flex items-center gap-1"
                    >
                      <MdPersonAdd className="text-sm" />
                      Agregar cliente
                    </button>
                  </div>
                  {billingForm.enabled && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="input-field"
                          value={billingForm.doc_type}
                          onChange={e => setBillingForm(prev => ({ ...prev, doc_type: e.target.value }))}
                        >
                          <option value="boleta">Boleta</option>
                          <option value="factura">Factura</option>
                        </select>
                        <select
                          className="input-field"
                          value={billingForm.customer_doc_type}
                          onChange={e => setBillingForm(prev => ({ ...prev, customer_doc_type: e.target.value }))}
                          disabled={billingForm.doc_type === 'factura'}
                        >
                          <option value="1">DNI</option>
                          <option value="6">RUC</option>
                          <option value="0">Sin documento</option>
                        </select>
                      </div>
                      <input
                        className="input-field"
                        placeholder="N° documento"
                        value={billingForm.customer_doc_number}
                        onChange={e => setBillingForm(prev => ({ ...prev, customer_doc_number: normalizeDocNumber(e.target.value) }))}
                      />
                      <input
                        className="input-field"
                        placeholder={billingForm.doc_type === 'factura' ? 'Razón social' : 'Nombre cliente'}
                        value={billingForm.customer_name}
                        onChange={e => setBillingForm(prev => ({ ...prev, customer_name: e.target.value }))}
                      />
                      {searchingCustomer && (
                        <p className="text-[11px] text-slate-500">Buscando cliente por DNI/RUC...</p>
                      )}
                      {matchedCustomer && (
                        <p className="text-[11px] text-emerald-700">Cliente encontrado: {matchedCustomer.name}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2">
              {cart.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">Selecciona productos</p>
              ) : cart.map(item => (
                <div key={item.line_key} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {Number(item.note_required || 0) === 1 && (
                        <p className="text-[11px] text-red-600 font-medium">Nota obligatoria</p>
                      )}
                      {item.modifier_name && item.modifier_option && (
                        <p className="text-[11px] text-slate-500 truncate">{item.modifier_name}: {item.modifier_option}</p>
                      )}
                      <p className="text-xs text-slate-400">{formatCurrency(item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setNoteEditorLineKey(prev => (prev === item.line_key ? '' : item.line_key))}
                        className={`w-7 h-7 rounded flex items-center justify-center border ${
                          item.notes?.trim()
                            ? 'bg-amber-100 border-amber-300 text-amber-700'
                            : 'bg-white hover:bg-slate-200'
                        }`}
                        title="Agregar nota al producto"
                      >
                        <MdEditNote className="text-sm" />
                      </button>
                      <button onClick={() => updateQty(item.line_key, -1)} className="w-6 h-6 bg-white rounded flex items-center justify-center hover:bg-slate-200 border"><MdRemove className="text-xs" /></button>
                      <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                      <button onClick={() => updateQty(item.line_key, 1)} className="w-6 h-6 bg-white rounded flex items-center justify-center hover:bg-slate-200 border"><MdAdd className="text-xs" /></button>
                    </div>
                    <button onClick={() => removeFromCart(item.line_key)} className="text-red-400 hover:text-red-600"><MdDelete className="text-sm" /></button>
                  </div>
                  {(noteEditorLineKey === item.line_key || item.notes?.trim()) && (
                    <div className="mt-2">
                      <textarea
                        value={item.notes || ''}
                        onChange={(e) => updateItemNote(item.line_key, e.target.value)}
                        placeholder="Escribe una nota para cocina..."
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="border-t pt-3 mt-3 space-y-2">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-gold-600">{formatCurrency(cartTotal)}</span>
                </div>
                <button onClick={submitOrder} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                  <MdReceipt /> {quickSaleMode ? 'Cobrar venta rápida' : 'Enviar Pedido'}
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modifierPrompt.open}
        onClose={() => setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' })}
        title={`Seleccionar ${modifierPrompt.modifier?.name || 'modificador'}`}
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {modifierPrompt.product?.name || 'Producto'} · {Number(modifierPrompt.modifier?.required || 0) === 1 ? 'Obligatorio' : 'Opcional'}
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {(modifierPrompt.modifier?.options || []).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setModifierPrompt(prev => ({ ...prev, selectedOption: opt }))}
                className={`w-full px-3 py-2 rounded-lg border text-left text-sm ${
                  modifierPrompt.selectedOption === opt
                    ? 'border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModifierPrompt({ open: false, product: null, modifier: null, selectedOption: '' })}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            {Number(modifierPrompt.modifier?.required || 0) !== 1 && (
              <button
                type="button"
                onClick={addProductWithoutOptionalModifier}
                className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100"
              >
                Sin modificador
              </button>
            )}
            <button
              type="button"
              onClick={confirmModifierForCart}
              className="btn-primary flex-1"
            >
              Confirmar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Cobrar Mesa */}
      <Modal
        isOpen={showBill}
        onClose={() => {
          setShowBill(false);
          setAmountReceived('');
          resetBillingForm();
        }}
        title={`COBRAR-MESA ${selectedTable?.number || selectedTable?.name}`}
        size="md"
        headerClassName="bg-red-600 border-b-red-700 rounded-t-2xl"
        titleClassName="text-white font-extrabold tracking-wide"
        closeButtonClassName="hover:bg-red-500"
        closeIconClassName="text-white"
      >
        {selectedTable && (
          <div className="border border-red-200 rounded-lg p-3 bg-red-50/30">
            <p className="text-red-600 font-bold mb-2">COBRAR-MESA {selectedTable.number || selectedTable.name}</p>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="inline-flex px-3 py-1 rounded-lg bg-red-600 text-white text-sm font-bold">MESA {selectedTable.name}</p>
                <p className="text-xs text-slate-400">Busca un producto</p>
              </div>
              <div className="text-sm text-slate-600">
                <span className="font-semibold">Detalles de mesa:</span> Sin detalles
              </div>
            </div>

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setBillTab('pedidos')}
                className={`px-4 py-2 rounded-t-lg text-sm ${billTab === 'pedidos' ? 'bg-white border border-b-0 border-red-200 font-semibold text-red-700' : 'bg-red-100 text-red-500'}`}
              >
                Pedidos
              </button>
              <button
                onClick={() => setBillTab('cuenta')}
                className={`px-4 py-2 rounded-t-lg text-sm ${billTab === 'cuenta' ? 'bg-white border border-b-0 border-red-200 font-semibold text-red-700' : 'bg-red-100 text-red-500'}`}
              >
                $ Cuenta
              </button>
            </div>

            {billTab === 'pedidos' ? (
              <div className="border rounded-lg p-3 mb-3 space-y-3">
                {(selectedTable.orders || []).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Sin pedidos activos</p>
                ) : (
                  (selectedTable.orders || []).map(order => (
                    <div key={order.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold bg-slate-100 px-2 py-1 rounded">Pedido #{order.order_number}</p>
                        <p className="font-bold text-slate-700">{formatCurrency(getOrderChargeTotal(order))}</p>
                      </div>
                      <div className="space-y-1">
                        {(order.items || []).map(item => (
                          <div key={item.id} className="flex justify-between text-sm text-slate-600">
                            <span>{item.quantity}x {item.product_name}</span>
                            <span>{formatCurrency(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="border rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-slate-600">Cobro completo</span>
                  <span className="text-xs text-slate-500">{selectedOrderIds.length} pedido(s) seleccionados</span>
                </div>
                <div className="flex items-end justify-between border-t border-slate-200 pt-3">
                  <div>
                    <p className="text-xs text-slate-500">Pedidos</p>
                    <p className="text-2xl font-bold text-slate-700">{selectedOrderIds.length}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Total</p>
                    <p className="text-4xl font-bold text-slate-700">S/ {payableTotal.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="border rounded-lg p-3 mb-3 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Método de pago</label>
                  <select className="input-field" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    {paymentOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Paga con</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-field"
                    value={amountReceived}
                    onChange={e => setAmountReceived(e.target.value)}
                    placeholder="0.00"
                    disabled={paymentMethod !== 'efectivo'}
                  />
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex flex-col justify-center">
                  <p className="text-xs text-slate-600">Vuelto</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {paymentMethod === 'efectivo'
                      ? formatCurrency(Math.max(0, receivedAmount - payableTotal))
                      : formatCurrency(0)}
                  </p>
                  {paymentMethod === 'efectivo' && receivedAmount < payableTotal && (
                    <p className="text-xs text-red-600">Falta: {formatCurrency(payableTotal - receivedAmount)}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-3 mb-3 bg-white">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={billingForm.enabled}
                    onChange={e => setBillingForm(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Emitir comprobante de pago
                </label>
                <button
                  type="button"
                  onClick={openCustomerModal}
                  className="px-2.5 py-1.5 rounded border border-[#2563EB] text-[#2563EB] text-xs font-medium hover:bg-[#2563EB]/10 flex items-center gap-1"
                >
                  <MdPersonAdd className="text-sm" />
                  Agregar cliente
                </button>
              </div>
              {billingForm.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <select
                    className="input-field"
                    value={billingForm.doc_type}
                    onChange={e => setBillingForm(prev => ({ ...prev, doc_type: e.target.value }))}
                  >
                    <option value="boleta">Boleta</option>
                    <option value="factura">Factura</option>
                  </select>
                  <select
                    className="input-field"
                    value={billingForm.customer_doc_type}
                    onChange={e => setBillingForm(prev => ({ ...prev, customer_doc_type: e.target.value }))}
                    disabled={billingForm.doc_type === 'factura'}
                  >
                    <option value="1">DNI</option>
                    <option value="6">RUC</option>
                    <option value="0">Sin documento</option>
                  </select>
                  <input
                    className="input-field"
                    placeholder="N° documento"
                    value={billingForm.customer_doc_number}
                    onChange={e => setBillingForm(prev => ({ ...prev, customer_doc_number: normalizeDocNumber(e.target.value) }))}
                  />
                  <input
                    className="input-field"
                    placeholder={billingForm.doc_type === 'factura' ? 'Razón social' : 'Nombre cliente'}
                    value={billingForm.customer_name}
                    onChange={e => setBillingForm(prev => ({ ...prev, customer_name: e.target.value }))}
                  />
                  <input
                    className="input-field md:col-span-2"
                    placeholder="Dirección (opcional)"
                    value={billingForm.customer_address}
                    onChange={e => setBillingForm(prev => ({ ...prev, customer_address: e.target.value }))}
                  />
                  <div className="md:col-span-2">
                    {searchingCustomer && (
                      <p className="text-xs text-slate-500">Buscando cliente por DNI/RUC...</p>
                    )}
                    {matchedCustomer && (
                      <p className="text-xs text-emerald-700">Cliente encontrado: {matchedCustomer.name}</p>
                    )}
                  </div>
                </div>
              )}
              {billingResult && (
                <div className="mt-2 text-xs rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-emerald-700 flex items-center justify-between gap-2">
                  <span>{billingResult.full_number} · {billingResult.provider_status}</span>
                  {billingResult.pdf_url && (
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => window.open(billingResult.pdf_url, '_blank')}
                    >
                      Ver PDF
                    </button>
                  )}
                </div>
              )}
            </div>

            {billTab === 'pedidos' ? (
              <div className="mb-3">
                <button onClick={cobrarMesa} className="w-full py-3 bg-red-400 hover:bg-red-500 text-white font-bold text-3xl rounded-lg">
                  COBRAR MESA
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={togglePartialSelection}
                    className="px-3 py-2 rounded bg-red-400 hover:bg-red-500 text-white text-sm"
                  >
                    {splitMode ? 'Cerrar dividir cuentas' : 'Dividir cuentas'}
                  </button>
                  <button
                    onClick={handleDiscountButton}
                    className="px-3 py-2 rounded bg-red-400 hover:bg-red-500 text-white text-sm"
                  >
                    {discountConfig.applied ? 'Anular descuento' : (discountConfig.active ? 'Aplicar descuento' : 'Agregar descuento')}
                  </button>
                </div>
                <button onClick={cobrarMesa} className="w-full py-3 bg-red-400 hover:bg-red-500 text-white font-bold text-3xl rounded-lg">
                  COBRAR MESA
                </button>
              </div>
            )}

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
                type="email"
                name="pos-customer-email"
                autoComplete="off"
                value={customerForm.email}
                onChange={(e) => setCustomerForm(prev => ({ ...prev, email: e.target.value }))}
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
