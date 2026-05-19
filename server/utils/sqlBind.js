/** sql.js rechaza `undefined` en bind; normalizar a NULL evita 500 opacos. */
function normalizeSqlParams(params) {
  if (!Array.isArray(params)) return params;
  return params.map((p) => (p === undefined ? null : p));
}

module.exports = { normalizeSqlParams };
