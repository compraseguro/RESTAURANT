/**
 * Actualiza actividad de jornada abierta (sin alterar flujo de login/logout).
 * Throttle en memoria para no saturar SQLite.
 */

const { queryOne, runSql } = require('../database');
const { v4: uuidv4 } = require('uuid');

const TRACKABLE = new Set(['admin', 'cajero', 'mozo', 'cocina', 'bar', 'delivery']);
const lastTouchByUser = new Map();
const TOUCH_MS = 45_000;
const HEARTBEAT_EVENT_MS = 5 * 60_000;

function getOpenSession(userId) {
  return queryOne(
    `SELECT id, user_id, last_activity_at FROM user_work_sessions
     WHERE user_id = ? AND logout_at IS NULL ORDER BY login_at DESC LIMIT 1`,
    [userId]
  );
}

function touchWorkSessionActivity(user, meta = {}) {
  if (!user?.id || !TRACKABLE.has(user.role)) return;
  const uid = String(user.id);
  const now = Date.now();
  const prev = lastTouchByUser.get(uid) || 0;
  if (now - prev < TOUCH_MS) return;
  lastTouchByUser.set(uid, now);

  try {
    const open = getOpenSession(uid);
    if (!open?.id) return;

    runSql(
      `UPDATE user_work_sessions SET last_activity_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [open.id]
    );

    const lastEvt = queryOne(
      `SELECT created_at FROM user_work_activity_events
       WHERE user_id = ? AND event_type = 'heartbeat' ORDER BY datetime(created_at) DESC LIMIT 1`,
      [uid]
    );
    const lastEvtMs = lastEvt?.created_at ? Date.parse(String(lastEvt.created_at).replace(' ', 'T')) : 0;
    if (!lastEvtMs || now - lastEvtMs >= HEARTBEAT_EVENT_MS) {
      runSql(
        `INSERT INTO user_work_activity_events (id, user_id, session_id, event_type, module, ref_id, meta_json)
         VALUES (?, ?, ?, 'heartbeat', ?, '', ?)`,
        [uuidv4(), uid, open.id, String(meta.module || 'app').slice(0, 40), JSON.stringify({ path: meta.path || '' })]
      );
    }
  } catch (_) {
    /* best effort */
  }
}

/** Registro de evento operativo (venta, pedido, etc.) — llamada opcional desde rutas. */
function recordWorkActivityEvent(userId, eventType, { module = '', refId = '', meta = {} } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  try {
    const open = getOpenSession(uid);
    runSql(
      `INSERT INTO user_work_activity_events (id, user_id, session_id, event_type, module, ref_id, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        uid,
        open?.id || null,
        String(eventType || 'action').slice(0, 48),
        String(module || '').slice(0, 40),
        String(refId || '').slice(0, 80),
        JSON.stringify(meta || {}),
      ]
    );
    if (open?.id) {
      runSql(
        `UPDATE user_work_sessions SET last_activity_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [open.id]
      );
    }
  } catch (_) {
    /* noop */
  }
}

module.exports = { touchWorkSessionActivity, recordWorkActivityEvent };
