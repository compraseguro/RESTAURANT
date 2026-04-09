const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { queryOne, runSql } = require('./database');

const MASTER_SETTING_KEY = 'master_admin_control';
const MASTER_NOTIFICATIONS_KEY = 'master_admin_notifications';
const MASTER_AUTH_KEY = 'master_admin_auth';
/** Preferir MASTER_USERNAME / MASTER_PASSWORD en .env o en el host (Render). Estos son solo fallback si no hay env. */
const DEFAULT_MASTER_USERNAME = String(process.env.MASTER_USERNAME || 'Romero2587903042007').trim() || 'Romero2587903042007';
const DEFAULT_MASTER_PASSWORD = String(process.env.MASTER_PASSWORD || '2587903042007').trim() || '2587903042007';

const DEFAULT_CONTROL = {
  contract_title: 'Contrato de venta',
  contract_notes: '',
  billing_date: '',
  notify_days_before: 5,
  auto_block_on_overdue: 1,
  global_lock_enabled: 0,
  global_lock_reason: 'Bloqueo por falta de pago',
  lock_enabled_by: '',
  lock_enabled_at: '',
  billing_alert_sent_for: '',
};

function parseJsonSafe(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function readSetting(key, fallback) {
  const row = queryOne('SELECT value FROM app_settings WHERE key = ?', [key]);
  return parseJsonSafe(row?.value, fallback);
}

function upsertSetting(key, value) {
  runSql(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, JSON.stringify(value)]
  );
}

function getMasterAuthConfig() {
  const current = readSetting(MASTER_AUTH_KEY, {});
  const username = String(current?.username || DEFAULT_MASTER_USERNAME).trim() || DEFAULT_MASTER_USERNAME;
  let passwordHash = String(current?.password_hash || '').trim();
  if (!passwordHash) {
    passwordHash = bcrypt.hashSync(DEFAULT_MASTER_PASSWORD, 10);
    upsertSetting(MASTER_AUTH_KEY, { username, password_hash: passwordHash, updated_at: new Date().toISOString() });
  }
  return { username, password_hash: passwordHash };
}

function getMasterCredentialsPublic() {
  const auth = getMasterAuthConfig();
  return { username: auth.username };
}

function verifyMasterCredentials(username, password) {
  const auth = getMasterAuthConfig();
  const incomingUsername = String(username || '').trim();
  const incomingPassword = String(password || '');
  if (!incomingUsername || !incomingPassword) return false;
  if (incomingUsername !== auth.username) return false;
  return bcrypt.compareSync(incomingPassword, auth.password_hash);
}

function updateMasterCredentials({ current_password, new_username, new_password }) {
  const auth = getMasterAuthConfig();
  const currentPassword = String(current_password || '');
  if (!bcrypt.compareSync(currentPassword, auth.password_hash)) {
    throw new Error('La contraseña actual del administrador maestro es incorrecta');
  }

  const nextUsername = String(new_username || auth.username).trim() || auth.username;
  const nextPasswordHash = String(new_password || '').trim()
    ? bcrypt.hashSync(String(new_password), 10)
    : auth.password_hash;

  upsertSetting(MASTER_AUTH_KEY, {
    username: nextUsername,
    password_hash: nextPasswordHash,
    updated_at: new Date().toISOString(),
  });

  return { username: nextUsername };
}

function getControlConfig() {
  return {
    ...DEFAULT_CONTROL,
    ...(readSetting(MASTER_SETTING_KEY, {}) || {}),
  };
}

