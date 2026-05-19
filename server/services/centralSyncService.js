/**
 * Puente SaaS hacia el panel central: solo comprobantes y licencia por defecto.
 * Sync extendido (login, planes, eventos) requiere CENTRAL_SYNC_EXTENDED=1.
 */
const { queryOne } = require('../database');
const { getControlConfig } = require('../masterAdminService');
const { normalizePlan } = require('../servicePlan');
const {
  readClientIdentity,
  isCentralSyncConfigured,
  isExtendedCentralSyncConfigured,
  getCentralSyncConfigDiagnostics,
} = require('../../packages/shared-config');
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
    || '',
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

function getAdminContact() {
  const row = queryOne(
    `SELECT email, full_name FROM users
     WHERE lower(role) IN ('admin','master_admin') AND is_active = 1
     ORDER BY CASE WHEN lower(role) = 'admin' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`,
  );
  return {
    adminName: String(row?.full_name || '').trim(),
    adminEmail: String(row?.email || '').trim(),
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

/** Login → central solo con CENTRAL_SYNC_EXTENDED=1 */
function syncUserLogin(user, passwordHashForMirror = null) {
  if (!isExtendedCentralSyncConfigured()) return;
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

async function buildMinimalPaymentPayload({ comprobanteUrl, reference = '', amount = null }) {
  const ctx = getRestaurantContext();
  const identity = readClientIdentity();
  const admin = getAdminContact();
  const voucherAbsolute = resolvePublicVoucherUrl(comprobanteUrl);
  const operationNumber = String(reference || '').trim() || `pago-uso-${Date.now()}`;
  return {
    clientId: identity.clientId,
    restaurantName: String(ctx.restaurant?.name || '').trim(),
    adminName: admin.adminName,
    adminEmail: admin.adminEmail,
    plan: ctx.plan,
    voucherUrl: voucherAbsolute,
    amount: amount != null && Number.isFinite(Number(amount)) ? Number(amount) : null,
    operationNumber,
    paymentDate: new Date().toISOString().slice(0, 10),
  };
}

/** Comprobante → POST /api/payments (asíncrono, payload mínimo) */
function syncVoucherPayment(opts) {
  fireAndForget(async () => {
    const payload = await buildMinimalPaymentPayload(opts);
    const c = getClient();
    await c.syncMinimalPayment(payload);
    if (isExtendedCentralSyncConfigured()) {
      await c.syncEvent(SYNC_EVENT_TYPES.VOUCHER, payload);
    }
  });
}

/** Envío con respuesta (registro pendiente + reintentos en platformPaymentService). */
async function syncVoucherPaymentNow(opts) {
  if (!isCentralSyncConfigured()) return { skipped: true, reason: 'central_not_configured' };
  const payload = await buildMinimalPaymentPayload(opts);
  const c = getClient();
  const payRes = await c.syncMinimalPayment(payload);
  if (isExtendedCentralSyncConfigured() && payRes?.ok) {
    await c.syncEvent(SYNC_EVENT_TYPES.VOUCHER, payload);
  }
  return payRes;
}

/** Planes / licencia en central — solo modo extendido */
function syncPlanStatus(extra = {}) {
  if (!isExtendedCentralSyncConfigured()) return;
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
      licenseKey: c.identity.licenseKey || c.identity.clientId,
      status: ctx.locked ? 'suspended' : 'active',
      plan: ctx.plan,
    });
  });
}

function syncUserActive(user) {
  if (!isExtendedCentralSyncConfigured()) return;
  fireAndForget(async () => {
    const c = getClient();
    await c.syncEvent(SYNC_EVENT_TYPES.USER_ACTIVE, {
      userId: user?.id,
      email: user?.email || '',
      role: user?.role || '',
    });
  });
}

async function fetchCentralLicenseStatus() {
  if (!isCentralSyncConfigured()) return { skipped: true };
  const c = getClient();
  return c.fetchLicenseStatus(c.identity.clientId);
}

function getSyncStatus() {
  const identity = readClientIdentity();
  const diagnostics = getCentralSyncConfigDiagnostics(identity);
  return {
    configured: diagnostics.configured,
    extendedConfigured: diagnostics.extendedConfigured,
    centralPlatformUrl: identity.centralPlatformUrl,
    clientId: identity.clientId,
    webServiceId: identity.webServiceId || identity.clientId,
    restaurantId: identity.restaurantId,
    hasPublicApiUrl: diagnostics.hasPublicApiUrl,
    missingEnvVars: diagnostics.missing,
    paymentsEndpoint: `${identity.centralPlatformUrl || ''}/api/payments`,
    licenseEndpoint: `${identity.centralPlatformUrl || ''}/api/license-status/${identity.clientId || ':clientId'}`,
  };
}

module.exports = {
  syncUserLogin,
  syncVoucherPayment,
  syncVoucherPaymentNow,
  syncPlanStatus,
  syncUserActive,
  getSyncStatus,
  fetchCentralLicenseStatus,
  resolvePublicVoucherUrl,
  buildMinimalPaymentPayload,
};
