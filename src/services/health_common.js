const TIMEOUT = Number(process.env.HEALTH_TIMEOUT_MS || 1200);

export function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export async function fetchWithTimeout(url, init={}, ms=TIMEOUT){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(new Error('timeout')), ms);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const dt = Date.now() - t0;
    return { res, dt };
  } finally {
    clearTimeout(t);
  }
}

export async function getJson(url, ms=TIMEOUT, headers={}){
  const { res, dt } = await fetchWithTimeout(url, { headers }, ms);
  let body = null;
  try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, dt, body };
}

export async function postJson(url, payload, ms=TIMEOUT, headers={}){
  const { res, dt } = await fetchWithTimeout(url, {
    method:'POST',
    headers: { 'content-type':'application/json', ...headers },
    body: JSON.stringify(payload)
  }, ms);
  let body = null;
  try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, dt, body };
}

export function scoreFrom(status, dt, timeout=TIMEOUT){
  if (status === 'OK') return 1;
  if (status === 'DEGRADED') return 0.5;
  return 0; // DOWN
}

export function semaphore(pct){
  if (pct >= 0.90) return '🟢';
  if (pct >= 0.60) return '🟡';
  return '🔴';
}
