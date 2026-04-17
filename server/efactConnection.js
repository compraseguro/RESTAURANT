/**
 * Conexión al bot Python (e-fact): URL y secreto pueden fijarse por entorno
 * (mismo contenedor Docker o .env junto al API Node) sin depender del valor guardado en el panel.
 *
 * EFACT_API_URL / INTERNAL_EFACT_API_URL — base sin barra final, p. ej. http://127.0.0.1:8765
 * EFACT_HTTP_SECRET / INTERNAL_EFACT_HTTP_SECRET — mismo valor que en el .env del bot (X-EFACT-SECRET)
 */

function envEfactApiUrl() {
  return String(process.env.EFACT_API_URL || process.env.INTERNAL_EFACT_API_URL || '').trim();
}

function envEfactHttpSecret() {
  return String(process.env.EFACT_HTTP_SECRET || process.env.INTERNAL_EFACT_HTTP_SECRET || '').trim();
}

function effectiveEfactApiUrl(restaurant) {
  const fromEnv = envEfactApiUrl();
  if (fromEnv) return fromEnv;
  return String(restaurant?.billing_api_url || '').trim();
}

function effectiveEfactHttpSecret(restaurant) {
  const fromEnv = envEfactHttpSecret();
  if (fromEnv) return fromEnv;
  return String(restaurant?.billing_api_token || '').trim();
}

function billingEfactUrlFromEnv() {
  return Boolean(envEfactApiUrl());
}

function billingEfactSecretFromEnv() {
  return Boolean(envEfactHttpSecret());
}

module.exports = {
  effectiveEfactApiUrl,
  effectiveEfactHttpSecret,
  billingEfactUrlFromEnv,
  billingEfactSecretFromEnv,
};
