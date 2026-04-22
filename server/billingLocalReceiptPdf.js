/**
 * PDF local (Node) cuando el bot SUNAT no entrega archivo o está pendiente.
 * Sirve para descargar/enviar por WhatsApp; no sustituye constancia SUNAT aceptada.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { queryOne, queryAll } = require('./database');

const BILLING_DIR = path.join(__dirname, '..', 'uploads', 'billing-documents');

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0.00';
  return x.toFixed(2);
}

/**
 * @returns {Promise<string>} URL relativa `/uploads/billing-documents/...` o ''
 */
function saveLocalFallbackReceiptPdf(docId, {
  restaurant,
  fullNumber,
  docType,
  order,
  items,
  customerName,
  customerDocType,
  customerDocNumber,
  customerPhone,
}) {
  if (!fs.existsSync(BILLING_DIR)) fs.mkdirSync(BILLING_DIR, { recursive: true });
  const safeId = String(docId || '').replace(/[^a-f0-9-]/gi, '');
  if (!safeId) return Promise.resolve('');
  const dest = path.join(BILLING_DIR, `${safeId}-local.pdf`);
  const pub = `/uploads/billing-documents/${safeId}-local.pdf`;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: fullNumber || 'Comprobante' } });
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      try {
        fs.writeFileSync(dest, Buffer.concat(chunks));
        console.info('[billing-local-pdf] Generado PDF provisional:', pub);
        resolve(pub);
      } catch (e) {
        reject(e);
      }
    });
    doc.on('error', reject);

    const rname = String(restaurant?.name || 'Restaurante').trim() || 'Restaurante';
    const ruc = String(restaurant?.company_ruc || '').trim();
    const label = docType === 'factura' ? 'FACTURA' : 'BOLETA DE VENTA';

    doc.fontSize(16).text(rname, { align: 'center' });
    if (ruc) doc.fontSize(10).text(`RUC ${ruc}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(label, { align: 'center' });
    doc.fontSize(11).text(String(fullNumber || ''), { align: 'center' });
    doc.moveDown();

    doc.fontSize(9).fillColor('#555').text(
      'Documento informativo generado por el sistema. Si el estado SUNAT sigue pendiente o con error, '
      + 'este PDF no reemplaza el comprobante electrónico oficial.',
      { align: 'left' },
    );
    doc.fillColor('#000');
    doc.moveDown();

    doc.fontSize(10).text(`Cliente: ${String(customerName || '—').slice(0, 120)}`);
    const docLine = [customerDocType, customerDocNumber].filter(Boolean).join(' ');
    if (docLine) doc.text(`Doc.: ${docLine}`);
    if (customerPhone) doc.text(`Cel.: ${customerPhone}`);
    doc.moveDown(0.5);

    doc.fontSize(10).text('Detalle', { underline: true });
    doc.moveDown(0.25);
    (items || []).forEach((it) => {
      const name = String(it.product_name || 'Ítem').slice(0, 60);
      const qty = Number(it.quantity) || 0;
      const sub = money(it.subtotal);
      doc.fontSize(9).text(`${name}  x${qty}  S/ ${sub}`);
    });
    doc.moveDown();

    const cur = String(order?.currency || restaurant?.currency || 'PEN');
    doc.fontSize(10).text(`Subtotal: S/ ${money(order?.subtotal)}`);
    doc.text(`IGV: S/ ${money(order?.tax)}`);
    doc.fontSize(11).text(`Total (${cur}): S/ ${money(order?.total)}`, { continued: false });

    doc.end();
  });
}

/**
 * Si el comprobante no tiene pdf_url, genera el PDF local desde la fila en BD.
 */
async function ensureLocalFallbackPdfForDocumentRow(docRow, restaurant) {
  const id = String(docRow?.id || '').trim();
  if (!id || String(docRow.pdf_url || '').trim()) return '';
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [docRow.order_id]);
  if (!order) return '';
  const items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [docRow.order_id]);
  try {
    return await saveLocalFallbackReceiptPdf(id, {
      restaurant,
      fullNumber: docRow.full_number,
      docType: docRow.doc_type,
      order,
      items,
      customerName: docRow.customer_name,
      customerDocType: docRow.customer_doc_type,
      customerDocNumber: docRow.customer_doc_number,
      customerPhone: docRow.customer_phone,
    });
  } catch (e) {
    console.warn('[billing-local-pdf]', e.message || e);
    return '';
  }
}

module.exports = {
  saveLocalFallbackReceiptPdf,
  ensureLocalFallbackPdfForDocumentRow,
};
