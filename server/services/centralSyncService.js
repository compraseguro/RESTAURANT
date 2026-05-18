/**
 * Sincronización hacia https://restofadey.pe sin fusionar bases de datos locales.
 * Solo eventos SaaS: pagos, vouchers, planes, licencias, login.
 */
const { queryOne } = require('../database');
const { getControlConfig } = require('../masterAdminService');
const { normalizePlan } = require('../servicePlan');
const { readClientIdentity, isCentralSyncConfigured } = require('../../packages/shared-config');
const { createCentralSyncClient } = require('../../packages/shared-api');
const { SYNC_EVENT_TYPES, PAYMENT_STATUSES } = require('../../packages/shared-types');

let client = null;

function getClient() {
  if (!client) client = createCentralSyncClient();
  return client;
}

function resolvePublicVoucherUrl(relativeUrl) {
  const url = String(relativeUrl || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const identity = readClientIdentity();
  const base = String(
    identity.publicApiUrl
    || process.env.PUBLIC_API_BASE_URL
    || process.env.NEXT_PUBLIC_API_URL
    || ''
  ).replace(/\/$/, '');
  if (!base) return url;
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

function getRestaurantContext() {
  const row = queryOne('SELECT id, name, company_ruc, legal_name FROM restaurants LIMIT 1');
  const control = getControlConfig();
  const pago = queryOne('SELECT value FROM app_settings WHERE key = ?', ['pago_uso_sistema']);
  let pagoParsed = {};
  try {
    pagoParsed = pago?.value ? JSON.parse(pago.value) : {};
  } catch (_) {
    pagoParsed = {};
  }
  return {
    restaurant: row || {},
    plan: normalizePlan(control.service_plan),
    pagoUso: pagoParsed,
    billingDate: String(control.billing_date || '').trim(),
    locked: Number(control.global_lock_enabled || 0) === 1,
  };
}

function fireAndForget(promiseFactory) {
  if (!isCentralSyncConfigured()) return;
  Promise.resolve()
    .then(() => promiseFactory())
    .catch((err) => {
      console.warn('[central-sync]', err.message || err);
    });
}

/** Login de personal: actividad + espejo de usuario para dashboard central (mismo email/contraseña). */
function syncUserLogin(user, passwordHashForMirror = null) {
  fireAndForget(async () => {
    const ctx = getRestaurantContext();
    const c = getClient();
    await c.syncEvent(SYNC_EVENT_TYPES.USER_LOGIN, {
      userId: user.id,
      email: user.email || '',
      username: user.username || '',
      fullName: user.full_name || '',
      role: user.role || '',
      restaurantName: ctx.restaurant?.name || '',
    });
    if (user.email && passwordHashForMirror) {
      await c.syncUser({
        email: user.email,
        username: user.username || '',
        fullName: user.full_name || '',
        role: user.role || '',
        passwordHash: passwordHashForMirror,
        isActive: Number(user.is_active ?? 1) === 1,
      });
    }
  });
}

/** Comprobante de pago por uso del sistema → POST /api/payments */
function syncVoucherPayment({ comprobanteUrl, reference = '', amount = null, status = PAYMENT_STATUSES.PENDING }) {
  fireAndForget(async () => {
    const ctx = getRestaurantContext();
    const pago = ctx.pagoUso || {};
    const c = getClient();
    const voucherAbsolute = resolvePublicVoucherUrl(comprobanteUrl);
    const payload = {
      clientId: c.identity.clientId,
      restaurantId: c.identity.restaurantId,
      restaurante: ctx.restaurant?.name || '',
      plan: ctx.plan,
      monto: amount,
      fecha: new Date().toISOString().slice(0, 10),
      voucher: voucherAbsolute,
      referencia: reference || `pago-uso-${Date.now()}`,
      estado: status,
      periodoFacturacion: pago.periodo_facturacion || 'mensual',
      fechaProximaFacturacion: pago.fecha_proxima_facturacion || ctx.billingDate || '',
    };
    await c.syncPayment(payload);
    await c.syncEvent(SYNC_EVENT_TYPES.VOUCHER, payload);
  });
}

/** Cambio de plan o renovación */
function syncPlanStatus(extra = {}) {
  fireAndForget(async () => {
    const ctx = getRestaurantContext();
    const c = getClient();
    const payload = {
      plan: ctx.plan,
      billingDate: ctx.billingDate,
      locked: ctx.locked,
      fechaProximaFacturacion: ctx.pagoUso?.fecha_proxima_facturacion || '',
      periodoFacturacion: ctx.pagoUso?.periodo_facturacion || 'mensual',
      ...extra,
    };
    await c.syncEvent(SYNC_EVENT_TYPES.PLAN_STATUS, payload);
    if (extra.renewal) {
      await c.syncEvent(SYNC_EVENT_TYPES.PLAN_RENEWAL, payload);
    }
    await c.syncEvent(SYNC_EVENT_TYPES.LICENSE_ACTIVITY, {
      licenseKey: c.identity.licenseKey,
      status: ctx.locked ? 'suspended' : 'active',
      plan: ctx.plan,
    });
  });
}

/** Usuario activo (heartbeat opcional) */
function syncUserActive(user) {
  fireAndForget(async () => {
    const c = getClient();
    await c.syncEvent(SYNC_EVENT_TYPES.USER_ACTIVE, {
      userId: user?.id,
      email: user?.email || '',
      role: user?.role || '',
    });
  });
}

function getSyncStatus() {
  const identity = readClientIdentity();
  return {
    configured: isCentralSyncConfigured(identity),
    centralPlatformUrl: identity.centralPlatformUrl,
    clientId: identity.clientId,
    webServiceId: identity.webServiceId,
    restaurantId: identity.restaurantId,
  };
}

module.exports = {
  syncUserLogin,
  syncVoucherPayment,
  syncPlanStatus,
  syncUserActive,
  getSyncStatus,
  resolvePublicVoucherUrl,
};
