/**
 * PDF local (Node) cuando el bot SUNAT no entrega archivo o está pendiente.
 * Notas de venta: mismo criterio visual que precuenta (logo, tabla, totales); sin leyenda SUNAT.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { queryOne, queryAll } = require('./database');

const { getUploadsRoot } = require('./uploadsPath');
const BILLING_DIR = path.join(getUploadsRoot(), 'billing-documents');

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0.00';
  return x.toFixed(2);
}

function billLineKey(it) {
  const pid = String(it.product_id || '').trim();
  const variant = String(it.variant_name || '').trim().toLowerCase();
  const notes = String(it.notes || '').trim();
  const unit = Number(it.unit_price ?? 0);
  return `${pid}|${variant}|${notes}|${unit.toFixed(4)}`;
}

function billLineDisplayName(it) {
  const base = String(it.product_name || '—').trim() || '—';
  const v = String(it.variant_name || '').trim();
  return v ? `${base} (${v})` : base;
}

/** Misma lógica que `groupItemsByProductNameForBill` en el cliente (precuenta / nota). */
function groupItemsForPrecuentaPdf(items) {
  const m = new Map();
  for (const it of items || []) {
    const k = billLineKey(it);
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unit_price ?? 0);
    const sub = Number(it.subtotal != null ? it.subtotal : unit * qty);
    if (!m.has(k)) {
      m.set(k, { name: billLineDisplayName(it), qty: 0, subtotal: 0 });
    }
    const a = m.get(k);
    a.qty += qty;
    a.subtotal += sub;
  }
  return [...m.values()].map((r) => ({
    name: r.name,
    qty: r.qty,
    subtotal: r.subtotal,
    unitPrice: r.qty > 0 ? r.subtotal / r.qty : 0,
  }));
}

