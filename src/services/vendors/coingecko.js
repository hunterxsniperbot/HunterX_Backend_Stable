// src/services/vendors/coingecko.js
// CoinGecko vendor (sin API key). Ideal para precios spot rápidos de SOL y otros.
// Tolerante a errores (retorna null si falla).

const CG_BASE = 'https://api.coingecko.com/api/v3';

function withTimeout(promise, ms=4500) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

async function get(path, params={}, { timeout=4500 } = {}) {
  const u = new URL(CG_BASE + path);
  for (const [k,v] of Object.entries(params)) if (v!==undefined && v!==null) u.searchParams.set(k, String(v));
  const res = await withTimeout(fetch(u, { headers: { accept: 'application/json' } }), timeout).catch(()=>null);
  if (!res || !res.ok) return null;
  return res.json().catch(()=>null);
}

// Precio simple: ids=['solana'], vs='usd' → { solana: { usd: 170.12 } }
export async function cgSimplePrice(ids=['solana'], vs='usd') {
  const j = await get('/simple/price', { ids: ids.join(','), vs_currencies: vs }).catch(()=>null);
  return j || null;
}

// Info básica de un coin (por id, ej: 'solana')
export async function cgCoinInfo(id='solana') {
  const j = await get(`/coins/${encodeURIComponent(id)}`, { localization: false, tickers: false, market_data: true }).catch(()=>null);
  if (!j) return null;
  return {
    id: j.id,
    symbol: j.symbol,
    name: j.name,
    marketCapUsd: Number(j?.market_data?.market_cap?.usd ?? NaN) || null,
    priceUsd: Number(j?.market_data?.current_price?.usd ?? NaN) || null,
    priceChange24hPct: Number(j?.market_data?.price_change_percentage_24h ?? NaN) || null,
    raw: j
  };
}
