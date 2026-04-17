import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, resolveMediaUrl } from '../../utils/api';
import { proximaFechaFromControlAnchor } from '../../utils/nextBillingFromAnchor';
import { normalizeContratoFromApi } from '../RestaurantServiceContractForm';
import { MdReceipt, MdPayment, MdSave, MdUpload } from 'react-icons/md';

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const defaultBillingConfig = () => ({
  billing_api_url: '',
  billing_api_token: '',
  has_billing_api_token: false,
  billing_api_url_from_env: false,
  billing_api_secret_from_env: false,
  billing_offline_mode: 1,
  billing_auto_retry_enabled: 1,
  billing_auto_retry_interval_sec: 120,
});

const defaultAppConfig = () => ({
  series_contingencia: { boleta: 'BC01', factura: 'FC01', enabled: 1 },
  contrato: { texto_contrato: '', firma_comprador_url: '', firma_vendedor_url: '' },
  pago_uso_sistema: {
    periodo_facturacion: 'mensual',
    fecha_proxima_facturacion: '',
    numero_cuenta: '',
    nombre_empresa_cobro: '',
    comprobante_pago_url: '',
    comprobante_grace_days_after_due: 3,
  },
});

/**
 * Misma data que Mi Restaurante → Bot SUNAT / Pago por uso; montado en Administrador Maestro
 * para que el maestro edite sin salir de /master.
 */
