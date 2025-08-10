// src/services/feeds.js
// Buffer de señales externas con decaimiento en el tiempo.
// Se usa desde vendors (whalealert/discord) y lo consulta intel.enrichMint().

const signals = new Map(); // mint -> { score, source, ts }

export function pushSignal({ mint, score = 1, source = 'manual' }) {
  if (!mint) return;
  const now = Date.now();
  const prev = signals.get(mint) || { score: 0, source, ts: now };
  signals.set(mint, { score: prev.score + Number(score || 1), source, ts: now });
}

export function getSignal(mint) {
  const rec = signals.get(mint);
  if (!rec) return { score: 0, source: null, ts: 0 };
  const ageMin = (Date.now() - rec.ts) / 60000;
  const decay = Math.max(0, 1 - (ageMin / 10)); // decae a 0 en ~10 min
  return { score: rec.score * decay, source: rec.source, ts: rec.ts };
}

export function clearOldSignals(maxMin = 30) {
  const now = Date.now();
  for (const [k, v] of signals) if ((now - v.ts) > maxMin*60000) signals.delete(k);
}

// Por si querés inspeccionar/depurar
export function dumpSignals() {
  const out = [];
  for (const [mint, v] of signals) out.push({ mint, ...v });
  return out.sort((a,b) => b.score - a.score);
}
