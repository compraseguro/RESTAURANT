/**
 * Pagos por comprobante: pendiente → plataforma central → aprobado/rechazado (polling).
 * El comprobante permanece en BD; la UI lo oculta tras aprobación.
 */
const { readClientIdentity, isCentralSyncConfigured } = require('../../packages/shared-config');
const { PAYMENT_STATUSES, normalizePaymentEstado } = require('../../packages/shared-types');
const { mapCentralSyncError } = require('./saasPanelErrors');
const { queryOne, runSql } = require('../database');
const { proximaFechaFromControlAnchor } = require('../pagoUsoBillingSync');
const {
  addNotification,
  clearNotificationsByTitle,
  releaseAutoLockIfComprobantePresent,
} = require('../masterAdminService');

const PAGO_USO_KEY = 'pago_uso_sistema';
const APPROVAL_NOTIFICATION_TITLE = 'Pago aprobado — Resto Fadey';
const PENDING_NOTIFICATION_TITLE = 'Comprobante recibido — pendiente de aprobación';
const REJECTED_NOTIFICATION_TITLE = 'Pago rechazado — Resto Fadey';

const POLL_MS = Math.max(15000, Number(process.env.PLATFORM_PAYMENT_POLL_MS || 60000));
const RETRY_DELAYS_MS = [800, 2000, 5000];

let pollTimer = null;
let pollInFlight = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withCentralRetry(fn) {
  let last = null;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
    last = await fn();
    if (last?.ok || last?.skipped) return last;
    if (i < RETRY_DELAYS_MS.length - 1) {
      await sleep(RETRY_DELAYS_MS[i]);
    }
  }
  return last;
}

function readPagoUso() {
  const row = queryOne('SELECT value FROM app_settings WHERE key = ?', [PAGO_USO_KEY]);
  try {
    return row?.value ? JSON.parse(row.value) : {};
  } catch (_) {
    return {};
  }
}

function writePagoUso(pago) {
  runSql(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [PAGO_USO_KEY, JSON.stringify(pago || {})],
  );
}

function isoDateKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generateReferencia() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RF-${Date.now()}-${suffix}`;
}

function appendHistorial(pago, entry) {
  const hist = Array.isArray(pago.platform_payment?.historial) ? [...pago.platform_payment.historial] : [];
  hist.unshift(entry);
  if (hist.length > 50) hist.length = 50;
  return hist;
}

function isPaymentApprovedForUnlock(pago) {
  if (!isCentralSyncConfigured()) return true;
  const pp = pago?.platform_payment || {};
  const estado = normalizePaymentEstado(pp.estado);
  if (!estado && String(pago?.comprobante_pago_url || '').trim()) {
    return true;
  }
  return estado === PAYMENT_STATUSES.APPROVED;
}

/** Desbloqueo y aviso legacy (sin plataforma central configurada). */
function legacyConfirmComprobanteOnUpload(urlTrimmed) {
  if (!String(urlTrimmed || '').trim()) return;
  releaseAutoLockIfComprobantePresent(urlTrimmed, { legacySuccessMessage: true });
}

async function fetchCentralStatus(referencia) {
  if (!isCentralSyncConfigured()) return { skipped: true };
  const { fetchCentralLicenseStatus } = require('./centralSyncService');
  const licenseRes = await fetchCentralLicenseStatus();
  if (licenseRes?.ok && licenseRes.data) {
    const d = licenseRes.data;
    const remoteEstado = normalizePaymentEstado(
      d.paymentStatus || d.payment?.estado,
    );
    if (remoteEstado) {
      return {
        ok: true,
        data: {
          estado: remoteEstado,
          payment: d.payment || { estado: remoteEstado, id: d.payment?.id },
          licenseStatus: d.licenseStatus,
        },
      };
    }
  }

  const identity = readClientIdentity();
  const ref = String(referencia || '').trim();
  const qs = new URLSearchParams({ clientId: identity.clientId });
  if (ref) qs.set('referencia', ref);
  const url = `${identity.centralPlatformUrl}/api/payments/status?${qs.toString()}`;
  const headers = {
    Authorization: `Bearer ${identity.apiSecretKey}`,
    'X-Client-Id': identity.clientId,
    'X-WebService-Id': identity.webServiceId || identity.clientId,
    'X-License-Key': identity.licenseKey || identity.clientId,
  };
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }
    if (!res.ok) {
      return { ok: false, status: res.status, data };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function renewLicenseOnPaymentApproved(pago) {
  const periodo = pago.periodo_facturacion === 'semestral' ? 'semestral' : 'mensual';
  const today = isoDateKeyNow();
  const current = String(pago.fecha_proxima_facturacion || '').trim();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(current) && current >= today ? current : today;
  pago.fecha_proxima_facturacion = proximaFechaFromControlAnchor(anchor, periodo);
  pago.comprobante_alert_sent_for = '';
  return pago;
}

function notifyPaymentApproved() {
  clearNotificationsByTitle(APPROVAL_NOTIFICATION_TITLE);
  clearNotificationsByTitle('Pago exitoso¡ Gracias por trabajar con Resto Fadey');
  addNotification({
    title: APPROVAL_NOTIFICATION_TITLE,
    message: 'Pago aprobado correctamente. Licencia actualizada.',
    created_by: 'Plataforma central',
    level: 'success',
  });
}

function notifyPaymentRejected(motivo) {
  addNotification({
    title: REJECTED_NOTIFICATION_TITLE,
    message: motivo || 'Su comprobante no fue aprobado. Contacte a soporte o suba un nuevo comprobante.',
    created_by: 'Plataforma central',
    level: 'warning',
  });
}

function notifyPaymentPending() {
  clearNotificationsByTitle(PENDING_NOTIFICATION_TITLE);
  addNotification({
    title: PENDING_NOTIFICATION_TITLE,
    message: 'Su comprobante fue enviado y está pendiente de revisión por el administrador.',
    created_by: 'Sistema automático',
    level: 'info',
  });
}

function applyPaymentApproved({ centralPaymentId, resolvedAt } = {}) {
  const pago = readPagoUso();
  const pp = { ...(pago.platform_payment || {}) };
  const now = resolvedAt || new Date().toISOString();
  const ref = String(pp.referencia || '').trim();
  const url = String(pago.comprobante_pago_url || '').trim();

  pp.estado = PAYMENT_STATUSES.APPROVED;
  pp.resolved_at = now;
  pp.comprobante_oculto_ui = true;
  if (centralPaymentId) pp.central_payment_id = centralPaymentId;

  pago.platform_payment = pp;
  pago.platform_payment.historial = appendHistorial(pago, {
    fecha: now.slice(0, 10),
    voucher: url,
    estado: PAYMENT_STATUSES.APPROVED,
    referencia: ref,
    monto: pp.monto ?? null,
    aprobacion_at: now,
  });

  const renewed = renewLicenseOnPaymentApproved(pago);
  writePagoUso(renewed);

  if (url) {
    releaseAutoLockIfComprobantePresent(url, { legacySuccessMessage: false });
  }
  notifyPaymentApproved();
  clearNotificationsByTitle(PENDING_NOTIFICATION_TITLE);

  return getPublicPlatformPaymentState();
}

function applyPaymentRejected({ motivo, resolvedAt } = {}) {
  const pago = readPagoUso();
  const pp = { ...(pago.platform_payment || {}) };
  const now = resolvedAt || new Date().toISOString();
  const ref = String(pp.referencia || '').trim();
  const url = String(pago.comprobante_pago_url || '').trim();

  pp.estado = PAYMENT_STATUSES.REJECTED;
  pp.resolved_at = now;
  pp.comprobante_oculto_ui = false;

  pago.platform_payment = pp;
  pago.platform_payment.historial = appendHistorial(pago, {
    fecha: now.slice(0, 10),
    voucher: url,
    estado: PAYMENT_STATUSES.REJECTED,
    referencia: ref,
    monto: pp.monto ?? null,
    rechazo_motivo: motivo || '',
  });
  writePagoUso(pago);
  notifyPaymentRejected(motivo);
  clearNotificationsByTitle(PENDING_NOTIFICATION_TITLE);

  return getPublicPlatformPaymentState();
}

/**
 * Registra comprobante en estado pendiente y lo envía a la plataforma central.
 */
async function registerPendingComprobantePayment({ comprobanteUrl, monto = null, referencia = null }) {
  const url = String(comprobanteUrl || '').trim();
  if (!url) return null;

  const ref = String(referencia || '').trim() || generateReferencia();
  const now = new Date().toISOString();
  let pago = readPagoUso();

  pago.platform_payment = {
    estado: PAYMENT_STATUSES.PENDING,
    referencia: ref,
    monto: monto != null && Number.isFinite(Number(monto)) ? Number(monto) : null,
    central_payment_id: null,
    submitted_at: now,
    resolved_at: null,
    comprobante_oculto_ui: false,
    historial: appendHistorial(pago, {
      fecha: now.slice(0, 10),
      voucher: url,
      estado: PAYMENT_STATUSES.PENDING,
      referencia: ref,
      monto: monto != null && Number.isFinite(Number(monto)) ? Number(monto) : null,
      aprobacion_at: null,
    }),
  };
  writePagoUso(pago);
  notifyPaymentPending();

  await pushComprobanteToCentral({ comprobanteUrl: url, referencia: ref });

  return getPublicPlatformPaymentState();
}

function recordCentralSyncResult(pago, result) {
  const pp = { ...(pago.platform_payment || {}) };
  pp.last_central_sync_at = new Date().toISOString();
  if (result?.skipped) {
    pp.last_central_sync_ok = false;
    pp.last_central_sync_error = `Sync omitido: ${result.reason || 'central_not_configured'}`;
  } else if (result?.ok) {
    pp.last_central_sync_ok = true;
    pp.last_central_sync_error = '';
    if (result?.data?.paymentId) pp.central_payment_id = result.data.paymentId;
  } else {
    pp.last_central_sync_ok = false;
    const detail = result?.data?.error || result?.error || `HTTP ${result?.status || '?'}`;
    pp.last_central_sync_error = String(detail).slice(0, 500);
    console.warn('[platform-payment] sync central falló:', pp.last_central_sync_error);
  }
  pago.platform_payment = pp;
  writePagoUso(pago);
  return pp;
}

/** Envía (o reenvía) el comprobante actual a POST /api/payments */
async function pushComprobanteToCentral({ comprobanteUrl, referencia } = {}) {
  const pago = readPagoUso();
  const url = String(comprobanteUrl || pago.comprobante_pago_url || '').trim();
  if (!url) return { ok: false, error: 'sin_comprobante_url' };

  if (!isCentralSyncConfigured()) {
    const diag = require('../../packages/shared-config').getCentralSyncConfigDiagnostics();
    const result = { skipped: true, reason: `faltan variables: ${diag.missing.join(', ')}` };
    recordCentralSyncResult(pago, result);
    return result;
  }

  const ref = String(referencia || pago.platform_payment?.referencia || '').trim() || generateReferencia();
  try {
    const { syncVoucherPaymentNow } = require('./centralSyncService');
    const syncResult = await withCentralRetry(() =>
      syncVoucherPaymentNow({
        comprobanteUrl: url,
        reference: ref,
        amount: pago.platform_payment?.monto ?? null,
      }),
    );
    recordCentralSyncResult(readPagoUso(), syncResult);
    return syncResult;
  } catch (err) {
    const result = { ok: false, error: err.message || String(err) };
    recordCentralSyncResult(readPagoUso(), result);
    return result;
  }
}

async function pollAndApplyPaymentStatus() {
  if (pollInFlight) return;
  if (!isCentralSyncConfigured()) return;

  const pago = readPagoUso();
  const pp = pago.platform_payment || {};
  const estado = normalizePaymentEstado(pp.estado);
  if (!pp.referencia && estado !== PAYMENT_STATUSES.PENDING) return;
  if (estado === PAYMENT_STATUSES.APPROVED || estado === PAYMENT_STATUSES.REJECTED) return;

  pollInFlight = true;
  try {
    const result = await fetchCentralStatus(pp.referencia);
    if (!result.ok || !result.data) return;

    const remoteEstado = normalizePaymentEstado(result.data.estado || result.data.payment?.estado);
    if (remoteEstado === PAYMENT_STATUSES.APPROVED) {
      applyPaymentApproved({
        centralPaymentId: result.data.payment?.id || result.data.paymentId,
        resolvedAt: result.data.payment?.updated_at,
      });
    } else if (remoteEstado === PAYMENT_STATUSES.REJECTED) {
      applyPaymentRejected({
        motivo: result.data.payment?.rechazo_motivo || result.data.motivo,
        resolvedAt: result.data.payment?.updated_at,
      });
    }
  } finally {
    pollInFlight = false;
  }
}

function getPublicPlatformPaymentState() {
  const pago = readPagoUso();
  const pp = pago.platform_payment || {};
  const estado = normalizePaymentEstado(pp.estado);
  const centralOn = isCentralSyncConfigured();
  const approved = estado === PAYMENT_STATUSES.APPROVED;
  const pending = estado === PAYMENT_STATUSES.PENDING;
  const rejected = estado === PAYMENT_STATUSES.REJECTED;
  const oculto = Boolean(pp.comprobante_oculto_ui) || approved;

  return {
    central_configured: centralOn,
    estado: estado || (centralOn ? null : 'aprobado'),
    referencia: String(pp.referencia || ''),
    monto: pp.monto ?? null,
    submitted_at: pp.submitted_at || null,
    resolved_at: pp.resolved_at || null,
    comprobante_oculto_ui: oculto,
    comprobante_visible_en_panel: Boolean(String(pago.comprobante_pago_url || '').trim()) && !oculto,
    show_pending_banner: pending,
    show_approved_banner: approved,
    show_rejected_banner: rejected,
    plan_activo: approved,
    mensaje_aprobado: approved
      ? 'Pago aprobado correctamente. Licencia actualizada.'
      : '',
    mensaje_licencia: approved ? 'Licencia actualizada' : '',
    historial_count: Array.isArray(pp.historial) ? pp.historial.length : 0,
    last_central_sync_ok: pp.last_central_sync_ok ?? null,
    last_central_sync_error: String(pp.last_central_sync_error || ''),
    central_user_message: !pp.last_central_sync_ok && pp.last_central_sync_error
      ? mapCentralSyncError({
          ok: false,
          error: pp.last_central_sync_error,
          last_central_sync_error: pp.last_central_sync_error,
        })
      : '',
    show_resync_hint: pending && pp.last_central_sync_ok === false,
    last_central_sync_at: pp.last_central_sync_at || null,
    central_payment_id: pp.central_payment_id || null,
  };
}

function startPlatformPaymentPoller() {
  if (pollTimer) return;
  if (!isCentralSyncConfigured()) {
    console.log('[platform-payment] polling desactivado (central no configurada)');
    return;
  }
  pollAndApplyPaymentStatus().catch(() => {});
  pollTimer = setInterval(() => {
    pollAndApplyPaymentStatus().catch((err) => {
      console.warn('[platform-payment] poll:', err.message || err);
    });
  }, POLL_MS);
  console.log(`[platform-payment] polling cada ${POLL_MS}ms`);
}

module.exports = {
  registerPendingComprobantePayment,
  legacyConfirmComprobanteOnUpload,
  pollAndApplyPaymentStatus,
  getPublicPlatformPaymentState,
  startPlatformPaymentPoller,
  isPaymentApprovedForUnlock,
  applyPaymentApproved,
  applyPaymentRejected,
  fetchCentralStatus,
  pushComprobanteToCentral,
};