export default function MasterRestaurantBillingWorkspace({ active }) {
  const isSunat = active === 'sunat';
  const [restaurant, setRestaurant] = useState(null);
  const [billingConfig, setBillingConfig] = useState(defaultBillingConfig);
  const [appConfig, setAppConfig] = useState(defaultAppConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billingAnchorDate, setBillingAnchorDate] = useState('');
  const [pagoUsoComprobanteUi, setPagoUsoComprobanteUi] = useState(null);
  const comprobanteUsoInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [restaurantData, billingData, appCfg, schedule] = await Promise.all([
        api.get('/restaurant'),
        api.get('/billing/config').catch(() => null),
        api.get('/admin-modules/config/app').catch(() => null),
        api.get('/master-admin/billing-schedule').catch(() => null),
      ]);
      const data = restaurantData || {};
      if (!data.schedule || typeof data.schedule !== 'object') data.schedule = {};
      DAYS.forEach((d) => {
        if (!data.schedule[d]) data.schedule[d] = { open: '11:00', close: '23:00', enabled: true };
      });
      setRestaurant(data);

      if (billingData) {
        setBillingConfig({
          billing_api_url: billingData.billing_api_url || '',
          has_billing_api_token: Boolean(billingData.has_billing_api_token),
          billing_api_url_from_env: Boolean(billingData.billing_api_url_from_env),
          billing_api_secret_from_env: Boolean(billingData.billing_api_secret_from_env),
          billing_offline_mode: Number(billingData.billing_offline_mode ?? 1),
          billing_auto_retry_enabled: Number(billingData.billing_auto_retry_enabled ?? 1),
          billing_auto_retry_interval_sec: Number(billingData.billing_auto_retry_interval_sec || 120),
          billing_api_token: '',
        });
      } else {
        setBillingConfig(defaultBillingConfig());
      }

      if (schedule?.billing_date) {
        setBillingAnchorDate(String(schedule.billing_date).trim());
      } else {
        setBillingAnchorDate('');
      }
      if (schedule?.pago_uso_comprobante) {
        setPagoUsoComprobanteUi(schedule.pago_uso_comprobante);
      } else {
        setPagoUsoComprobanteUi(null);
      }
      if (appCfg && typeof appCfg === 'object') {
        setAppConfig((prev) => {
          let next = { ...prev, ...appCfg };
          if (appCfg.contrato && typeof appCfg.contrato === 'object') {
            next.contrato = normalizeContratoFromApi(appCfg.contrato);
          }
          const anchor = String(schedule?.billing_date || '').trim();
          const p = next.pago_uso_sistema || {};
          if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) && !String(p.fecha_proxima_facturacion || '').trim()) {
            const per = p.periodo_facturacion === 'semestral' ? 'semestral' : 'mensual';
            next = {
              ...next,
              pago_uso_sistema: {
                ...p,
                fecha_proxima_facturacion: proximaFechaFromControlAnchor(anchor, per),
              },
            };
          }
          return next;
        });
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo cargar la configuración del restaurante');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (f, v) => setRestaurant((prev) => ({ ...prev, [f]: v }));
  const updateBilling = (f, v) => setBillingConfig((prev) => ({ ...prev, [f]: v }));
  const updateAppCfg = (section, field, value) => setAppConfig((prev) => ({
    ...prev,
    [section]: { ...(prev[section] || {}), [field]: value },
  }));

  const uploadComprobantePagoUso = async (file) => {
    if (!file) return;
    try {
      const uploaded = await api.upload(file);
      const url = uploaded?.url || '';
      updateAppCfg('pago_uso_sistema', 'comprobante_pago_url', url);
      toast.success('Comprobante cargado. Pulsa Guardar para conservarlo.');
    } catch (err) {
      toast.error(err.message || 'No se pudo subir el comprobante');
    } finally {
      if (comprobanteUsoInputRef.current) comprobanteUsoInputRef.current.value = '';
    }
  };

  const saveSunat = async () => {
    if (!restaurant) return;
    setSaving(true);
    try {
      const savedRestaurant = await api.put('/restaurant', restaurant);
      setRestaurant(savedRestaurant);
      const saved = await api.put('/billing/config', {
        billing_api_url: billingConfig.billing_api_url,
        billing_api_token: billingConfig.billing_api_token,
        billing_offline_mode: billingConfig.billing_offline_mode,
        billing_auto_retry_enabled: billingConfig.billing_auto_retry_enabled,
        billing_auto_retry_interval_sec: billingConfig.billing_auto_retry_interval_sec,
      });
      setBillingConfig((prev) => ({
        ...prev,
        billing_api_url: saved.billing_api_url || '',
        has_billing_api_token: Boolean(saved.has_billing_api_token),
        billing_api_url_from_env: Boolean(saved.billing_api_url_from_env),
        billing_api_secret_from_env: Boolean(saved.billing_api_secret_from_env),
        billing_offline_mode: Number(saved.billing_offline_mode ?? 1),
        billing_auto_retry_enabled: Number(saved.billing_auto_retry_enabled ?? 1),
        billing_auto_retry_interval_sec: Number(saved.billing_auto_retry_interval_sec || 120),
        billing_api_token: '',
      }));
      const sc = appConfig.series_contingencia || {};
      const seriesContingenciaPayload = {
        boleta: String(sc.boleta || '').trim().toUpperCase(),
        factura: String(sc.factura || '').trim().toUpperCase(),
        enabled: Number(sc.enabled) ? 1 : 0,
      };
      const savedApp = await api.put('/admin-modules/config/app', { series_contingencia: seriesContingenciaPayload });
      setAppConfig((prev) => ({ ...prev, ...savedApp }));
      toast.success('Facturación SUNAT (emisor, series, contingencia y bot) guardada');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePagoUso = async () => {
    setSaving(true);
    try {
      const raw = appConfig.pago_uso_sistema || {};
      const periodo = raw.periodo_facturacion === 'semestral' ? 'semestral' : 'mensual';
      const g = Number(raw.comprobante_grace_days_after_due);
      const grace = Number.isFinite(g) ? Math.max(1, Math.min(14, Math.round(g))) : 3;
      const payload = {
        periodo_facturacion: periodo,
        fecha_proxima_facturacion: String(raw.fecha_proxima_facturacion || '').trim().slice(0, 32),
        numero_cuenta: String(raw.numero_cuenta || '').trim(),
        nombre_empresa_cobro: String(raw.nombre_empresa_cobro || '').trim(),
        comprobante_pago_url: String(raw.comprobante_pago_url || '').trim(),
        comprobante_grace_days_after_due: grace,
      };
      const saved = await api.put('/admin-modules/config/app', { pago_uso_sistema: payload });
      setAppConfig((prev) => ({ ...prev, ...saved }));
      try {
        const s = await api.get('/master-admin/billing-schedule');
        setPagoUsoComprobanteUi(s?.pago_uso_comprobante || null);
      } catch (_) {
        setPagoUsoComprobanteUi(null);
      }
      toast.success('Datos de pago por uso del sistema guardados');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !restaurant) {
    return (
      <div className="card py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-gold-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 px-1">
        Misma configuración que en <strong className="text-slate-700">Mi Restaurante</strong>. Los administradores del restaurante pueden verla; solo el maestro la modifica desde aquí o desde allí.
      </p>

      {isSunat ? (
        <div className="card space-y-5">
          <div className="flex items-center gap-2">
            <MdReceipt className="text-red-600 text-2xl" />
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Facturación SUNAT (emisor + bot)</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Emisor SUNAT, series normales y de contingencia, y conexión al bot. Pulse <strong>Guardar</strong> una vez.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <h4 className="font-semibold text-slate-800 text-sm">Empresa y ubicación SUNAT (emisor)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">RUC (11 dígitos)</label>
                <input className="input-field" value={restaurant.company_ruc ?? ''} onChange={(e) => update('company_ruc', e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Razón social</label>
                <input className="input-field" value={restaurant.legal_name ?? ''} onChange={(e) => update('legal_name', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre comercial (SUNAT)</label>
                <input className="input-field" value={restaurant.billing_nombre_comercial ?? ''} onChange={(e) => update('billing_nombre_comercial', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ubigeo</label>
                <input className="input-field" value={restaurant.billing_emisor_ubigeo ?? ''} onChange={(e) => update('billing_emisor_ubigeo', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="150101" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Dirección fiscal (si vacío, se usa la dirección del restaurante en Mi empresa)</label>
                <input className="input-field" value={restaurant.billing_emisor_direccion ?? ''} onChange={(e) => update('billing_emisor_direccion', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Departamento</label>
                <input className="input-field" value={restaurant.billing_emisor_departamento ?? ''} onChange={(e) => update('billing_emisor_departamento', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Provincia</label>
                <input className="input-field" value={restaurant.billing_emisor_provincia ?? ''} onChange={(e) => update('billing_emisor_provincia', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Distrito</label>
                <input className="input-field" value={restaurant.billing_emisor_distrito ?? ''} onChange={(e) => update('billing_emisor_distrito', e.target.value)} placeholder="" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Serie boleta</label>
                <input className="input-field" value={restaurant.billing_series_boleta ?? ''} onChange={(e) => update('billing_series_boleta', (e.target.value || '').toUpperCase())} placeholder="B001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Serie factura</label>
                <input className="input-field" value={restaurant.billing_series_factura ?? ''} onChange={(e) => update('billing_series_factura', (e.target.value || '').toUpperCase())} placeholder="F001" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <h4 className="font-semibold text-slate-800 text-sm">Series de contingencia</h4>
            <p className="text-xs text-slate-500">
              Para comprobantes en contingencia cuando no hay comunicación con SUNAT (según normativa y su resolución).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Serie boleta contingencia</label>
                <input
                  className="input-field"
                  value={appConfig.series_contingencia?.boleta || ''}
                  onChange={(e) => updateAppCfg('series_contingencia', 'boleta', e.target.value.toUpperCase())}
                  placeholder="BC01"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Serie factura contingencia</label>
                <input
                  className="input-field"
                  value={appConfig.series_contingencia?.factura || ''}
                  onChange={(e) => updateAppCfg('series_contingencia', 'factura', e.target.value.toUpperCase())}
                  placeholder="FC01"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Modo contingencia</label>
                <select
                  className="input-field"
                  value={appConfig.series_contingencia?.enabled ? '1' : '0'}
                  onChange={(e) => updateAppCfg('series_contingencia', 'enabled', Number(e.target.value))}
                >
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </select>
              </div>
            </div>
          </div>

          {(billingConfig.billing_api_url_from_env || billingConfig.billing_api_secret_from_env) ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-3 text-sm text-slate-700">
              <strong>Conexión fijada en el servidor:</strong> la URL y/o el secreto las define el API Node con{' '}
              <code className="text-xs bg-white px-1 rounded border">EFACT_API_URL</code> y{' '}
              <code className="text-xs bg-white px-1 rounded border">EFACT_HTTP_SECRET</code>
              {' '}en el <code className="text-xs bg-white px-1 rounded border">.env</code> (p. ej. Docker Compose).
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">URL del API del bot (Node → Python)</label>
              <input
                className={`input-field ${billingConfig.billing_api_url_from_env ? 'bg-slate-100 cursor-not-allowed' : ''}`}
                value={billingConfig.billing_api_url}
                onChange={(e) => updateBilling('billing_api_url', e.target.value)}
                placeholder="http://127.0.0.1:8765"
                disabled={billingConfig.billing_api_url_from_env}
                autoComplete="off"
                name="billing-efact-api-base-url"
                inputMode="url"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Secreto HTTP (X-EFACT-SECRET) {billingConfig.has_billing_api_token ? '(activo)' : ''}
              </label>
              <input
                className={`input-field ${billingConfig.billing_api_secret_from_env ? 'bg-slate-100 cursor-not-allowed' : ''}`}
                value={billingConfig.billing_api_token}
                onChange={(e) => updateBilling('billing_api_token', e.target.value)}
                placeholder={
                  billingConfig.billing_api_secret_from_env
                    ? 'Definido por EFACT_HTTP_SECRET en el servidor'
                    : billingConfig.has_billing_api_token
                      ? 'Vacío = mantener; debe coincidir con EFACT_HTTP_SECRET en el .env del bot'
                      : 'Opcional: mismo valor que EFACT_HTTP_SECRET en el .env del bot'
                }
                type="password"
                disabled={billingConfig.billing_api_secret_from_env}
                autoComplete="new-password"
                name="billing-efact-http-secret"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Modo offline</label>
              <select
                className="input-field"
                value={billingConfig.billing_offline_mode ? '1' : '0'}
                onChange={(e) => updateBilling('billing_offline_mode', Number(e.target.value))}
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
                onChange={(e) => updateBilling('billing_auto_retry_enabled', Number(e.target.value))}
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
                onChange={(e) => updateBilling('billing_auto_retry_interval_sec', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={saveSunat}>
              <MdSave /> {saving ? 'Guardando…' : 'Guardar facturación SUNAT y bot'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-5">
          <div className="flex items-center gap-2">
            <MdPayment className="text-blue-600 text-2xl" />
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Pago por uso del sistema</h2>
              <p className="text-sm text-slate-500">
                Periodicidad, cuenta de destino y comprobante de pago al proveedor del software.
              </p>
            </div>
          </div>

          {pagoUsoComprobanteUi?.policy_active && pagoUsoComprobanteUi.upload_comprobante_message ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>{pagoUsoComprobanteUi.upload_comprobante_message}</p>
              {pagoUsoComprobanteUi.fecha_proxima_facturacion ? (
                <p className="text-xs text-slate-500 mt-2">
                  Próxima facturación: {pagoUsoComprobanteUi.fecha_proxima_facturacion}
                  {pagoUsoComprobanteUi.comprobante_upload_deadline
                    ? ` · Ventana de carga hasta: ${pagoUsoComprobanteUi.comprobante_upload_deadline}`
                    : ''}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Frecuencia de facturación</label>
              <select
                className="input-field"
                value={appConfig.pago_uso_sistema?.periodo_facturacion === 'semestral' ? 'semestral' : 'mensual'}
                onChange={(e) => {
                  const v = e.target.value;
                  const anchor = String(billingAnchorDate || '').trim();
                  setAppConfig((prev) => {
                    const p = { ...(prev.pago_uso_sistema || {}), periodo_facturacion: v };
                    if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
                      p.fecha_proxima_facturacion = proximaFechaFromControlAnchor(
                        anchor,
                        v === 'semestral' ? 'semestral' : 'mensual',
                      );
                    }
                    return { ...prev, pago_uso_sistema: p };
                  });
                }}
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Días de gracia para subir comprobante</label>
              <input
                type="number"
                min={1}
                max={14}
                className="input-field"
                value={Number(appConfig.pago_uso_sistema?.comprobante_grace_days_after_due ?? 3)}
                onChange={(e) => updateAppCfg(
                  'pago_uso_sistema',
                  'comprobante_grace_days_after_due',
                  Math.max(1, Math.min(14, Number(e.target.value) || 3)),
                )}
              />
              <p className="text-xs text-slate-500 mt-1">Después de la fecha de facturación, días hábiles de ventana antes del bloqueo automático.</p>
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

          <p className="text-xs text-slate-500">Tras cargar un archivo, pulse <strong>Guardar</strong> para persistir la URL del comprobante.</p>

          <div className="flex justify-end pt-2">
            <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={savePagoUso}>
              <MdSave /> {saving ? 'Guardando…' : 'Guardar pago por uso'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
