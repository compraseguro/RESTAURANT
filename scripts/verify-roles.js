const base = process.env.SMOKE_BASE_URL || 'http://localhost:3001/api';

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  return { status: res.status, data };
}

async function login(username, password) {
  const r = await request('/auth/login', { method: 'POST', body: { username, password } });
  return r.status === 200 ? r.data?.token : null;
}

async function main() {
  const users = [
    { role: 'admin', username: 'admin', password: 'admin123', required: true },
    { role: 'cajero', username: 'cajero', password: 'cajero123', required: true },
    { role: 'mozo', username: 'mozo', password: 'mozo123', required: true },
    { role: 'cocina', username: 'cocina', password: 'cocina123', required: false },
    { role: 'bar', username: 'bar', password: 'bar123', required: false },
    { role: 'delivery', username: 'delivery', password: 'delivery123', required: false },
  ];

  const tokens = {};
  const errors = [];
  const warnings = [];

  for (const u of users) {
    const token = await login(u.username, u.password);
    if (!token) {
      if (u.required) errors.push(`No se pudo autenticar rol requerido: ${u.role}`);
      else warnings.push(`No autenticado (opcional): ${u.role}`);
      continue;
    }
    tokens[u.role] = token;
  }

  if (tokens.admin) {
    const report = await request('/reports/daily', { token: tokens.admin });
    if (report.status !== 200) errors.push(`Admin no accede a /reports/daily (${report.status})`);
  }

  if (tokens.cajero) {
    const caja = await request('/pos/register-status', { token: tokens.cajero });
    if (caja.status !== 200) errors.push(`Cajero no accede a /pos/register-status (${caja.status})`);
  }

  if (tokens.mozo) {
    const mesas = await request('/tables', { token: tokens.mozo });
    if (mesas.status !== 200) errors.push(`Mozo no accede a /tables (${mesas.status})`);
  }

  if (tokens.cocina) {
    const kitchen = await request('/orders/kitchen?station=cocina', { token: tokens.cocina });
    if (kitchen.status !== 200) warnings.push(`Cocina no accede a /orders/kitchen (${kitchen.status})`);
  }

  if (tokens.bar) {
    const bar = await request('/orders/kitchen?station=bar', { token: tokens.bar });
    if (bar.status !== 200) warnings.push(`Bar no accede a /orders/kitchen?station=bar (${bar.status})`);
  }

  if (tokens.delivery) {
    const deliveries = await request('/delivery/my-deliveries', { token: tokens.delivery });
    if (deliveries.status !== 200) warnings.push(`Delivery no accede a /delivery/my-deliveries (${deliveries.status})`);
  }

  if (warnings.length) {
    console.warn('Warnings:');
    warnings.forEach((w) => console.warn(`- ${w}`));
  }

  if (errors.length) {
    console.error('Errores de validacion de roles:');
    errors.forEach((e) => console.error(`- ${e}`));
    process.exit(1);
  }

  console.log('Verificacion de roles OK');
}

main().catch((err) => {
  console.error('Fallo en verificacion de roles:', err.message);
  process.exit(1);
});
