const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, runSql } = require('./database');
const { normalizePrinterStation, KNOWN_PRINT_AREAS } = require('./printerStation');

function getPrimaryRestaurantId() {
  const r = queryOne('SELECT id FROM restaurants ORDER BY created_at ASC LIMIT 1');
  return String(r?.id || '').trim();
}

function resolveRestaurantId(reqUser) {
  const fromToken = String(reqUser?.restaurant_id || '').trim();
  if (fromToken) return fromToken;
  return getPrimaryRestaurantId();
}

function legacyConnectionToPrinterType(p) {
  const ip = String(p?.ip_address || '').trim();
  const conn = String(p?.connection || 'browser').toLowerCase();
  const explicit = String(p?.printer_type || '').toLowerCase().trim();
  if (['lan', 'usb', 'bluetooth', 'browser'].includes(explicit)) return explicit;
  if (ip || conn === 'wifi') return 'lan';
  return 'browser';
}

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    area: row.area,
    printer_name: row.printer_name || '',
    printer_type: row.printer_type || 'browser',
    ip_address: row.ip_address || '',
    port: Number(row.port || 9100),
    paper_width: Number(row.paper_width || 80),
    auto_print: Number(row.auto_print ?? 1),
    copies: Number(row.copies || 1),
    enabled: Number(row.enabled ?? 1),
    local_printer_name: row.local_printer_name || '',
    updated_at: row.updated_at || '',
  };
}

/** Fila de `printer_settings` (sucursal_id vacío = local principal). */
function settingsRowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    sucursal_id: row.sucursal_id || '',
    area: row.area,
    printer_name: row.printer_name || '',
    printer_type: String(row.connection_type || 'browser'),
    ip_address: row.ip || '',
    port: Number(row.port || 9100),
    paper_width: Number(row.paper_width || 80),
    auto_print: Number(row.auto_print ?? 1),
    copies: Number(row.copies || 1),
    enabled: Number(row.enabled ?? 1),
    local_printer_name: row.local_printer_name || '',
    updated_at: row.updated_at || '',
  };
}

function syncPrinterSettingsMirror(restaurantId) {
  const rid = String(restaurantId || '').trim();
  if (!rid) return;
  runSql('DELETE FROM printer_settings WHERE restaurant_id = ? AND sucursal_id = ?', [rid, '']);
  const rows = queryAll('SELECT * FROM printer_routes WHERE restaurant_id = ?', [rid]);
  for (const row of rows) {
    runSql(
      `INSERT INTO printer_settings (
        id, restaurant_id, sucursal_id, area, connection_type, printer_name, ip, port,
        paper_width, copies, auto_print, enabled, local_printer_name, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        row.id,
        rid,
        '',
        row.area,
        String(row.printer_type || 'browser'),
        String(row.printer_name || ''),
        String(row.ip_address || ''),
        Number(row.port || 9100),
        Number(row.paper_width || 80),
        Number(row.copies || 1),
        Number(row.auto_print ?? 1),
        Number(row.enabled ?? 1),
        String(row.local_printer_name || ''),
      ]
    );
  }
}

/**
 * Sincroniza `printer_routes` desde el arreglo legacy `settings.impresoras`.
 * Una fila por área (última impresora del listado gana si hay varias con la misma área).
 */
function syncPrinterRoutesFromImpresoras(restaurantId, impresoras) {
  const rid = String(restaurantId || '').trim();
  if (!rid || !Array.isArray(impresoras)) return { ok: false, error: 'missing' };
  const byArea = new Map();
  for (const p of impresoras) {
    const area = normalizePrinterStation(p);
    if (!KNOWN_PRINT_AREAS.includes(area)) continue;
    byArea.set(area, p);
  }
  runSql('DELETE FROM printer_routes WHERE restaurant_id = ?', [rid]);
  for (const [area, p] of byArea) {
    const ip = String(p.ip_address || '').trim();
    const port = Math.min(65535, Math.max(1, Number(p.port || 9100) || 9100));
    const paper = [58, 80].includes(Number(p.width_mm)) ? Number(p.width_mm) : 80;
    const copies = Math.min(5, Math.max(1, Number(p.copies || 1)));
    const enabled = Number(p.active ?? 1) === 1 ? 1 : 0;
    const autoPrint = Number(p.auto_print ?? 1) === 0 ? 0 : 1;
    const printerType = legacyConnectionToPrinterType(p);
    const localName = String(p.local_printer_name || '').trim();
    runSql(
      `INSERT INTO printer_routes (
        id, restaurant_id, area, printer_name, printer_type, ip_address, port, paper_width,
        auto_print, copies, enabled, local_printer_name, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        uuidv4(),
        rid,
        area,
        String(p.name || '').trim() || area,
        printerType,
        ip,
        port,
        paper,
        autoPrint,
        copies,
        enabled,
        localName,
      ]
    );
  }
  syncPrinterSettingsMirror(rid);
  return { ok: true, count: byArea.size };
}

