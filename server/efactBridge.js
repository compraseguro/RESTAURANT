/**
 * Construye el JSON esperado por el bot Python (BOT DE FACTURACION) y llama a su API HTTP.
 */

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function formatIssueDateIso(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatIssueTime(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function buildEfactSaleJson({
  restaurant,
  order,
  items,
  customer,
  docType,
  series,
  correlative,
  invoiceLinesMode = 'detallado',
}) {
  const taxRate = toNumber(restaurant.tax_rate, 18);
  const ruc = String(restaurant.company_ruc || '').trim();
  const razon = String(restaurant.legal_name || '').trim();
  if (!ruc) throw new Error('Configure el RUC del emisor en Facturación electrónica');
  if (!razon) throw new Error('Configure la razón social del emisor en Facturación electrónica');

  const lineas = invoiceLinesMode === 'consumo'
    ? [
      {
        descripcion: 'VENTA POR CONSUMO',
        cantidad: '1',
        precio_unitario_sin_igv: round2(order.subtotal).toFixed(2),
        codigo_afectacion_igv: '10',
      },
    ]
    : items.map((item) => {
      const quantity = toNumber(item.quantity, 0);
      const precioSin = round2(item.unit_price);
      return {
        descripcion: item.product_name || 'Producto',
        cantidad: String(quantity),
        precio_unitario_sin_igv: precioSin.toFixed(2),
        codigo_afectacion_igv: '10',
      };
    });

  const direccionFiscal = String(restaurant.billing_emisor_direccion || '').trim()
    || String(restaurant.address || '').trim()
    || 'LIMA';

  const docNum = String(customer.customerDocNumber || '').trim();
  const tipoDoc = String(customer.customerDocType || '1').trim();

  const ubigeo = String(restaurant.billing_emisor_ubigeo || '').trim() || '150101';
  const provincia = String(restaurant.billing_emisor_provincia || '').trim() || 'LIMA';
  const departamento = String(restaurant.billing_emisor_departamento || '').trim() || 'LIMA';
  const distrito = String(restaurant.billing_emisor_distrito || '').trim() || 'LIMA';

  return {
    tipo: docType === 'factura' ? '01' : '03',
    serie: series,
    correlativo,
    fecha_emision: formatIssueDateIso(),
    hora_emision: formatIssueTime(),
    moneda: (restaurant.currency || 'PEN') === 'USD' ? 'USD' : 'PEN',
    porcentaje_igv: String(taxRate),
    observaciones: String(order.notes || '').trim() || `Pedido #${order.order_number || order.id}`,
    emisor: {
      ruc,
      razon_social: razon,
      nombre_comercial: String(restaurant.billing_nombre_comercial || restaurant.name || '').trim() || razon,
      ubigeo,
      direccion: direccionFiscal,
      provincia,
      departamento,
      distrito,
    },
    cliente: {
      tipo_doc: tipoDoc,
      numero_doc: docNum || (tipoDoc === '6' ? '' : '00000000'),
      razon_social: customer.customerName,
      direccion: customer.customerAddress || 'LIMA',
    },
    lineas,
  };
}

function mapEfactResponseToProviderResult(parsed, responseOk) {
  const initial = {
    providerStatus: 'pending',
    providerMessage: 'Comprobante generado localmente (pendiente de envío)',
    hashCode: '',
    sunatDescription: '',
    xmlUrl: '',
    cdrUrl: '',
    pdfUrl: '',
    providerResponse: parsed || {},
  };

  if (!responseOk) {
    const msg = typeof parsed?.error === 'string'
      ? parsed.error
      : (parsed?.detail || `Error HTTP en API del bot`);
    return {
      ...initial,
      providerStatus: 'error',
      providerMessage: msg,
      providerResponse: parsed || {},
    };
  }

  const sunat = parsed?.sunat;
  const sunatOk = sunat && sunat.ok === true;
  const flowFailed = parsed?.ok === false;
  const paths = parsed?.paths || {};
  const hasSignedXml = Boolean(paths.xml_firmado);
  /** Sin .pfx el bot solo genera XML/PDF y no debe considerarse éxito SUNAT. */
  const noSunatFlow = !flowFailed && parsed?.ok !== false && !hasSignedXml && sunat == null;

  let providerStatus = 'sent';
  if (sunatOk) providerStatus = 'accepted';
  else if (flowFailed || (sunat && sunat.ok === false)) providerStatus = 'error';
  else if (noSunatFlow) providerStatus = 'error';

  const noCertMsg =
    'Configure CERT_PFX_PATH y CERT_PFX_PASSWORD en el .env del bot y reinicie python api_server.py para firmar y enviar a SUNAT.';

  return {
    providerStatus,
    providerMessage: noSunatFlow
      ? noCertMsg
      : (parsed?.mensaje || sunat?.mensaje || (parsed?.ok ? 'Procesado por bot local' : 'Revisar respuesta del bot')),
    hashCode: '',
    sunatDescription: String(sunat?.mensaje || ''),
    xmlUrl: String(paths.xml_firmado || paths.xml_sin_firma || ''),
    cdrUrl: String(paths.cdr_xml || paths.cdr_zip || ''),
    pdfUrl: String(paths.pdf || ''),
    providerResponse: parsed || {},
  };
}

async function sendEfactSale(restaurant, saleJson) {
  const base = String(restaurant.billing_api_url || '').replace(/\/$/, '');
  const secret = String(restaurant.billing_api_token || '').trim();
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-EFACT-SECRET'] = secret;

  const response = await fetch(`${base}/emitir`, {
    method: 'POST',
    headers,
    body: JSON.stringify(saleJson),
  });

  const rawText = await response.text();
  let parsed = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    parsed = { raw: rawText };
  }

  return {
    response,
    parsed,
    providerResult: mapEfactResponseToProviderResult(parsed, response.ok),
  };
}

module.exports = {
  buildEfactSaleJson,
  sendEfactSale,
  mapEfactResponseToProviderResult,
};
