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

module.exports = {
  readClientIdentity,
  isCentralSyncConfigured,
};
