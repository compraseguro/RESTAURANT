/**
 * Planes comerciales (admin maestro) → módulos permitidos.
 * Valores en master_admin_control.service_plan: basico | intermedio | profesional
 *
 * Alineación con comercial:
 * - Básico: pedidos (salón/delivery), ventas/caja, almacén base, informes, productos, configuración.
 * - Intermedio: + QR auto-pedido, clientes/créditos, cocina/bar, ofertas/descuentos, indicadores, tiempo trabajado.
 * - Profesional: + Mi restaurante (SUNAT / facturación electrónica).
 */

const MODULE_IDS = [
  'escritorio', 'ventas', 'caja', 'mesas', 'reservas', 'auto_pedido', 'creditos', 'clientes',
  'productos', 'ofertas', 'descuentos', 'almacen', 'delivery', 'informes',
  'indicadores', 'mi_restaurant', 'configuracion', 'cocina', 'bar', 'tiempo_trabajado',
];

const BASICO = new Set([
  'escritorio', 'ventas', 'caja', 'mesas', 'reservas', 'delivery',
  'almacen', 'informes', 'productos', 'configuracion',
]);

const INTERMEDIO = new Set([
  ...BASICO,
  'auto_pedido', 'creditos', 'clientes', 'cocina', 'bar',
  'ofertas', 'descuentos', 'indicadores', 'tiempo_trabajado',
  /** Contrato y pagos al proveedor; la pestaña SUNAT queda solo en Profesional (UI). */
  'mi_restaurant',
]);

const PROFESIONAL = new Set(MODULE_IDS);

function normalizePlan(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'basico' || s === 'básico' || s === 'basic') return 'basico';
  if (s === 'intermedio' || s === 'intermediate') return 'intermedio';
  if (s === 'profesional' || s === 'professional' || s === 'pro') return 'profesional';
  return 'profesional';
}

function getModuleSetForPlan(planKey) {
  const p = normalizePlan(planKey);
  if (p === 'basico') return BASICO;
  if (p === 'intermedio') return INTERMEDIO;
  return PROFESIONAL;
}

function isPermissionEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * @param {string} planKey
 * @param {string} role
 * @param {Record<string, boolean>} rawPerms permisos por usuario (cajero/mozo/…)
 * @returns {Record<string, boolean>}
 */
function getEffectivePermissions(planKey, role, rawPerms = {}) {
  const allowed = getModuleSetForPlan(planKey);
  const r = String(role || '').toLowerCase();
  return MODULE_IDS.reduce((acc, id) => {
    const inPlan = allowed.has(id);
    if (r === 'admin') {
      acc[id] = inPlan;
    } else {
      acc[id] = inPlan && isPermissionEnabled(rawPerms[id]);
    }
    return acc;
  }, {});
}

/** Requerimiento / recepción en almacén: solo intermedio o superior (marketing: almacén avanzado). */
function planAllowsAlmacenAvanzado(planKey) {
  return normalizePlan(planKey) !== 'basico';
}

module.exports = {
  MODULE_IDS,
  normalizePlan,
  getModuleSetForPlan,
  getEffectivePermissions,
  planAllowsAlmacenAvanzado,
};
