const { initDatabase, runSql } = require('../server/database');

async function main() {
  await initDatabase();
  runSql('DELETE FROM inventory_logs');
  runSql('DELETE FROM product_variants');
  runSql('DELETE FROM products');
  runSql('DELETE FROM categories');
  console.log('Catalogo demo reiniciado correctamente.');
}

main().catch((err) => {
  console.error('No se pudo resetear el catalogo demo:', err.message);
  process.exit(1);
});
