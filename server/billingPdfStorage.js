/**
 * Expone el PDF del comprobante como URL bajo /uploads/... para que el navegador pueda abrirlo.
 * El bot Python suele devolver una ruta absoluta en disco; la copiamos al directorio estático del API.
 */

const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const BILLING_PDF_DIR = path.join(UPLOADS_ROOT, 'billing-documents');

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || '').trim());
}

function resolveLocalPath(raw) {
  const t = String(raw || '').trim();
  if (!t || isHttpUrl(t)) return '';
  if (path.isAbsolute(t)) return t;
  return path.resolve(process.cwd(), t);
}

/**
 * @param {string} docId — id del registro electronic_documents (UUID)
 * @param {string} pdfUrl — URL https, o ruta de archivo local devuelta por el bot
 * @returns {string} URL relativa para guardar en BD (/uploads/...) o URL absoluta original, o ''
 */
function exportBillingPdfToUploads(docId, pdfUrl) {
  const raw = String(pdfUrl || '').trim();
  if (!raw) return '';
  if (isHttpUrl(raw)) return raw;

  const safeId = String(docId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return '';

  const src = resolveLocalPath(raw);
  if (!src || !fs.existsSync(src)) {
    console.warn('[billing-pdf] No se encontró el archivo del bot:', raw);
    return '';
  }

  try {
    if (!fs.existsSync(BILLING_PDF_DIR)) {
      fs.mkdirSync(BILLING_PDF_DIR, { recursive: true });
    }
    const ext = (path.extname(src) || '.pdf').toLowerCase();
    const safeExt = ext === '.pdf' ? '.pdf' : '.pdf';
    const destName = `${safeId}${safeExt}`;
    const dest = path.join(BILLING_PDF_DIR, destName);
    fs.copyFileSync(src, dest);
    return `/uploads/billing-documents/${destName}`;
  } catch (e) {
    console.warn('[billing-pdf] Error al copiar a uploads:', e.message || e);
    return '';
  }
}

module.exports = {
  exportBillingPdfToUploads,
  isHttpUrl,
};
