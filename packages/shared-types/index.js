/** Eventos permitidos hacia la plataforma central (no operativos del restaurante). */
const SYNC_EVENT_TYPES = Object.freeze({
  PAYMENT: 'payment',
  VOUCHER: 'voucher',
  PLAN_RENEWAL: 'plan_renewal',
  PLAN_STATUS: 'plan_status',
  LICENSE_ACTIVITY: 'license_activity',
  USER_LOGIN: 'user_login',
  USER_ACTIVE: 'user_active',
});

const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const LICENSE_STATUSES = Object.freeze({
  ACTIVE: 'active',
  GRACE: 'grace',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
});

const SERVICE_PLANS = Object.freeze({
  BASICO: 'basico',
  INTERMEDIO: 'intermedio',
  PROFESIONAL: 'profesional',
});

module.exports = {
  SYNC_EVENT_TYPES,
  PAYMENT_STATUSES,
  LICENSE_STATUSES,
  SERVICE_PLANS,
};
