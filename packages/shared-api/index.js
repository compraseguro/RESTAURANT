const { readClientIdentity, isCentralSyncConfigured } = require('@restofadey/shared-config');
const { SYNC_EVENT_TYPES } = require('@restofadey/shared-types');

/**
 * Cliente de sincronización hacia la plataforma central.
 * Fire-and-forget: no bloquea el POS si la central está caída.
 */
function createCentralSyncClient(options = {}) {
  const identity = options.identity || readClientIdentity(options.env);
  const fetchImpl = options.fetch || global.fetch;
  const log = options.log || console;

  async function getJson(path, extraHeaders = {}) {
    if (!isCentralSyncConfigured(identity)) {
      return { skipped: true, reason: 'central_not_configured' };
    }
    const url = `${identity.centralPlatformUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = {
      Authorization: `Bearer ${identity.apiSecretKey}`,
      'X-Client-Id': identity.clientId,
      'X-WebService-Id': identity.webServiceId,
      'X-License-Key': identity.licenseKey,
      ...extraHeaders,
    };
    try {
      const res = await fetchImpl(url, { method: 'GET', headers });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        data = { raw: text };
      }
      if (!res.ok) {
        log.warn('[central-sync] HTTP', res.status, path, data?.error || text?.slice(0, 200));
        return { ok: false, status: res.status, data };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      log.warn('[central-sync] error', path, err.message || err);
      return { ok: false, error: err.message || String(err) };
    }
  }

  async function postJson(path, body, extraHeaders = {}) {
    if (!isCentralSyncConfigured(identity)) {
      return { skipped: true, reason: 'central_not_configured' };
    }
    const url = `${identity.centralPlatformUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${identity.apiSecretKey}`,
      'X-Client-Id': identity.clientId,
      'X-WebService-Id': identity.webServiceId,
      'X-License-Key': identity.licenseKey,
      ...extraHeaders,
    };
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        data = { raw: text };
      }
      if (!res.ok) {
        log.warn('[central-sync] HTTP', res.status, path, data?.error || text?.slice(0, 200));
        return { ok: false, status: res.status, data };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      log.warn('[central-sync] error', path, err.message || err);
      return { ok: false, error: err.message || String(err) };
    }
  }

  function basePayload() {
    return {
      clientId: identity.clientId,
      restaurantId: identity.restaurantId || identity.clientId,
      webServiceId: identity.webServiceId,
      licenseKey: identity.licenseKey,
      sourceWebServiceUrl: identity.publicApiUrl || null,
      syncedAt: new Date().toISOString(),
    };
  }

  return {
    identity,
    isConfigured: () => isCentralSyncConfigured(identity),
    async syncEvent(eventType, payload) {
      return postJson('/api/sync/events', {
        ...basePayload(),
        eventType,
        payload,
      });
    },
    async syncPayment(payment) {
      return postJson('/api/payments', {
        ...basePayload(),
        ...payment,
      });
    },
    async fetchPaymentStatus({ referencia } = {}) {
      const qs = new URLSearchParams({ clientId: identity.clientId });
      if (referencia) qs.set('referencia', String(referencia));
      return getJson(`/api/payments/status?${qs.toString()}`);
    },
    async syncUser(user) {
      return postJson('/api/sync/users', {
        ...basePayload(),
        user,
      });
    },
    SYNC_EVENT_TYPES,
  };
}

module.exports = {
  createCentralSyncClient,
};
