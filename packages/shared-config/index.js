/**
 * Identidad del web service cliente (aislado por restaurante).
 * Cada despliegue POS define estas variables; la plataforma central las indexa.
 */
function readClientIdentity(env = process.env) {
  return {
    clientId: String(env.CLIENT_ID || '').trim(),
    restaurantId: String(env.RESTAURANT_ID || env.CLIENT_ID || '').trim(),
    webServiceId: String(env.WEBSERVICE_ID || '').trim(),
    licenseKey: String(env.LICENSE_KEY || '').trim(),
    centralPlatformUrl: String(
      env.NEXT_PUBLIC_PLATFORM_URL || env.CENTRAL_PLATFORM_URL || 'https://restofadey.pe',
    ).replace(/\/$/, ''),
    apiSecretKey: String(env.API_SECRET_KEY || '').trim(),
    publicApiUrl: String(env.NEXT_PUBLIC_API_URL || env.PUBLIC_API_BASE_URL || '').replace(/\/$/, ''),
  };
}

function isCentralSyncConfigured(identity = readClientIdentity()) {
  return Boolean(
    identity.clientId
    && identity.webServiceId
    && identity.licenseKey
    && identity.apiSecretKey
    && identity.centralPlatformUrl
  );
}

/** Qué variables faltan para activar sync (diagnóstico en panel / logs). */
function getCentralSyncConfigDiagnostics(identity = readClientIdentity()) {
  const missing = [];
  if (!identity.clientId) missing.push('CLIENT_ID');
  if (!identity.webServiceId) missing.push('WEBSERVICE_ID');
  if (!identity.licenseKey) missing.push('LICENSE_KEY');
  if (!identity.apiSecretKey) missing.push('API_SECRET_KEY');
  if (!identity.centralPlatformUrl) missing.push('NEXT_PUBLIC_PLATFORM_URL o CENTRAL_PLATFORM_URL');
  return {
    configured: missing.length === 0,
    missing,
    centralPlatformUrl: identity.centralPlatformUrl || '',
    clientId: identity.clientId || '',
    hasPublicApiUrl: Boolean(identity.publicApiUrl),
  };
}

module.exports = {
  readClientIdentity,
  isCentralSyncConfigured,
  getCentralSyncConfigDiagnostics,
};
