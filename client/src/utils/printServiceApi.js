function normBase(baseUrl) {
  return String(baseUrl || '')
    .trim()
    .replace(/\/$/, '') || 'http://127.0.0.1:3049';
}

const fetchOpts = {
  mode: 'cors',
  credentials: 'omit',
  cache: 'no-store',
};

export async function fetchDiscoverAll(baseUrl) {
  const b = normBase(baseUrl);
  const res = await fetch(`${b}/discover-all`, { ...fetchOpts, method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function postWatchdogTargets(baseUrl, targets) {
  const b = normBase(baseUrl);
  const res = await fetch(`${b}/watchdog/targets`, {
    ...fetchOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets: Array.isArray(targets) ? targets : [] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function postWatchdogProbeNow(baseUrl) {
  const b = normBase(baseUrl);
  const res = await fetch(`${b}/watchdog/probe-now`, { ...fetchOpts, method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function fetchWindowsPrintersList(baseUrl) {
  const b = normBase(baseUrl);
  const res = await fetch(`${b}/printers`, { ...fetchOpts, method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function postProbeLan(baseUrl, { ip, port = 9100 } = {}) {
  const b = normBase(baseUrl);
  const res = await fetch(`${b}/probe`, {
    ...fetchOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'lan', ip, port }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
