/**
 * Kardex valorizado (promedio ponderado) — insumos, recetas, integración ventas/compras/ajustes.
 * Usar siempre dentro de withTransaction(tx => ...) para operaciones que deben ser atómicas con cobros.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * @param {import('../database').Tx} tx
 * @param {object} p
 */
function registrarEntrada(tx, { insumoId, cantidad, costoUnitario, referencia, referenciaId, userId, unidadesIngreso }) {
  const ins = tx.queryOne('SELECT * FROM insumos WHERE id = ?', [insumoId]);
  if (!ins) throw new Error(`Insumo no encontrado: ${insumoId}`);
  if (!Number(ins.activo)) throw new Error(`Insumo inactivo: ${ins.nombre}`);

  const cant = Number(cantidad);
  const costoN = Number(costoUnitario);
  if (cant <= 0 || Number.isNaN(cant)) throw new Error('La cantidad de entrada debe ser mayor a 0');
  if (costoN < 0 || Number.isNaN(costoN)) throw new Error('Costo unitario inválido');

  const uAnt = Number(ins.stock_unidades != null ? ins.stock_unidades : 0) || 0;
  const hasUnidadesMov = unidadesIngreso != null;
  const uInMov = hasUnidadesMov ? Math.max(0, Number(unidadesIngreso) || 0) : 0;
  const uRes = uAnt + (hasUnidadesMov ? uInMov : 0);
  const kpuAnt = Number(ins.kg_por_unidad != null ? ins.kg_por_unidad : 0) || 0;
  let kpuN = kpuAnt;
  if (uRes > 1e-9) {
    kpuN = (kpuAnt * uAnt + cant) / uRes;
  } else {
    kpuN = 0;
  }

  const stockAnt = Number(ins.stock_actual || 0);
  const costoAnt = Number(ins.costo_promedio || 0);
  const stockRes = stockAnt + cant;
  const nuevoCosto =
    stockRes > 0 ? (stockAnt * costoAnt + cant * costoN) / stockRes : costoN;
  const costoTotal = cant * costoN;

  if (hasUnidadesMov) {
    tx.run(
      `UPDATE insumos SET stock_actual = ?, stock_unidades = ?, costo_promedio = ?, kg_por_unidad = ?, updated_at = datetime('now') WHERE id = ?`,
      [stockRes, uRes, nuevoCosto, kpuN, insumoId]
    );
  } else {
    tx.run(
      `UPDATE insumos SET stock_actual = ?, costo_promedio = ?, kg_por_unidad = ?, updated_at = datetime('now') WHERE id = ?`,
      [stockRes, nuevoCosto, kpuN, insumoId]
    );
  }

  const kid = uuidv4();
  tx.run(
    `INSERT INTO kardex (
      id, id_insumo, tipo_movimiento, cantidad, costo_unitario, costo_total,
      stock_anterior, stock_resultante, metodo_valorizacion, referencia, referencia_id, fecha, created_at, created_by
    ) VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?, 'promedio', ?, ?, datetime('now'), datetime('now'), ?)`,
    [
      kid,
      insumoId,
      cant,
      costoN,
      costoTotal,
      stockAnt,
      stockRes,
      String(referencia || 'compra'),
      String(referenciaId || ''),
      userId || null,
    ]
  );
  return kid;
}

/**
 * @param {import('../database').Tx} tx
 * @param {object} p
 * @param {string} p.insumoId
 * @param {number} p.cantidad — kg/L (si hay unidadesSalida + kpu, se reemplaza por U×kpu)
 * @param {number} [p.unidadesSalida] — p. ej. 1/4 = 0,25 U; con kpu>0 el producto vinculado (num/den) descuenta U y kg coherente
 * @param {boolean} [p.soloMasa] — solo descuenta stock en kg/L; no descuenta unidades (carnes por gramos en el plato)
 */
