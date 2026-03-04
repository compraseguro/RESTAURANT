const base = process.env.SMOKE_BASE_URL || 'http://localhost:3001/api';

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, options);
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  return { status: res.status, data };
}

async function main() {
  const health = await request('/healthz');
  if (health.status !== 200) throw new Error(`healthz fallo: ${health.status}`);

  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (login.status !== 200 || !login.data?.token) {
    throw new Error(`login admin fallo: ${login.status}`);
  }

  const reports = await request('/reports/daily', {
    headers: { Authorization: `Bearer ${login.data.token}` },
  });
  if (reports.status !== 200) throw new Error(`reports daily fallo: ${reports.status}`);

  console.log('Smoke test OK');
}

main().catch((err) => {
  console.error('Smoke test failed:', err.message);
  process.exit(1);
});
