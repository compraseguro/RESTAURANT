const path = require('path');

/**
 * Raíz del directorio servido en `/uploads` (logos, cartas, certificados, PDFs).
 * En la nube con disco persistente: use el mismo volumen que la base (p. ej. DB_PATH=/data/restaurant.db → /data/uploads).
 * Opcional: variable UPLOADS_DIR para fijar la ruta explícitamente.
 */
function getUploadsRoot() {
  const explicit = String(process.env.UPLOADS_DIR || '').trim();
  if (explicit) return path.resolve(explicit);

  const dbPath = String(process.env.DB_PATH || '').trim();
  if (dbPath) {
    const absDb = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
    return path.join(path.dirname(absDb), 'uploads');
  }
  return path.join(__dirname, '..', 'uploads');
}

module.exports = { getUploadsRoot };