function getNotifications() {
  const raw = readSetting(MASTER_NOTIFICATIONS_KEY, []);
  const list = Array.isArray(raw) ? raw : [];
  return list.map((n) => ({
    id: String(n?.id || uuidv4()),
    title: String(n?.title || 'Notificación').trim(),
    message: String(n?.message || '').trim(),
    image_url: String(n?.image_url || '').trim(),
    level: String(n?.level || 'info').trim() || 'info',
    created_by: String(n?.created_by || 'Sistema').trim(),
    created_at: String(n?.created_at || new Date().toISOString()),
    expires_at: n?.expires_at ? String(n.expires_at) : null,
    deleted_at: n?.deleted_at ? String(n.deleted_at) : null,
    updated_at: n?.updated_at ? String(n.updated_at) : null,
  })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function saveNotifications(notifications) {
  upsertSetting(MASTER_NOTIFICATIONS_KEY, (notifications || []).slice(0, 200));
}

function isNotificationActive(notification, nowDate = new Date()) {
  if (!notification || notification.deleted_at) return false;
  if (!notification.expires_at) return true;
  const expiresAt = new Date(notification.expires_at);
  if (Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() > nowDate.getTime();
}

function getActiveNotifications() {
  const now = new Date();
  return getNotifications().filter((n) => isNotificationActive(n, now));
}

function addNotification({ title, message, image_url = '', created_by = 'Sistema', level = 'info', duration_hours = null }) {
  const notifications = getNotifications();
  const hasDuration = duration_hours !== null && duration_hours !== undefined && Number(duration_hours) > 0;
  const expiresAt = hasDuration
    ? new Date(Date.now() + (Number(duration_hours) * 60 * 60 * 1000)).toISOString()
    : null;
  const entry = {
    id: uuidv4(),
    title: String(title || 'Notificación').trim(),
    message: String(message || '').trim(),
    image_url: String(image_url || '').trim(),
    level: String(level || 'info').trim() || 'info',
    created_by: String(created_by || 'Sistema').trim(),
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    deleted_at: null,
    updated_at: null,
  };
  notifications.unshift(entry);
  saveNotifications(notifications);
  return entry;
}

function updateNotification({ id, title, message, image_url = '', duration_hours = null }) {
  const notifications = getNotifications();
  const idx = notifications.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error('No se encontró la notificación');
  const current = notifications[idx];
  const hasDuration = duration_hours !== null && duration_hours !== undefined && Number(duration_hours) > 0;
  const expiresAt = hasDuration
    ? new Date(Date.now() + (Number(duration_hours) * 60 * 60 * 1000)).toISOString()
    : null;
  notifications[idx] = {
    ...current,
    title: String(title || current.title || 'Notificación').trim(),
    message: String(message || current.message || '').trim(),
    image_url: String(image_url || current.image_url || '').trim(),
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  saveNotifications(notifications);
  return notifications[idx];
}

function deleteNotification(id) {
  const notifications = getNotifications();
  const next = notifications.filter((n) => n.id !== id);
  if (next.length === notifications.length) throw new Error('No se encontró la notificación');
  saveNotifications(next);
  return { success: true };
}

function isoDateKeyNow() {
  return new Date().toISOString().slice(0, 10);
}

function diffDays(startDateKey, endDateKey) {
  const a = new Date(`${startDateKey}T00:00:00Z`);
  const b = new Date(`${endDateKey}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function evaluateAutomaticBillingRules() {
  const current = getControlConfig();
  const today = isoDateKeyNow();
  const billingDate = String(current.billing_date || '').trim();
  let changed = false;

  if (billingDate) {
    const daysToDue = diffDays(today, billingDate);
    const notifyWindow = Math.max(1, Number(current.notify_days_before || 5));

    if (
      daysToDue !== null
      && daysToDue >= 0
      && daysToDue <= notifyWindow
      && current.billing_alert_sent_for !== billingDate
    ) {
      addNotification({
        title: 'Vencimiento de facturación cercano',
        message: `Tu fecha de pago vence el ${billingDate}. Quedan ${daysToDue} día(s).`,
        created_by: 'Sistema automático',
        level: 'warning',
      });
      current.billing_alert_sent_for = billingDate;
      changed = true;
    }

    if (daysToDue !== null && daysToDue < 0 && Number(current.auto_block_on_overdue || 0) === 1 && Number(current.global_lock_enabled || 0) !== 1) {
      current.global_lock_enabled = 1;
      current.global_lock_reason = current.global_lock_reason || 'Bloqueo por falta de pago';
      current.lock_enabled_by = 'Sistema automático';
      current.lock_enabled_at = new Date().toISOString();
      addNotification({
        title: 'Sistema bloqueado automáticamente',
        message: `Se activó bloqueo por falta de pago. Vencimiento: ${billingDate}.`,
        created_by: 'Sistema automático',
        level: 'danger',
      });
      changed = true;
    }
  }

  if (changed) upsertSetting(MASTER_SETTING_KEY, current);
  return current;
}

function setControlConfig(patch = {}, actorName = '') {
  const current = getControlConfig();
  const next = {
    ...current,
    ...patch,
  };
  if (patch.global_lock_enabled !== undefined) {
    const enabled = Number(patch.global_lock_enabled || 0) === 1 ? 1 : 0;
    next.global_lock_enabled = enabled;
    next.lock_enabled_at = new Date().toISOString();
    next.lock_enabled_by = actorName || 'Administrador maestro';
    if (enabled && !String(next.global_lock_reason || '').trim()) {
      next.global_lock_reason = 'Bloqueo por falta de pago';
    }
  }
  upsertSetting(MASTER_SETTING_KEY, next);
  return next;
}

function getLockState() {
  const control = evaluateAutomaticBillingRules();
  return {
    locked: Number(control.global_lock_enabled || 0) === 1,
    reason: String(control.global_lock_reason || 'Bloqueo por falta de pago'),
    control,
  };
}

module.exports = {
  MASTER_SETTING_KEY,
  MASTER_NOTIFICATIONS_KEY,
  MASTER_AUTH_KEY,
  DEFAULT_CONTROL,
  getControlConfig,
  setControlConfig,
  getNotifications,
  getActiveNotifications,
  addNotification,
  updateNotification,
  deleteNotification,
  evaluateAutomaticBillingRules,
  getLockState,
  getMasterCredentialsPublic,
  verifyMasterCredentials,
  updateMasterCredentials,
};
