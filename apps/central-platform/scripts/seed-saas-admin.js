/**
 * Crea un administrador SaaS global en la BD central.
 * Uso: node scripts/seed-saas-admin.js admin@restofadey.pe MiClaveSegura
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDatabase, queryOne, runSql } = require('../server/database');

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const password = String(process.argv[3] || '');
  if (!email || !password) {
    console.error('Uso: node scripts/seed-saas-admin.js <email> <password>');
    process.exit(1);
  }
  await initDatabase();
  const existing = queryOne('SELECT id FROM central_users WHERE email = ?', [email]);
  const hash = bcrypt.hashSync(password, 10);
  if (existing?.id) {
    runSql(
      `UPDATE central_users SET password_hash = ?, role = 'saas_admin', is_active = 1, updated_at = datetime('now') WHERE email = ?`,
      [hash, email]
    );
    console.log('Administrador SaaS actualizado:', email);
    return;
  }
  runSql(
    `INSERT INTO central_users (id, email, username, full_name, password_hash, role, client_id)
     VALUES (?, ?, ?, ?, ?, 'saas_admin', '')`,
    [uuidv4(), email, email.split('@')[0], 'Administrador SaaS', hash]
  );
  console.log('Administrador SaaS creado:', email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
