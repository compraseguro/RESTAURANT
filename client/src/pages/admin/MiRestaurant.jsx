import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, resolveMediaUrl } from '../../utils/api';
import toast from 'react-hot-toast';
import { MdSave, MdStore, MdPhone, MdEmail, MdLocationOn, MdSchedule, MdImage, MdReceipt, MdPayment, MdDownload, MdUpload, MdRestartAlt } from 'react-icons/md';

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DAY_NAMES = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
const MI_RESTAURANT_VIEWS = [
  { id: 'mi_empresa', label: 'Mi empresa' },
  { id: 'facturacion_electronica', label: 'Bot facturación SUNAT' },
  { id: 'series_contingencia', label: 'Series de contingencia' },
  { id: 'pagos_sistema', label: 'Pagos de créditos' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'pago_uso_sistema', label: 'Pago por uso del sistema' },
  { id: 'informacion', label: 'Información' },
];

export default function MiRestaurant() {
  const [searchParams, setSearchParams] = useSearchParams();
  const logoInputRef = useRef(null);
  const restoreInputRef = useRef(null);
  const comprobanteUsoInputRef = useRef(null);
  const [restaurant, setRestaurant] = useState(null);
  const [billingConfig, setBillingConfig] = useState({
    billing_api_url: '',
    billing_api_token: '',
    has_billing_api_token: false,
    billing_offline_mode: 1,
    billing_auto_retry_enabled: 1,
    billing_auto_retry_interval_sec: 120,
  });
  const [tab, setTab] = useState('info');
  const [activeView, setActiveView] = useState(searchParams.get('view') || 'mi_empresa');
  const [appConfig, setAppConfig] = useState({
    regional: { country: 'Peru', timezone: 'America/Lima', language: 'es', date_format: 'DD/MM/YYYY' },
    pagos_sistema: {
      acepta_efectivo: 1,
      acepta_tarjeta: 1,
      acepta_yape: 0,
      acepta_plin: 0,
      requiere_referencia_digital: 0,
      propina_sugerida_pct: 10,
      tolerancia_diferencia_caja: 2,
      dias_max_credito: 15,
      monto_max_credito: 500,
      notificar_mora: 1,
      texto_politica_cobro: 'Todo crédito debe regularizarse dentro del plazo acordado.',
    },
    series_contingencia: { boleta: 'BC01', factura: 'FC01', enabled: 1 },
    contrato: { plan: 'pro', renewal_date: '', observations: '' },
    pago_uso_sistema: {
      periodo_facturacion: 'mensual',
      fecha_proxima_facturacion: '',
      numero_cuenta: '',
      nombre_empresa_cobro: '',
      comprobante_pago_url: '',
    },
  });

  const loadInitialData = () => {
    return Promise.all([
      api.get('/restaurant'),
      api.get('/billing/config').catch(() => null),
      api.get('/admin-modules/config/app').catch(() => null),
    ])
      .then(([restaurantData, billingData, appCfg]) => {
        const data = restaurantData || {};
        if (!data.schedule || typeof data.schedule !== 'object') data.schedule = {};
        DAYS.forEach(d => { if (!data.schedule[d]) data.schedule[d] = { open: '11:00', close: '23:00', enabled: true }; });
        setRestaurant(data);

        if (billingData) {
          setBillingConfig(prev => ({
            ...prev,
            billing_api_url: billingData.billing_api_url || '',
            has_billing_api_token: Boolean(billingData.has_billing_api_token),
            billing_offline_mode: Number(billingData.billing_offline_mode ?? 1),
            billing_auto_retry_enabled: Number(billingData.billing_auto_retry_enabled ?? 1),
            billing_auto_retry_interval_sec: Number(billingData.billing_auto_retry_interval_sec || 120),
            billing_api_token: '',
          }));
        }
        if (appCfg && typeof appCfg === 'object') {
          setAppConfig(prev => ({ ...prev, ...appCfg }));
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const requestedView = searchParams.get('view');
    const isValidView = MI_RESTAURANT_VIEWS.some(option => option.id === requestedView);
    if (isValidView && requestedView !== activeView) {
      setActiveView(requestedView);
      return;
    }
    if (!isValidView && activeView !== 'mi_empresa') {
      setSearchParams({ view: activeView }, { replace: true });
      return;
    }
    if (!isValidView && !requestedView) {
      setSearchParams({ view: 'mi_empresa' }, { replace: true });
    }
  }, [activeView, searchParams, setSearchParams]);

  const save = async () => {
    try {
      if (activeView === 'facturacion_electronica') {
        const saved = await api.put('/billing/config', {
          billing_api_url: billingConfig.billing_api_url,
          billing_api_token: billingConfig.billing_api_token,
          billing_offline_mode: billingConfig.billing_offline_mode,
          billing_auto_retry_enabled: billingConfig.billing_auto_retry_enabled,
          billing_auto_retry_interval_sec: billingConfig.billing_auto_retry_interval_sec,
        });
        setBillingConfig(prev => ({
          ...prev,
          billing_api_url: saved.billing_api_url || '',
          has_billing_api_token: Boolean(saved.has_billing_api_token),
          billing_offline_mode: Number(saved.billing_offline_mode ?? 1),
          billing_auto_retry_enabled: Number(saved.billing_auto_retry_enabled ?? 1),
          billing_auto_retry_interval_sec: Number(saved.billing_auto_retry_interval_sec || 120),
          billing_api_token: '',
        }));
        toast.success('Conexión al bot guardada');
        return;
      }
      if (activeView !== 'mi_empresa') {
        const key = activeView;
        if (key === 'pagos_sistema') {
          const pagos = appConfig.pagos_sistema || {};
          const sanitizePercent = (value, fallback) => {
            const parsed = Number(value);
            if (Number.isNaN(parsed)) return fallback;
            return Math.min(100, Math.max(0, parsed));
          };
          const sanitizeNumber = (value, fallback) => {
            const parsed = Number(value);
            if (Number.isNaN(parsed)) return fallback;
            return Math.max(0, parsed);
          };
          const payload = {
            ...pagos,
            propina_sugerida_pct: sanitizePercent(pagos.propina_sugerida_pct, 0),
            tolerancia_diferencia_caja: sanitizeNumber(pagos.tolerancia_diferencia_caja, 0),
            dias_max_credito: Math.round(sanitizeNumber(pagos.dias_max_credito, 0)),
            monto_max_credito: sanitizeNumber(pagos.monto_max_credito, 0),
          };
          const saved = await api.put('/admin-modules/config/app', { [key]: payload });
          setAppConfig(prev => ({ ...prev, ...saved }));
          toast.success('Configuración de pagos de crédito guardada');
          return;
        }
        if (key === 'pago_uso_sistema') {
          const raw = appConfig.pago_uso_sistema || {};
          const periodo = raw.periodo_facturacion === 'semestral' ? 'semestral' : 'mensual';
          const payload = {
            periodo_facturacion: periodo,
            fecha_proxima_facturacion: String(raw.fecha_proxima_facturacion || '').trim().slice(0, 32),
            numero_cuenta: String(raw.numero_cuenta || '').trim(),
            nombre_empresa_cobro: String(raw.nombre_empresa_cobro || '').trim(),
            comprobante_pago_url: String(raw.comprobante_pago_url || '').trim(),
          };
          const saved = await api.put('/admin-modules/config/app', { pago_uso_sistema: payload });
          setAppConfig(prev => ({ ...prev, ...saved }));
          toast.success('Datos de pago por uso del sistema guardados');
          return;
        }
        const saved = await api.put('/admin-modules/config/app', { [key]: appConfig[key] || {} });
        setAppConfig(prev => ({ ...prev, ...saved }));
        toast.success('Configuración guardada');
        return;
      }
      await api.put('/restaurant', restaurant);
      toast.success('Guardado correctamente');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const update = (f, v) => setRestaurant(prev => ({ ...prev, [f]: v }));
  const updateBilling = (f, v) => setBillingConfig(prev => ({ ...prev, [f]: v }));
  const updateAppCfg = (section, field, value) => setAppConfig(prev => ({
    ...prev,
    [section]: { ...(prev[section] || {}), [field]: value },
  }));
  const updateSchedule = (day, field, value) => setRestaurant(prev => ({
    ...prev, schedule: { ...prev.schedule, [day]: { ...prev.schedule[day], [field]: value } }
  }));
  const uploadLogo = async (file) => {
    if (!file) return;
    try {
      const uploaded = await api.upload(file);
      setRestaurant(prev => ({ ...prev, logo: uploaded?.url || prev.logo || '' }));
      toast.success('Logo cargado correctamente. Guarda para aplicar cambios.');
    } catch (err) {
      toast.error(err.message || 'No se pudo subir el logo');
    }
  };

  const uploadComprobantePagoUso = async (file) => {
    if (!file) return;
    try {
      const uploaded = await api.upload(file);
      const url = uploaded?.url || '';
      updateAppCfg('pago_uso_sistema', 'comprobante_pago_url', url);
      toast.success('Comprobante cargado. Pulsa Guardar cambios para conservarlo.');
    } catch (err) {
      toast.error(err.message || 'No se pudo subir el comprobante');
    } finally {
      if (comprobanteUsoInputRef.current) comprobanteUsoInputRef.current.value = '';
    }
  };

  const downloadBackup = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/restaurant/backup', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'No se pudo descargar el backup');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `restaurant_backup_${new Date().toISOString().slice(0, 10)}.db`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Backup descargado');
    } catch (err) {
      toast.error(err.message || 'No se pudo descargar el backup');
    }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    const confirmed = window.confirm('Esta acción reemplazará toda la información actual por la del backup. ¿Deseas continuar?');
    if (!confirmed) return;
    try {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('backup', file);
      const response = await fetch('/api/restaurant/restore', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'No se pudo restaurar el backup');
      toast.success('Información restaurada correctamente');
      setShowDataActions(false);
      await loadInitialData();
    } catch (err) {
      toast.error(err.message || 'No se pudo restaurar el backup');
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  const resetOperationalInfo = async () => {
    const confirmed = window.confirm(
      'Se borrarán ventas, pedidos, caja, clientes, productos y datos operativos para pruebas. ¿Deseas continuar?'
    );
    if (!confirmed) return;
    try {
      await api.post('/restaurant/reset-operational', {});
      toast.success('Datos operativos reiniciados para pruebas');
      await loadInitialData();
    } catch (err) {
      toast.error(err.message || 'No se pudo reiniciar la información operativa');
    }
  };

  if (!restaurant) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" /></div>;
  const activeViewLabel = MI_RESTAURANT_VIEWS.find(option => option.id === activeView)?.label || 'Mi empresa';

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Mi Restaurante · {activeViewLabel}</h1>
        <button onClick={save} className="btn-primary flex items-center gap-2"><MdSave /> Guardar Cambios</button>
      </div>

      {activeView === 'mi_empresa' && (
        <>
          <div className="flex gap-2 mb-5">
            {[{ id: 'info', label: 'Información', icon: MdStore }, { id: 'schedule', label: 'Horarios', icon: MdSchedule }, { id: 'delivery', label: 'Delivery', icon: MdLocationOn }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${tab === t.id ? 'bg-gold-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}><t.icon /> {t.label}</button>
            ))}
          </div>

          {tab === 'info' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-6 mb-6">
            <div
              className="w-24 h-24 bg-gold-100 rounded-2xl flex items-center justify-center border-2 border-dashed border-gold-300 cursor-pointer hover:bg-gold-50 overflow-hidden"
              onClick={() => logoInputRef.current?.click()}
            >
              {restaurant.logo ? (
                <img src={restaurant.logo} alt="Logo del restaurante" className="w-full h-full object-cover" />
              ) : (
                <MdImage className="text-3xl text-gold-400" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg">{restaurant.name}</h3>
              <p className="text-sm text-slate-500">Logo del restaurante</p>
              <button
                type="button"
                className="text-xs text-gold-600 mt-1 hover:underline"
                onClick={() => logoInputRef.current?.click()}
              >
                Cambiar imagen
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => uploadLogo(e.target.files?.[0])}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Restaurante</label><input value={restaurant.name} onChange={e => update('name', e.target.value)} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label><input value={restaurant.phone} onChange={e => update('phone', e.target.value)} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input value={restaurant.email} onChange={e => update('email', e.target.value)} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label><input value={restaurant.address} onChange={e => update('address', e.target.value)} className="input-field" /></div>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-100">
            <h4 className="font-semibold text-slate-800 mb-1">Empresa y ubicación (SUNAT / comprobantes)</h4>
            <p className="text-sm text-slate-500 mb-4">Completa según tu RUC y establecimiento. Se usa al emitir boletas y facturas con el bot.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RUC emisor</label>
                <input className="input-field" value={restaurant.company_ruc ?? ''} onChange={e => update('company_ruc', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Razón social</label>
                <input className="input-field" value={restaurant.legal_name ?? ''} onChange={e => update('legal_name', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre comercial (SUNAT)</label>
                <input className="input-field" value={restaurant.billing_nombre_comercial ?? ''} onChange={e => update('billing_nombre_comercial', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ubigeo</label>
                <input className="input-field" value={restaurant.billing_emisor_ubigeo ?? ''} onChange={e => update('billing_emisor_ubigeo', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección fiscal (si queda vacío se usa la dirección de arriba)</label>
                <input className="input-field" value={restaurant.billing_emisor_direccion ?? ''} onChange={e => update('billing_emisor_direccion', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
                <input className="input-field" value={restaurant.billing_emisor_departamento ?? ''} onChange={e => update('billing_emisor_departamento', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provincia</label>
                <input className="input-field" value={restaurant.billing_emisor_provincia ?? ''} onChange={e => update('billing_emisor_provincia', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Distrito</label>
                <input className="input-field" value={restaurant.billing_emisor_distrito ?? ''} onChange={e => update('billing_emisor_distrito', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Serie boleta</label>
                <input className="input-field" value={restaurant.billing_series_boleta ?? ''} onChange={e => update('billing_series_boleta', (e.target.value || '').toUpperCase())} placeholder="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Serie factura</label>
                <input className="input-field" value={restaurant.billing_series_factura ?? ''} onChange={e => update('billing_series_factura', (e.target.value || '').toUpperCase())} placeholder="" />
              </div>
            </div>
          </div>
        </div>
          )}

          {tab === 'schedule' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-bold text-slate-800 mb-4">Horario de Atención</h3>
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
          )}

          {tab === 'delivery' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-bold text-slate-800 mb-4">Configuración de Delivery</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Delivery habilitado</label>
              <select className="input-field" value={restaurant.delivery_enabled ? '1' : '0'} onChange={e => update('delivery_enabled', parseInt(e.target.value))}>
                <option value="1">Sí</option><option value="0">No</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Costo de Delivery (S/)</label><input type="number" step="0.50" value={restaurant.delivery_fee} onChange={e => update('delivery_fee', parseFloat(e.target.value))} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Pedido Mínimo (S/)</label><input type="number" step="1" value={restaurant.delivery_min_order} onChange={e => update('delivery_min_order', parseFloat(e.target.value))} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Radio de Cobertura (km)</label><input type="number" step="0.5" value={restaurant.delivery_radius_km} onChange={e => update('delivery_radius_km', parseFloat(e.target.value))} className="input-field" /></div>
          </div>
        </div>
          )}
        </>
      )}

      {activeView !== 'mi_empresa' && (
        <>
          {activeView === 'facturacion_electronica' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
              <div className="flex items-center gap-2">
                <MdReceipt className="text-red-600 text-2xl" />
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Conexión al bot SUNAT</h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    La emisión electrónica está activa y el proveedor es solo el bot. RUC, dirección y series se configuran en <strong>Mi empresa → Información</strong>.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">URL del API del bot (Node → Python)</label>
                  <input
                    className="input-field"
                    value={billingConfig.billing_api_url}
                    onChange={e => updateBilling('billing_api_url', e.target.value)}
                    placeholder="http://127.0.0.1:8765"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Secreto HTTP (X-EFACT-SECRET) {billingConfig.has_billing_api_token ? '(ya configurado)' : ''}
                  </label>
                  <input
                    className="input-field"
                    value={billingConfig.billing_api_token}
                    onChange={e => updateBilling('billing_api_token', e.target.value)}
                    placeholder={
                      billingConfig.has_billing_api_token
                        ? 'Vacío = mantener; debe coincidir con EFACT_HTTP_SECRET en .env del bot'
                        : 'Opcional: mismo valor que EFACT_HTTP_SECRET en el .env del bot'
                    }
                    type="password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Modo offline</label>
                  <select
                    className="input-field"
                    value={billingConfig.billing_offline_mode ? '1' : '0'}
                    onChange={e => updateBilling('billing_offline_mode', Number(e.target.value))}
                  >
                    <option value="1">Activo (guardar y sincronizar luego)</option>
                    <option value="0">Inactivo (errores de red quedan como fallo)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reintento automático</label>
                  <select
                    className="input-field"
                    value={billingConfig.billing_auto_retry_enabled ? '1' : '0'}
                    onChange={e => updateBilling('billing_auto_retry_enabled', Number(e.target.value))}
                  >
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Intervalo de reintento (segundos)</label>
                  <input
                    type="number"
                    min="30"
                    max="3600"
                    className="input-field"
                    value={billingConfig.billing_auto_retry_interval_sec}
                    onChange={e => updateBilling('billing_auto_retry_interval_sec', Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">
                Debe estar en ejecución <code className="text-xs bg-amber-100 px-1 rounded">python api_server.py</code> en la carpeta
                {' '}<code className="text-xs bg-amber-100 px-1 rounded">BOT DE FACTURACION</code>
                (o Docker con Node+Python). Certificado .pfx y credenciales SOL van en el <code className="text-xs bg-amber-100 px-1 rounded">.env</code> del bot.
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-800">
                Al emitir facturas, el cliente debe tener RUC válido (11 dígitos) y razón social.
              </div>
            </div>
          ) : activeView === 'pagos_sistema' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
              <div className="flex items-center gap-2">
                <MdPayment className="text-red-600 text-2xl" />
                <h3 className="font-bold text-slate-800 text-lg">Parámetros de cobro y crédito</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Aceptar efectivo</label>
                  <select
                    className="input-field"
                    value={appConfig.pagos_sistema?.acepta_efectivo ? '1' : '0'}
                    onChange={e => updateAppCfg('pagos_sistema', 'acepta_efectivo', Number(e.target.value))}
                  >
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Aceptar tarjeta</label>
                  <select
                    className="input-field"
                    value={appConfig.pagos_sistema?.acepta_tarjeta ? '1' : '0'}
                    onChange={e => updateAppCfg('pagos_sistema', 'acepta_tarjeta', Number(e.target.value))}
                  >
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Aceptar Yape</label>
                  <select
                    className="input-field"
                    value={appConfig.pagos_sistema?.acepta_yape ? '1' : '0'}
                    onChange={e => updateAppCfg('pagos_sistema', 'acepta_yape', Number(e.target.value))}
                  >
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Aceptar Plin</label>
                  <select
                    className="input-field"
                    value={appConfig.pagos_sistema?.acepta_plin ? '1' : '0'}
                    onChange={e => updateAppCfg('pagos_sistema', 'acepta_plin', Number(e.target.value))}
                  >
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Requiere referencia para pagos digitales</label>
                  <select
                    className="input-field"
                    value={appConfig.pagos_sistema?.requiere_referencia_digital ? '1' : '0'}
                    onChange={e => updateAppCfg('pagos_sistema', 'requiere_referencia_digital', Number(e.target.value))}
                  >
                    <option value="1">Sí, exigir código de operación</option>
                    <option value="0">No, solo registrar método</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Propina sugerida (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="input-field"
                    value={appConfig.pagos_sistema?.propina_sugerida_pct ?? 0}
                    onChange={e => updateAppCfg('pagos_sistema', 'propina_sugerida_pct', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tolerancia diferencia de caja (S/)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.10"
                    className="input-field"
                    value={appConfig.pagos_sistema?.tolerancia_diferencia_caja ?? 0}
                    onChange={e => updateAppCfg('pagos_sistema', 'tolerancia_diferencia_caja', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Días máximos de crédito</label>
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    value={appConfig.pagos_sistema?.dias_max_credito ?? 0}
                    onChange={e => updateAppCfg('pagos_sistema', 'dias_max_credito', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto máximo por crédito (S/)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    className="input-field"
                    value={appConfig.pagos_sistema?.monto_max_credito ?? 0}
                    onChange={e => updateAppCfg('pagos_sistema', 'monto_max_credito', Number(e.target.value))}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notificar mora automáticamente</label>
                  <select
                    className="input-field"
                    value={appConfig.pagos_sistema?.notificar_mora ? '1' : '0'}
                    onChange={e => updateAppCfg('pagos_sistema', 'notificar_mora', Number(e.target.value))}
                  >
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Política de cobranza</label>
                  <textarea
                    rows="3"
                    className="input-field"
                    value={appConfig.pagos_sistema?.texto_politica_cobro || ''}
                    onChange={e => updateAppCfg('pagos_sistema', 'texto_politica_cobro', e.target.value)}
                    placeholder="Define términos para ventas al crédito, mora y regularización."
                  />
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">
                Recomendación: mantener al menos dos métodos de pago activos para continuidad operativa.
              </div>
            </div>
          ) : activeView === 'series_contingencia' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
              <h3 className="font-bold text-slate-800">Series de contingencia</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Serie boleta contingencia</label>
                  <input className="input-field" value={appConfig.series_contingencia?.boleta || ''} onChange={e => updateAppCfg('series_contingencia', 'boleta', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Serie factura contingencia</label>
                  <input className="input-field" value={appConfig.series_contingencia?.factura || ''} onChange={e => updateAppCfg('series_contingencia', 'factura', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Modo contingencia</label>
                  <select className="input-field" value={appConfig.series_contingencia?.enabled ? '1' : '0'} onChange={e => updateAppCfg('series_contingencia', 'enabled', Number(e.target.value))}>
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                </div>
              </div>
            </div>
          ) : activeView === 'contrato' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
              <h3 className="font-bold text-slate-800">Contrato del servicio</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
                  <select className="input-field" value={appConfig.contrato?.plan || 'pro'} onChange={e => updateAppCfg('contrato', 'plan', e.target.value)}>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Renovación</label>
                  <input type="date" className="input-field" value={appConfig.contrato?.renewal_date || ''} onChange={e => updateAppCfg('contrato', 'renewal_date', e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones</label>
                  <textarea className="input-field" rows="3" value={appConfig.contrato?.observations || ''} onChange={e => updateAppCfg('contrato', 'observations', e.target.value)} />
                </div>
              </div>
            </div>
          ) : activeView === 'pago_uso_sistema' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-5">
              <div className="flex items-center gap-2">
                <MdReceipt className="text-blue-600 text-2xl" />
                <h3 className="font-bold text-slate-800 text-lg">Pago por uso del sistema</h3>
              </div>
              <p className="text-sm text-slate-500">
                Registra los datos que te indique el proveedor del software para abonar la licencia o suscripción: periodicidad, cuenta de destino y, si ya pagaste, adjunta el comprobante.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Frecuencia de facturación</label>
                  <select
                    className="input-field"
                    value={appConfig.pago_uso_sistema?.periodo_facturacion === 'semestral' ? 'semestral' : 'mensual'}
                    onChange={(e) => updateAppCfg('pago_uso_sistema', 'periodo_facturacion', e.target.value)}
                  >
                    <option value="mensual">Mensual</option>
                    <option value="semestral">Semestral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Próxima fecha de facturación (opcional)</label>
                  <input
                    type="date"
                    className="input-field"
                    value={appConfig.pago_uso_sistema?.fecha_proxima_facturacion || ''}
                    onChange={(e) => updateAppCfg('pago_uso_sistema', 'fecha_proxima_facturacion', e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Número de cuenta</label>
                  <input
                    className="input-field"
                    placeholder="CCI, número de cuenta o datos de transferencia"
                    value={appConfig.pago_uso_sistema?.numero_cuenta || ''}
                    onChange={(e) => updateAppCfg('pago_uso_sistema', 'numero_cuenta', e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la empresa a la que debes pagar</label>
                  <input
                    className="input-field"
                    placeholder="Razón social o nombre del beneficiario"
                    value={appConfig.pago_uso_sistema?.nombre_empresa_cobro || ''}
                    onChange={(e) => updateAppCfg('pago_uso_sistema', 'nombre_empresa_cobro', e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Comprobante de pago</label>
                  <p className="text-xs text-slate-500 mb-2">Sube una imagen (o PDF) del voucher o transferencia.</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => comprobanteUsoInputRef.current?.click()}
                      className="btn-secondary flex items-center gap-2 text-sm"
                    >
                      <MdUpload /> Cargar comprobante
                    </button>
                    <input
                      ref={comprobanteUsoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                      className="hidden"
                      onChange={(e) => uploadComprobantePagoUso(e.target.files?.[0])}
                    />
                    {appConfig.pago_uso_sistema?.comprobante_pago_url ? (
                      <>
                        <a
                          href={resolveMediaUrl(appConfig.pago_uso_sistema.comprobante_pago_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Ver archivo
                        </a>
                        <button
                          type="button"
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => updateAppCfg('pago_uso_sistema', 'comprobante_pago_url', '')}
                        >
                          Quitar
                        </button>
                      </>
                    ) : null}
                  </div>
                  {appConfig.pago_uso_sistema?.comprobante_pago_url &&
                  !String(appConfig.pago_uso_sistema.comprobante_pago_url).toLowerCase().endsWith('.pdf') ? (
                    <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden max-w-xs bg-slate-50">
                      <img
                        src={resolveMediaUrl(appConfig.pago_uso_sistema.comprobante_pago_url)}
                        alt="Vista previa del comprobante"
                        className="w-full max-h-48 object-contain"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
                Tras cargar el archivo, pulsa <strong>Guardar cambios</strong> para guardar la URL del comprobante junto al resto de datos.
              </div>
            </div>
          ) : activeView === 'informacion' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
              <h3 className="font-bold text-slate-800">Respaldo y restauración de información</h3>
              <p className="text-sm text-slate-500">
                Descarga una copia completa de datos antes de actualizar la app y luego restaura desde ese archivo para recuperar toda la información.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button type="button" onClick={downloadBackup} className="w-full btn-secondary flex items-center justify-center gap-2">
                  <MdDownload /> Guardar backup
                </button>
                <button type="button" onClick={() => restoreInputRef.current?.click()} className="w-full btn-primary flex items-center justify-center gap-2">
                  <MdUpload /> Restaurar información
                </button>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".db,application/octet-stream"
                  className="hidden"
                  onChange={(e) => restoreBackup(e.target.files?.[0])}
                />
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">
                Importante: al restaurar, se reemplaza la información actual por la del archivo de backup.
              </div>
              <div className="pt-2 flex justify-start">
                <button
                  type="button"
                  onClick={resetOperationalInfo}
                  className="px-4 py-2 rounded-lg border border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-medium text-sm flex items-center gap-2"
                >
                  <MdRestartAlt />
                  Reiniciar datos de la app (pruebas)
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
              <h3 className="font-bold text-slate-800 mb-2">{activeViewLabel}</h3>
              <p className="text-slate-500">No se encontró la vista solicitada. Selecciona una opción válida del menú.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
