'use strict';

/** Misma heurística que el cliente para repartir pedidos entre bar y cocina. */

function isBarText(value = '') {
  const text = String(value || '').toLowerCase();
  return ['bar', 'bebida', 'bebidas', 'trago', 'tragos', 'coctel', 'cocteles', 'cocktail', 'cocktails'].some((token) =>
    text.includes(token)
  );
}

function isBarItemForStation(item) {
  if (String(item?.production_area || '').toLowerCase() === 'bar') return true;
  const name = String(item?.product_name || '').toLowerCase();
  return isBarText(name);
}

function isBarOnlyOrder(order) {
  const items = order?.items || [];
  if (!items.length) return false;
  return items.every(isBarItemForStation);
}

/** @param {'cocina'|'bar'} station */
function orderAppliesToStation(order, station) {
  const barOnly = isBarOnlyOrder(order);
  if (station === 'bar') return barOnly;
  if (station === 'cocina') return !barOnly;
  return true;
}

module.exports = { orderAppliesToStation, isBarOnlyOrder, isBarItemForStation };
