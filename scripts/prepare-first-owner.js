const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { initDatabase, runSql, queryOne } = require('../server/database');

function parseArgs(argv) {
  const out = {};
  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, ...rest] = arg.slice(2).split('=');
    out[key] = rest.join('=');
  });
  return out;
}

function clearUploads() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) return;
  const entries = fs.readdirSync(uploadsDir);
  entries.forEach((file) => {
    const target = path.join(uploadsDir, file);
    try {
      if (fs.statSync(target).isFile()) fs.unlinkSync(target);
    } catch (_) {
      // noop
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ownerUsername = String(args.username || '').trim();
  const ownerPassword = String(args.password || '').trim();
  const ownerEmail = String(args.email || '').trim();
  const ownerName = String(args.name || '').trim();

  await initDatabase();

  // Operational data purge.
  const purgeSql = [
    'DELETE FROM delivery_assignments',
    'DELETE FROM order_items',
    'DELETE FROM electronic_documents',
    'DELETE FROM orders',
    'DELETE FROM cash_notes',
    'DELETE FROM cash_movements',
    'DELETE FROM cash_registers',
    'DELETE FROM inventory_logs',
    'DELETE FROM inventory_warehouse_stocks',
    'DELETE FROM purchase_order_items',
    'DELETE FROM purchase_orders',
    'DELETE FROM suppliers',
    'DELETE FROM customer_credits',
    'DELETE FROM credit_payments',
    'DELETE FROM reservations',
    'DELETE FROM customers',
    'DELETE FROM discounts_catalog',
    'DELETE FROM offers_catalog',
    'DELETE FROM combo_items',
    'DELETE FROM combos',
    'DELETE FROM modifier_options',
    'DELETE FROM modifiers',
    'DELETE FROM product_variants',
    'DELETE FROM products',
    'DELETE FROM categories',
    'DELETE FROM user_permissions',
    'DELETE FROM user_work_sessions',
    'DELETE FROM audit_logs',
    'DELETE FROM app_settings_history',
    'DELETE FROM users',
    'DELETE FROM tables',
    'DELETE FROM warehouse_locations',
  ];
  purgeSql.forEach((sql) => runSql(sql));

  // Base restaurant profile reset.
  const defaultSchedule = {
    lunes: { open: '11:00', close: '23:00', enabled: true },
    martes: { open: '11:00', close: '23:00', enabled: true },
    miercoles: { open: '11:00', close: '23:00', enabled: true },
    jueves: { open: '11:00', close: '23:00', enabled: true },
    viernes: { open: '11:00', close: '23:00', enabled: true },
    sabado: { open: '11:00', close: '23:00', enabled: true },
    domingo: { open: '11:00', close: '23:00', enabled: true },
  };
  runSql(
    `UPDATE restaurants
     SET name = 'Mi Restaurante',
         address = '',
         phone = '',
         email = '',
         logo = '',
         company_ruc = '',
         legal_name = '',
         billing_enabled = 0,
         schedule = ?,
         updated_at = datetime('now')
     WHERE id = (SELECT id FROM restaurants LIMIT 1)`,
    [JSON.stringify(defaultSchedule)]
  );

  // Reset counters and master notifications.
  runSql('UPDATE order_sequence SET current_number = 0 WHERE id = 1');
  runSql(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('master_admin_notifications', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [JSON.stringify([])]
  );
  runSql(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('bootstrap_mode', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [JSON.stringify({ mode: 'sale_ready' })]
  );

  // Optionally create first owner admin user.
  if (ownerUsername && ownerPassword && ownerEmail && ownerName) {
    const restaurant = queryOne('SELECT id FROM restaurants LIMIT 1');
    runSql(
      `INSERT INTO users (id, username, email, password_hash, full_name, role, restaurant_id, is_active, phone, avatar, created_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 'admin', ?, 1, '', '', datetime('now'))`,
      [ownerUsername, ownerEmail, bcrypt.hashSync(ownerPassword, 10), ownerName, restaurant?.id || null]
    );
    console.log(`Usuario comprador creado: ${ownerUsername}`);
  } else {
    console.log('Sin usuario comprador inicial (puedes crearlo desde Administrador Maestro).');
  }

  clearUploads();

  console.log('Sistema preparado para primer dueño: base limpia y funciones intactas.');
  console.log('Acceso Administrador Maestro: usuario configurado en el sistema (master_admin_auth).');
}

main().catch((err) => {
  console.error('No se pudo preparar el sistema para primer dueño:', err.message);
  process.exit(1);
});