function registrarSalida(tx, { insumoId, cantidad, unidadesSalida, soloMasa, referencia, referenciaId, userId }) {
  const ins = tx.queryOne('SELECT * FROM insumos WHERE id = ?', [insumoId]);
  if (!ins) throw new Error(`Insumo no encontrado: ${insumoId}`);
  if (!Number(ins.activo)) throw new Error(`Insumo inactivo: ${ins.nombre}`);

  const uAnt = Number(ins.stock_unidades != null ? ins.stock_unidades : 0) || 0;
  const kpu = Number(ins.kg_por_unidad != null ? ins.kg_por_unidad : 0) || 0;
  const useUnidadExacta = unidadesSalida != null && unidadesSalida !== '' && Number.isFinite(Number(unidadesSalida));
  const dUin = useUnidadExacta ? Math.max(0, Number(unidadesSalida)) : 0;

  let need;
  if (useUnidadExacta && dUin > 0 && kpu > 1e-12) {
    if (dUin - uAnt > 1e-4) {
      throw new Error(
        `Unidades de «${ins.nombre}» insuficientes: se requieren ${dUin.toFixed(3)} U, hay ${uAnt.toFixed(3)} U.`
      );
    }
    need = dUin * kpu;
  } else {
    need = Number(cantidad);
    if (need <= 0 || Number.isNaN(need)) throw new Error('La cantidad de salida debe ser mayor a 0');
  }

  const stockAnt = Number(ins.stock_actual || 0);
  if (stockAnt + 1e-9 < need) {
    throw new Error(
      `Stock insuficiente para «${ins.nombre}»: hay ${stockAnt} ${ins.unidad_medida}, se requieren ${need}`
    );
  }

  const soloKilos = soloMasa === true;
  let dU = 0;
  if (soloKilos) {
    dU = 0;
  } else if (useUnidadExacta && dUin > 0 && kpu > 1e-12) {
    dU = dUin;
  } else if (kpu > 1e-12 && uAnt > 1e-12) {
    dU = need / kpu;
    if (dU - uAnt > 1e-4) {
      throw new Error(
        `Unidades de «${ins.nombre}» insuficientes: para ${need.toFixed(3)} ${
          ins.unidad_medida
        } (≈${dU.toFixed(3)} U a ${kpu.toFixed(3)} kg/U) solo hay ${uAnt.toFixed(3)} U en stock. Ajuste compras o recetas.`
      );
    }
  }

  const costoU = Number(ins.costo_promedio || 0);
  const stockRes = stockAnt - need;
  const uRes = Math.max(0, uAnt - dU);
  const costoTotal = need * costoU;

  tx.run(
    `UPDATE insumos SET stock_actual = ?, stock_unidades = ?, updated_at = datetime('now') WHERE id = ?`,
    [stockRes, uRes, insumoId]
  );

  const kid = uuidv4();
  tx.run(
    `INSERT INTO kardex (
      id, id_insumo, tipo_movimiento, cantidad, costo_unitario, costo_total,
      stock_anterior, stock_resultante, metodo_valorizacion, referencia, referencia_id, fecha, created_at, created_by
    ) VALUES (?, ?, 'salida', ?, ?, ?, ?, ?, 'promedio', ?, ?, datetime('now'), datetime('now'), ?)`,
    [
      kid,
      insumoId,
      need,
      costoU,
      costoTotal,
      stockAnt,
      stockRes,
      String(referencia || 'venta'),
      String(referenciaId || ''),
      userId || null,
    ]
  );
  return kid;
}

/**
 * Salida por merma o ajuste manual (usa costo promedio).
 */
function registrarAjusteSalida(tx, { insumoId, cantidad, referencia, referenciaId, userId }) {
  return registrarSalida(tx, { insumoId, cantidad, referencia: referencia || 'merma', referenciaId, userId });
}

/**
 * Ajuste de entrada por hallazgo (sobrante de inventario físico) — costo a valor promedio.
 */
function registrarAjusteEntrada(tx, { insumoId, cantidad, referencia, referenciaId, userId }) {
  const ins = tx.queryOne('SELECT * FROM insumos WHERE id = ?', [insumoId]);
  if (!ins) throw new Error(`Insumo no encontrado: ${insumoId}`);
  const costoU = Number(ins.costo_promedio || 0);
  return registrarEntrada(tx, {
    insumoId,
    cantidad,
    costoUnitario: costoU,
    referencia: referencia || 'ajuste',
    referenciaId,
    userId,
  });
}

/**
 * Idempotencia: no duplicar salidas de insumos por el mismo pedido ya valorizado.
 */
function yaAplicoVentaEnKardex(tx, orderId) {
  const row = tx.queryOne(
    `SELECT 1 as x FROM kardex WHERE referencia = 'venta' AND referencia_id = ? LIMIT 1`,
    [String(orderId)]
  );
  return Boolean(row);
}

/**
 * Descontar insumos según recetas vinculadas a productos del pedido (misma transacción que el cobro).
 * @param {import('../database').Tx} tx
 * @param {string} orderId
 * @param {string} [userId]
 */
