// src/boot/health_common.js — helpers comunes para /salud
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function getJson(url, timeoutMs = 1500, headers = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort('timeout'), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: 'GET', headers, signal: ac.signal });
    const dt = Date.now() - t0;
    let body = null;
    try { body = await r.json(); } catch { /* puede no ser JSON */ }
    return { ok: r.ok, status: r.status, dt, body };
  } finally {
    clearTimeout(t);
  }
}

export async function postJson(url, body = {}, timeoutMs = 1500, headers = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort('timeout'), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ac.signal
    });
    const dt = Date.now() - t0;
    let j = null;
    try { j = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, dt, body: j };
  } finally {
    clearTimeout(t);
  }
}

/** Puntaje simple: OK=1, DEGRADED=0.6, DOWN=0, con pequeño castigo si latencia > 1500ms */
export function scoreFrom(status, latencyMs) {
  const base = status === 'OK' ? 1 : status === 'DEGRADED' ? 0.6 : 0;
  if (!latencyMs || latencyMs <= 1500) return base;
  const penalty = Math.min(0.2, (latencyMs - 1500) / 5000); // tope 0.2
  return Math.max(0, base - penalty);
}