function listPrinterRoutes(restaurantId) {
  const rid = String(restaurantId || '').trim();
  if (!rid) return [];
  const settingsRows = queryAll(
    `SELECT * FROM printer_settings WHERE restaurant_id = ? AND sucursal_id = ? ORDER BY area ASC`,
    [rid, '']
  );
  if (settingsRows.length > 0) {
    return settingsRows.map(settingsRowToApi);
  }
  return queryAll(
    `SELECT * FROM printer_routes WHERE restaurant_id = ? ORDER BY area ASC`,
    [rid]
  ).map(rowToApi);
}

function getPrinterRoute(restaurantId, area) {
  const rid = String(restaurantId || '').trim();
  const a = String(area || '').toLowerCase().trim();
  if (!rid || !a) return null;
  const sRow = queryOne(
    `SELECT * FROM printer_settings WHERE restaurant_id = ? AND sucursal_id = ? AND lower(area) = ? AND enabled = 1`,
    [rid, '', a]
  );
  if (sRow) return settingsRowToApi(sRow);
  const row = queryOne(
    `SELECT * FROM printer_routes WHERE restaurant_id = ? AND lower(area) = ? AND enabled = 1`,
    [rid, a]
  );
  return rowToApi(row);
}

/**
 * Convierte fila de printer_routes al mismo shape que buildPrinterOut (órdenes / red).
 */
function routeToPrinterConfig(routeRow, areaFallback) {
  const area = String(routeRow?.area || areaFallback || '').toLowerCase();
  const ip = String(routeRow?.ip_address || '').trim();
  const type = String(routeRow?.printer_type || 'browser').toLowerCase();
  const connection = (ip || type === 'lan') ? 'wifi' : 'browser';
  const defaults = {
    cocina: { name: 'Impresora Cocina', area: 'Comandas' },
    bar: { name: 'Impresora Bar', area: 'Comandas Bar' },
    caja: { name: 'Impresora Caja', area: 'Comprobantes' },
    delivery: { name: 'Impresora Delivery', area: 'Delivery' },
    parrilla: { name: 'Impresora Parrilla', area: 'Parrilla' },
  }[area] || { name: routeRow?.printer_name || 'Impresora', area: '' };
  return {
    name: routeRow?.printer_name || defaults.name,
    area: defaults.area,
    station: area,
    width_mm: Number(routeRow?.paper_width || 80),
    copies: Math.min(5, Math.max(1, Number(routeRow?.copies || 1))),
    active: Number(routeRow?.enabled ?? 1),
    connection,
    ip_address: ip,
    port: Math.min(65535, Math.max(1, Number(routeRow?.port || 9100) || 9100)),
    printer_type: type,
    auto_print: Number(routeRow?.auto_print ?? 1),
    local_printer_name: String(routeRow?.local_printer_name || '').trim(),
  };
}

module.exports = {
  getPrimaryRestaurantId,
  resolveRestaurantId,
  syncPrinterRoutesFromImpresoras,
  syncPrinterSettingsMirror,
  listPrinterRoutes,
  getPrinterRoute,
  routeToPrinterConfig,
  legacyConnectionToPrinterType,
};
