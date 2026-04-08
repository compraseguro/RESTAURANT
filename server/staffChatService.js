const { queryOne, runSql, queryAll } = require('./database');

function ensureStateRow() {
  runSql(
    `INSERT OR IGNORE INTO internal_chat_state (id, cycle_id, cycle_started_at)
     VALUES (1, 1, datetime('now'))`
  );
}

/**
 * Cuando no queda ninguna jornada abierta, marca hora para poder reiniciar el chat
 * tras 24 h (nuevo ciclo al iniciar sesión o al consultar mensajes).
 */
function markAllStaffOfflineIfNeeded() {
  ensureStateRow();
  const open = queryOne('SELECT COUNT(*) AS c FROM user_work_sessions WHERE logout_at IS NULL');
  if (Number(open?.c || 0) > 0) return;
  runSql(`UPDATE internal_chat_state SET all_staff_offline_at = datetime('now') WHERE id = 1`);
}

/**
 * Si todos cerraron sesión y pasaron ≥24 h, avanza ciclo y borra mensajes del ciclo anterior.
 */
function advanceStaffChatCycleIfDue() {
  ensureStateRow();
  const state = queryOne('SELECT cycle_id, all_staff_offline_at FROM internal_chat_state WHERE id = 1');
  if (!state?.all_staff_offline_at) return;
  const diff = queryOne(
    `SELECT (julianday('now') - julianday(?)) * 24 AS hours_since`,
    [state.all_staff_offline_at]
  );
  const hours = Number(diff?.hours_since || 0);
  if (hours < 24) return;
  const prevCycle = Number(state.cycle_id || 1);
  const nextCycle = prevCycle + 1;
  runSql('DELETE FROM staff_internal_messages WHERE cycle_id < ?', [nextCycle]);
  runSql(
    `UPDATE internal_chat_state
     SET cycle_id = ?, all_staff_offline_at = NULL, cycle_started_at = datetime('now')
     WHERE id = 1`,
    [nextCycle]
  );
}

function getChatState() {
  ensureStateRow();
  return queryOne('SELECT cycle_id, cycle_started_at, all_staff_offline_at FROM internal_chat_state WHERE id = 1');
}

function getCurrentCycleId() {
  const s = getChatState();
  return Number(s?.cycle_id || 1);
}

module.exports = {
  ensureStateRow,
  markAllStaffOfflineIfNeeded,
  advanceStaffChatCycleIfDue,
  getChatState,
  getCurrentCycleId,
};