function aplicarSalidasVentaPedido(tx, orderId, userId) {
  if (yaAplicoVentaEnKardex(tx, orderId)) return { skipped: true, reason: 'ya_procesado' };

  const items = tx.queryAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  for (const line of items) {
    const pid = line.product_id;
    if (!pid) continue;
    const qtyLine = Number(line.quantity || 0);
    if (qtyLine <= 0) continue;

    const product = tx.queryOne('SELECT * FROM products WHERE id = ?', [pid]);
    const directInsumo = product ? String(product.kardex_insumo_id || '').trim() : '';
    if (directInsumo) {
      const modo = String(product.kardex_insumo_modo || 'unidad').toLowerCase();
      if (modo === 'peso') {
        const g = Number(product.kardex_insumo_gramos) || 0;
        const needKg = (g / 1000) * qtyLine;
        if (needKg <= 0) continue;
        registrarSalida(tx, {
          insumoId: directInsumo,
          cantidad: needKg,
          soloMasa: true,
          referencia: 'venta',
          referenciaId: orderId,
          userId,
        });
        continue;
      }
      const num = Number(product.kardex_insumo_num);
      const den = Number(product.kardex_insumo_den);
      const n = num > 0 && Number.isFinite(num) ? num : 1;
      const d = den > 0 && Number.isFinite(den) ? den : 1;
      const fracU = (n / d) * qtyLine;
      if (fracU <= 0) {
        continue;
      }
      const insL = tx.queryOne('SELECT kg_por_unidad, stock_unidades, stock_actual FROM insumos WHERE id = ?', [directInsumo]);
      const kpu0 = insL ? Number(insL.kg_por_unidad) || 0 : 0;
      if (kpu0 > 1e-12) {
        const needKg = fracU * kpu0;
        registrarSalida(tx, {
          insumoId: directInsumo,
          cantidad: needKg,
          unidadesSalida: fracU,
          referencia: 'venta',
          referenciaId: orderId,
          userId,
        });
      } else {
        registrarSalida(tx, {
          insumoId: directInsumo,
          cantidad: fracU,
          referencia: 'venta',
          referenciaId: orderId,
          userId,
        });
      }
      continue;
    }

    const rec = tx.queryOne(
      `SELECT * FROM recetas WHERE product_id = ? AND activo = 1 LIMIT 1`,
      [pid]
    );
    if (!rec) continue;

    const dets = tx.queryAll('SELECT * FROM receta_detalle WHERE receta_id = ?', [rec.id]);
    for (const d of dets) {
      const need = Number(d.cantidad_usada) * qtyLine;
      if (need <= 0) continue;
      registrarSalida(tx, {
        insumoId: d.insumo_id,
        cantidad: need,
        referencia: 'venta',
        referenciaId: orderId,
        userId,
      });
    }
  }
  return { skipped: false };
}

/**
 * @param {import('../database').Tx} tx
 * @param {string[]} orderIds
 * @param {string} [userId]
 */
function aplicarSalidasVentasEnTransaccion(tx, orderIds, userId) {
  const r = [];
  for (const oid of orderIds) {
    r.push({ orderId: oid, ...aplicarSalidasVentaPedido(tx, oid, userId) });
  }
  return r;
}

/**
 * Compra de insumos (una operación, un referencia_id compartido).
 * @param {import('../database').Tx} tx
 * @param {Array<{ insumo_id: string, cantidad: number, costo_unitario: number, unidades?: number }>} items
 *   unidades: opcional; con kg actualiza el promedio `kg_por_unidad` y el stock en U. Sin unidades, solo afecta al kardex (kg).
 * @param {string} [userId]
 * @returns {string} id de operación
 */
function registrarCompraInsumos(tx, items, userId) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Debe enviar al menos un ítem de compra');
  const opId = uuidv4();
  for (const it of items) {
    const iid = String(it.insumo_id || '').trim();
    const cant = Number(it.cantidad);
    const cu = Number(it.costo_unitario);
    if (!iid) throw new Error('insumo_id requerido');
    if (cant <= 0 || Number.isNaN(cant)) throw new Error('Cantidad inválida en compra');
    if (cu < 0 || Number.isNaN(cu)) throw new Error('Costo unitario inválido');
    const uIn = it.unidades != null && it.unidades !== '' ? Number(it.unidades) : null;
    if (uIn != null && (Number.isNaN(uIn) || uIn < 0)) throw new Error('Unidades de compra inválidas (≥ 0)');
    registrarEntrada(tx, {
      insumoId: iid,
      cantidad: cant,
      costoUnitario: cu,
      referencia: 'compra',
      referenciaId: opId,
      userId,
      unidadesIngreso: uIn,
    });
  }
  return opId;
}

/**
 * Cierra inventario físico: genera entradas/salidas por diferencia.
 */
function cerrarInventarioFisico(tx, inventarioId, userId) {
  const inv = tx.queryOne('SELECT * FROM inventario_fisico WHERE id = ?', [inventarioId]);
  if (!inv) throw new Error('Inventario físico no encontrado');
  if (inv.estado === 'cerrado') throw new Error('Este inventario ya está cerrado');

  const dets = tx.queryAll('SELECT * FROM inventario_fisico_detalle WHERE inventario_id = ?', [inventarioId]);
  for (const d of dets) {
    const diff = Number(d.diferencia || 0);
    if (Math.abs(diff) < 1e-9) continue;
    if (diff > 0) {
      registrarAjusteEntrada(tx, {
        insumoId: d.insumo_id,
        cantidad: diff,
        referencia: 'inventario_fisico',
        referenciaId: inventarioId,
        userId,
      });
    } else {
      registrarAjusteSalida(tx, {
        insumoId: d.insumo_id,
        cantidad: -diff,
        referencia: 'inventario_fisico',
        referenciaId: inventarioId,
        userId,
      });
    }
  }

  tx.run(`UPDATE inventario_fisico SET estado = 'cerrado' WHERE id = ?`, [inventarioId]);
}

module.exports = {
  registrarEntrada,
  registrarSalida,
  registrarAjusteSalida,
  registrarAjusteEntrada,
  yaAplicoVentaEnKardex,
  aplicarSalidasVentaPedido,
  aplicarSalidasVentasEnTransaccion,
  registrarCompraInsumos,
  cerrarInventarioFisico,
};