/** Logo guardado bajo `uploads/` (misma raíz que sirve Express). */
function resolveLogoFsPath(logoUrl) {
  const s = String(logoUrl || '').trim();
  if (!s || /^https?:\/\//i.test(s)) return '';
  let rel = s.replace(/^\/+/, '');
  if (rel.startsWith('uploads/')) rel = rel.slice('uploads/'.length);
  const full = path.join(getUploadsRoot(), rel);
  return fs.existsSync(full) ? full : '';
}

function formatPeDateTimeLine(d) {
  try {
    return d.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return d.toISOString();
  }
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
  customerAddress,
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
    const label =
      docType === 'factura'
        ? 'FACTURA'
        : docType === 'nota_venta'
          ? 'NOTA DE VENTA'
          : 'BOLETA DE VENTA';

    const contentLeft = doc.page.margins.left;
    const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    if (docType === 'nota_venta') {
      const logoPath = resolveLogoFsPath(restaurant?.logo);
      if (logoPath) {
        try {
          const sz = 70;
          const ix = contentLeft + (contentW - sz) / 2;
          doc.image(logoPath, ix, doc.y, { width: sz, height: sz });
          doc.y += sz + 10;
        } catch (e) {
          console.warn('[billing-local-pdf] logo nota:', e.message || e);
        }
      }

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#000').text(rname, contentLeft, doc.y, {
        width: contentW,
        align: 'center',
      });
      doc.moveDown(0.35);
      if (ruc) {
        doc.font('Helvetica').fontSize(10).text(`RUC ${ruc}`, { width: contentW, align: 'center' });
        doc.moveDown(0.35);
      }
      doc.font('Helvetica-Bold').fontSize(12).text(label, { width: contentW, align: 'center' });
      doc.font('Helvetica').fontSize(11).text(String(fullNumber || ''), { width: contentW, align: 'center' });
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(formatPeDateTimeLine(new Date()), {
        width: contentW,
        align: 'center',
      });
      doc.fillColor('#000');
      doc.moveDown(0.6);

      const tn = String(order?.table_number || '').trim();
      if (tn) {
        doc.fontSize(10).text(`Mesa: ${tn}`, { width: contentW, align: 'center' });
        doc.moveDown(0.35);
      }

      const custRows = [];
      if (String(customerName || '').trim()) custRows.push(['Cliente:', String(customerName).slice(0, 120)]);
      const docLine = [customerDocType, customerDocNumber].filter(Boolean).join(' ');
      if (docLine) custRows.push(['Documento:', docLine]);
      if (String(customerPhone || '').trim()) custRows.push(['Teléfono:', String(customerPhone).slice(0, 80)]);
      if (String(customerAddress || '').trim()) custRows.push(['Dirección:', String(customerAddress).slice(0, 120)]);

      if (custRows.length) {
        doc.moveDown(0.25);
        custRows.forEach(([lab, val]) => {
          doc.fontSize(10);
          doc.font('Helvetica-Bold').text(lab, { continued: true });
          doc.font('Helvetica').text(` ${val}`);
          doc.moveDown(0.18);
        });
      }

      doc.moveDown(0.3);
      doc.save();
      doc.strokeColor('#cbd5e1')
        .lineWidth(0.5)
        .dash(4, { space: 3 })
        .moveTo(contentLeft, doc.y)
        .lineTo(contentLeft + contentW, doc.y)
        .stroke()
        .undash();
      doc.restore();
      doc.moveDown(0.5);

      const grouped = groupItemsForPrecuentaPdf(items);
      const wDesc = contentW * 0.52;
      const wUnit = contentW * 0.22;
      const wImp = contentW * 0.24;

      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Descripción', contentLeft, headerY, { width: wDesc });
      doc.text('P. unit.', contentLeft + wDesc, headerY, { width: wUnit, align: 'right' });
      doc.text('Importe', contentLeft + wDesc + wUnit, headerY, { width: wImp, align: 'right' });
      doc.moveDown(0.35);
      doc.save()
        .strokeColor('#64748b')
        .lineWidth(0.8)
        .moveTo(contentLeft, doc.y)
        .lineTo(contentLeft + contentW, doc.y)
        .stroke();
      doc.restore();
      doc.moveDown(0.35);

      doc.font('Helvetica').fontSize(9);
      grouped.forEach((row) => {
        const lineY = doc.y;
        const descText = `${row.qty}x ${String(row.name || '—').slice(0, 52)}`;
        const hDesc = doc.heightOfString(descText, { width: wDesc });
        doc.text(descText, contentLeft, lineY, { width: wDesc });
        doc.text(`S/ ${money(row.unitPrice)}`, contentLeft + wDesc, lineY, { width: wUnit, align: 'right' });
        doc.font('Helvetica-Bold').text(`S/ ${money(row.subtotal)}`, contentLeft + wDesc + wUnit, lineY, {
          width: wImp,
          align: 'right',
        });
        doc.font('Helvetica');
        doc.y = lineY + Math.max(hDesc, 14);
      });

      doc.moveDown(0.25);
      doc.save();
      doc.strokeColor('#cbd5e1')
        .lineWidth(0.5)
        .dash(4, { space: 3 })
        .moveTo(contentLeft, doc.y)
        .lineTo(contentLeft + contentW, doc.y)
        .stroke()
        .undash();
      doc.restore();
      doc.moveDown(0.45);

      const disc = Number(order?.discount || 0);
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      doc.text(`Subtotal: S/ ${money(order?.subtotal)}`);
      if (disc > 1e-6) {
        doc.text(`Descuento: S/ ${money(disc)}`);
      }
      doc.text(`IGV: S/ ${money(order?.tax)}`);
      const cur = String(order?.currency || restaurant?.currency || 'PEN');
      doc.font('Helvetica-Bold').fontSize(12).text(`Total (${cur}): S/ ${money(order?.total)}`);

      doc.end();
      return;
    }

    /* Boleta / factura fallback: leyenda SUNAT solo si aplica envío electrónico */
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
    const docLineLegacy = [customerDocType, customerDocNumber].filter(Boolean).join(' ');
    if (docLineLegacy) doc.text(`Doc.: ${docLineLegacy}`);
    if (customerPhone) doc.text(`Cel.: ${customerPhone}`);
    if (customerAddress) doc.text(`Dir.: ${String(customerAddress).slice(0, 120)}`);
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
      customerAddress: docRow.customer_address,
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
