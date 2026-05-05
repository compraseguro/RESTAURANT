'use strict';

/**
 * Registro estructurado de trabajos de impresión (consola JSON; extensible a archivo).
 */
function logPrintEvent(payload) {
  const line = {
    level: 'info',
    msg: 'print_bridge',
    ts: new Date().toISOString(),
    ...payload,
  };
  console.log(JSON.stringify(line));
}

function logPrintError(payload) {
  console.error(JSON.stringify({ level: 'error', msg: 'print_bridge', ts: new Date().toISOString(), ...payload }));
}

module.exports = { logPrintEvent, logPrintError };
