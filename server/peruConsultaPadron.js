/**
 * Consulta DNI / RUC vía API de terceros (apis.net.pe / Decolecta).
 * Los datos provienen de fuentes alineadas al padrón SUNAT/RENIEC; requiere token en PERU_CONSULTAS_TOKEN.
 */

const DECOLECTA_BASE = 'https://api.decolecta.com/v1';

function getToken() {
  return String(process.env.PERU_CONSULTAS_TOKEN || process.env.APIS_NET_PE_TOKEN || '').trim();
}

function unwrapPayload(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.data && typeof json.data === 'object') return json.data;
  if (json.resultado && typeof json.resultado === 'object') return json.resultado;
  if (json.result && typeof json.result === 'object') return json.result;
  return json;
}

function pickRazonSocial(u) {
  const raw =
    u.razon_social ||
    u.razonSocial ||
    u.nombre_o_razon_social ||
    u.nombreORazonSocial ||
    u.nombre_completo ||
    u.nombreCompleto ||
    u.nombre ||
    '';
  return String(raw || '').trim();
}

function pickDireccion(u) {
  const raw = u.direccion || u.direccion_completa || u.direccionCompleta || u.domicilio_fiscal || u.domicilioFiscal || '';
  return String(raw || '').trim();
}

function pickNombreDni(u) {
  const full =
    u.nombreCompleto ||
    u.nombre_completo ||
    u.nombres_apellidos ||
    u.nombresApellidos ||
    '';
  if (String(full || '').trim()) return String(full).trim();
  const n = u.nombres || u.nombre;
  const ap = u.apellidoPaterno || u.apellido_paterno;
  const am = u.apellidoMaterno || u.apellido_materno;
  const parts = [n, ap, am].filter((x) => x && String(x).trim());
  return parts.join(' ').trim();
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || data.mensaje)) ||
      `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`;
    const err = new Error(typeof msg === 'string' ? msg : 'Error en consulta');
    err.status = res.status;
    throw err;
  }
  if (data && data.success === false && (data.message || data.mensaje)) {
    const err = new Error(String(data.message || data.mensaje));
    err.code = 'API_ERROR';
    throw err;
  }
  return data;
}

/**
 * @param {'1'|'6'} docType — catálogo SUNAT documento cliente (1=DNI, 6=RUC)
 * @param {string} numero — solo dígitos
 * @returns {Promise<{ nombre: string, direccion: string, doc_type: string, numero: string }>}
 */
async function consultarPadronPeru(docType, numero) {
  const token = getToken();
  if (!token) {
    const err = new Error(
      'Consulta DNI/RUC no configurada. Defina PERU_CONSULTAS_TOKEN en el servidor (token de apis.net.pe / Decolecta).'
    );
    err.code = 'NO_TOKEN';
    throw err;
  }

  const n = String(numero || '').replace(/\D/g, '');

  if (docType === '6') {
    if (!/^\d{11}$/.test(n)) {
      const err = new Error('RUC debe tener 11 dígitos');
      err.code = 'BAD_INPUT';
      throw err;
    }
    const url = `${DECOLECTA_BASE}/sunat/ruc?numero=${encodeURIComponent(n)}`;
    const json = await fetchJson(url, token);
    const u = unwrapPayload(json) || {};
    const nombre = pickRazonSocial(u);
    if (!nombre) {
      const err = new Error('Respuesta de consulta RUC sin razón social');
      err.code = 'EMPTY';
      throw err;
    }
    return { nombre, direccion: pickDireccion(u), doc_type: '6', numero: n };
  }

  if (docType === '1') {
    if (!/^\d{8}$/.test(n)) {
      const err = new Error('DNI debe tener 8 dígitos');
      err.code = 'BAD_INPUT';
      throw err;
    }
    const url = `${DECOLECTA_BASE}/reniec/dni?numero=${encodeURIComponent(n)}`;
    const json = await fetchJson(url, token);
    const u = unwrapPayload(json) || {};
    const nombre = pickNombreDni(u);
    if (!nombre) {
      const err = new Error('Respuesta de consulta DNI sin nombre');
      err.code = 'EMPTY';
      throw err;
    }
    return { nombre, direccion: pickDireccion(u), doc_type: '1', numero: n };
  }

  const err = new Error('Solo se puede consultar DNI u RUC');
  err.code = 'BAD_INPUT';
  throw err;
}

module.exports = { consultarPadronPeru, getToken };
