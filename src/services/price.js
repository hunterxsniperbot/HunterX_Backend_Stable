
// src/services/price.js
// Precio actual (Jupiter) con cache in-memory

const _cache = new Map(); // id -> { px, ts }
const TTL = Number(process.env.HX_PNL_PRICE_CACHE_MS || 25000);

function _now(){ return Date.now(); }
function _isFresh(ts){ return (_now() - ts) < TTL; }

// id: preferí el mint; si no, el símbolo upper
export async function getUsdQuote({ symbol="SOL", mint=null, fallback=0 }={}){
  const id = mint || String(symbol||"SOL").toUpperCase();
  const c = _cache.get(id);
  if (c && _isFresh(c.ts)) return c.px;

  try{
    const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`;
    const r = await fetch(url, { method:"GET", keepalive:false, cache:"no-store" });
    if (!r.ok) throw new Error("HTTP "+r.status);
    const js = await r.json();
    const p = js?.data?.[id]?.price;
    if (Number.isFinite(p)) {
      _cache.set(id, { px:Number(p), ts:_now() });
      return Number(p);
    }
  }catch{}
  return Number(fallback||0);
}

// batch (dedup)
export async function getManyQuotes(ids){
  // ids: array de { symbol?, mint?, fallback? }
  const out = [];
  const promises = ids.map(async it=>{
    const px = await getUsdQuote(it);
    out.push({ key: it.mint || String(it.symbol||"SOL").toUpperCase(), px });
  });
  await Promise.all(promises);
  return out; // [{key, px}]
}
export default { getUsdQuote, getManyQuotes };
