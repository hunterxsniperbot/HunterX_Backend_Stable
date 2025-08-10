// src/services/vendors/coinmarketcap.js
// CoinMarketCap vendor (requiere CMC_API_KEY). Tolerante a errores.

const CMC_BASE = 'https://pro-api.coinmarketcap.com/v1';
const CMC_KEY  = process.env.CMC_API_KEY || '';

function withTimeout(promise, ms=4500) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

async function get(path, params={}, { timeout=4500 } = {}) {
  if (!CMC_KEY) return null;
  const u = new URL(CMC_BASE + path);
  for (const [k,v] of Object.entries(params)) if (v!==undefined && v!==null) u.searchParams.set(k, String(v));
  const res = await withTimeout(fetch(u, { headers: { 'X-CMC_PRO_API_KEY': CMC_KEY, accept: 'application/json' } }), timeout).catch(()=>null);
  if (!res || !res.ok) return null;
  return res.json().catch(()=>null);
}

// Precio SOL (quote latest)
export async function cmcSolPrice() {
  const j = await get('/cryptocurrency/quotes/latest', { symbol: 'SOL', convert: 'USD' }).catch(()=>null);
  return Number(j?.data?.SOL?.quote?.USD?.price ?? NaN) || null;
}

// Precio por símbolo genérico (ej: 'BTC','ETH','SOL')
export async function cmcSymbolPrice(symbol='SOL') {
  const sym = String(symbol || '').toUpperCase();
  const j = await get('/cryptocurrency/quotes/latest', { symbol: sym, convert: 'USD' }).catch(()=>null);
  return Number(j?.data?.[sym]?.quote?.USD?.price ?? NaN) || null;
}
