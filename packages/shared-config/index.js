/**
 * Identidad del web service cliente (aislado por restaurante).
 * Cada despliegue POS define estas variables; la plataforma central las indexa.
 */
function readClientIdentity(env = process.env) {
  const clientId = String(env.CLIENT_ID || '').trim();
  return {
    clientId,
    restaurantId: String(env.RESTAURANT_ID || env.CLIENT_ID || '').trim(),
    webServiceId: String(env.WEBSERVICE_ID || '').trim(),
    licenseKey: String(env.LICENSE_KEY || '').trim(),
    centralPlatformUrl: String(
      env.CENTRAL_API_URL
      || env.CENTRAL_PLATFORM_URL
      || env.NEXT_PUBLIC_PLATFORM_URL
      || 'https://restofadey.pe',
    ).replace(/\/$/, ''),
    apiSecretKey: String(env.API_SECRET_KEY || '').trim(),
    publicApiUrl: String(env.NEXT_PUBLIC_API_URL || env.PUBLIC_API_BASE_URL || '').replace(/\/$/, ''),
  };
}

/** Vinculación mínima SaaS: comprobantes + licencia (3 variables). */
function isCentralSyncConfigured(identity = readClientIdentity()) {
  return Boolean(
    identity.clientId
    && identity.apiSecretKey
    && identity.centralPlatformUrl,
  );
}

/** Sync extendido (login, planes, eventos): solo si CENTRAL_SYNC_EXTENDED=1 y credenciales completas. */
function isExtendedCentralSyncConfigured(identity = readClientIdentity()) {
  if (String(process.env.CENTRAL_SYNC_EXTENDED || '').trim() !== '1') return false;
  return Boolean(
    isCentralSyncConfigured(identity)
    && identity.webServiceId
    && identity.licenseKey,
  );
}

/** Qué variables faltan para activar sync (diagnóstico en panel / logs). */
function getCentralSyncConfigDiagnostics(identity = readClientIdentity()) {
  const missing = [];
  if (!identity.clientId) missing.push('CLIENT_ID');
  if (!identity.apiSecretKey) missing.push('API_SECRET_KEY');
  if (!identity.centralPlatformUrl) {
    missing.push('CENTRAL_API_URL, CENTRAL_PLATFORM_URL o NEXT_PUBLIC_PLATFORM_URL');
  }
  const extendedMissing = [];
  if (!identity.webServiceId) extendedMissing.push('WEBSERVICE_ID');
  if (!identity.licenseKey) extendedMissing.push('LICENSE_KEY');
  return {
    configured: missing.length === 0,
    extendedConfigured: isExtendedCentralSyncConfigured(identity),
    missing,
    extendedMissing,
    centralPlatformUrl: identity.centralPlatformUrl || '',
    clientId: identity.clientId || '',
    hasPublicApiUrl: Boolean(identity.publicApiUrl),
  };
}

module.exports = {
  readClientIdentity,
  isCentralSyncConfigured,
  isExtendedCentralSyncConfigured,
  getCentralSyncConfigDiagnostics,
};
