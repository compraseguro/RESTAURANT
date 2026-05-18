const { queryOne, runSql } = require('../database');

function upsertClient({
  clientId,
  restaurantId,
  webServiceId,
  licenseKey,
  restaurantName,
  sourceWebServiceUrl,
  plan,
}) {
  const existing = queryOne('SELECT client_id FROM clients WHERE client_id = ?', [clientId]);
  if (existing?.client_id) {
    runSql(
      `UPDATE clients SET
         restaurant_id = ?,
         web_service_id = ?,
         license_key = COALESCE(?, license_key),
         restaurant_name = COALESCE(?, restaurant_name),
         plan = COALESCE(?, plan),
         source_web_service_url = COALESCE(?, source_web_service_url),
         last_sync_at = datetime('now'),
         updated_at = datetime('now')
       WHERE client_id = ?`,
      [
        restaurantId || clientId,
        webServiceId,
        licenseKey || null,
        restaurantName || null,
        plan || null,
        sourceWebServiceUrl || null,
        clientId,
      ]
    );
    return;
  }
  runSql(
    `INSERT INTO clients (
       client_id, restaurant_id, web_service_id, license_key,
       restaurant_name, plan, source_web_service_url, last_sync_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      clientId,
      restaurantId || clientId,
      webServiceId,
      licenseKey || '',
      restaurantName || '',
      plan || 'profesional',
      sourceWebServiceUrl || '',
    ]
  );
}

module.exports = { upsertClient };
