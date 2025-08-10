// src/services/vendors/whalealert.js
// Whale Alert vendor (Solana por defecto). Si no hay key, devuelve [].

import { pushSignal } from '../feeds.js';

const BASE = 'https://api.whale-alert.io/v1';
const KEY  = process.env.WHALEALERT_API_KEY || '';

function withTimeout(promise, ms = 6000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

async function get(path, params = {}, { timeout = 6000 } = {}) {
  if (!KEY) return null;
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  u.searchParams.set('api_key', KEY);
  const res = await withTimeout(fetch(u, { headers: { accept: 'application/json' } }), timeout).catch(()=>null);
  if (!res || !res.ok) return null;
  return res.json().catch(()=>null);
}

export function normalizeEvent(evt) {
  if (!evt) return null;
  return {
    blockchain: evt.blockchain || null,
    symbol: (evt.symbol || '').toUpperCase(),
    amount: Number(evt.amount || 0),
    amountUsd: Number(evt.amount_usd || 0),
    from: evt.from?.address || null,
    to: evt.to?.address || null,
    txid: evt.hash || null,
    timestamp: Number(evt.timestamp || 0),
    raw: evt
  };
}

export async function waFetchLargeTransfers({ start, end, minUsd = 10000, blockchain = 'solana' } = {}) {
  if (!KEY) return [];
  const now = Math.floor(Date.now() / 1000);
  const s = start ?? (now - 60);
  const e = end ?? now;

  try {
    const j = await get('/transactions', {
      start: s,
      end: e,
      min_value: minUsd,
      blockchain,
    });
    const txs = Array.isArray(j?.transactions) ? j.transactions : [];
    return txs.map(normalizeEvent).filter(Boolean);
  } catch {
    return [];
  }
}

// Convierte un evento a signal y lo deja en feeds.js (si se identifica un mint)
// Nota: WhaleAlert no siempre trae el mint. Para SOL tokens, suele hacer falta
// mapear símbolo->mint o usar otra fuente. Aquí empujamos solo si tenés mintOverride.
export function eventToSignal(evt, { mintOverride } = {}) {
  const n = normalizeEvent(evt);
  if (!n) return null;
  const mint = mintOverride || null;
  if (!mint) return null;
  const score = n.amountUsd >= 1_000_000 ? 5 :
                n.amountUsd >=   250_000 ? 3 :
                n.amountUsd >=    50_000 ? 2 :
                n.amountUsd >=    10_000 ? 1 : 0.5;
  if (score > 0) {
    pushSignal?.({ mint, score, source: `whalealert:${n.blockchain}` });
    return { mint, score, source: 'whalealert', normalized: n };
  }
  return null;
}
