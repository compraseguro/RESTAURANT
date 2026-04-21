/**
 * Envío opcional del PDF del comprobante por WhatsApp usando un puente en tu laptop
 * (whatsapp-bridge). El servidor hace POST al puente; el puente usa whatsapp-web.js.
 *
 * Variables en el servidor API (Render o local):
 *   WHATSAPP_BRIDGE_URL   — ej. http://127.0.0.1:9876 o https://xxx.ngrok-free.app
 *   WHATSAPP_BRIDGE_SECRET — mismo valor que en el puente (cabecera X-Bridge-Secret)
 *   PUBLIC_API_BASE_URL    — URL pública del API sin /api (para pdf_url relativos /uploads/…)
 */

function normalizeDigitsPhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 9 && d.startsWith('9')) return `51${d}`;
  if (d.length === 11 && d.startsWith('51')) return d;
  if (d.length === 8 && /^[1-9]/.test(d)) return `51${d}`;
  if (d.length === 10 && d.startsWith('51')) return d;
  if (d.length === 12 && d.startsWith('51')) return d;
  return d;
}

function resolvePublicPdfUrl(pdfUrl) {
  const u = String(pdfUrl ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) {
    const base = String(process.env.PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
    if (!base) return '';
    return `${base}${u.startsWith('/') ? u : `/${u}`}`;
  }
  return '';
}

function shouldAttemptSend(doc) {
  const st = String(doc?.provider_status || '').toLowerCase();
  if (st === 'error') return false;
  const pdf = resolvePublicPdfUrl(doc?.pdf_url);
  if (!pdf) return false;
  const phone = normalizeDigitsPhone(doc?.customer_phone);
  if (!phone || phone.length < 11) return false;
  return true;
}

/**
 * Dispara el envío al puente (no lanza al caller; errores en consola).
 * @param {object} doc — fila electronic_documents
 * @param {object} restaurant — fila restaurants
 */
async function requestWhatsappPdfSend(doc, restaurant) {
  const bridge = String(process.env.WHATSAPP_BRIDGE_URL || '').trim().replace(/\/$/, '');
  const secret = String(process.env.WHATSAPP_BRIDGE_SECRET || '').trim();
  if (!bridge || !secret) return;
  if (!shouldAttemptSend(doc)) return;

  const phone = normalizeDigitsPhone(doc.customer_phone);
  const pdfUrl = resolvePublicPdfUrl(doc.pdf_url);
  const name = String(restaurant?.name || 'Restaurante').trim() || 'Restaurante';
  const caption = `Comprobante ${String(doc.full_number || '').trim() || doc.id} — ${name}`.slice(0, 1024);
  const safeName = `${String(doc.full_number || 'comprobante').replace(/[^\w.-]+/g, '_')}.pdf`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${bridge}/send-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': secret,
      },
      body: JSON.stringify({
        phone,
        pdfUrl,
        caption,
        filename: safeName,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[whatsapp-bridge]', res.status, txt.slice(0, 500));
    }
  } catch (e) {
    console.warn('[whatsapp-bridge]', e.message || e);
  } finally {
    clearTimeout(t);
  }
}

function scheduleWhatsappPdfSend(doc, restaurant) {
  if (!doc || !restaurant) return;
  requestWhatsappPdfSend(doc, restaurant).catch(() => {});
}

module.exports = {
  requestWhatsappPdfSend,
  scheduleWhatsappPdfSend,
  normalizeDigitsPhone,
  resolvePublicPdfUrl,
  shouldAttemptSend,
};
