// src/services/prices.js — agregador de precios (CG + CMC + DexScreener) con caché simple

const TTL_MS = Number(process.env.PRICES_TTL_MS || 10000); // 10s por defecto
const _cache = new Map();
const _now = () => Date.now();
const _isSolAddress = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s||'').trim());

function _fromCache(k){ const v=_cache.get(k); return (v && (_now()-v.t)<TTL_MS) ? v.data : null; }
function _toCache(k,d){ _cache.set(k,{t:_now(),data:d}); return d; }

// ---------- CoinGecko ----------
async function cgSimple(ids){
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
  const r = await fetch(url); if(!r.ok) throw new Error('CG simple http '+r.status);
  return r.json();
}
async function cgTokenPriceSol(address){
  const url = `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${encodeURIComponent(address)}&vs_currencies=usd`;
  const r = await fetch(url); if(!r.ok) throw new Error('CG token http '+r.status);
  return r.json();
}

// ---------- CoinMarketCap (requiere CMC_API_KEY) ----------
async function cmcQuoteSymbol(sym){
  const key = process.env.CMC_API_KEY; if(!key) throw new Error('NO_CMC_KEY');
  const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(sym)}`;
  const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': key } });
  if(!r.ok) throw new Error('CMC http '+r.status);
  return r.json();
}
async function cmcQuoteAddressSol(address){
  const key = process.env.CMC_API_KEY; if(!key) throw new Error('NO_CMC_KEY');
  const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?address=${encodeURIComponent(address)}&aux=is_active`;
  const r = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': key } });
  if(!r.ok) throw new Error('CMC http '+r.status);
  return r.json();
}

// ---------- DexScreener ----------
async function dexScreenerToken(address){
  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`;
  const r = await fetch(url); if(!r.ok) throw new Error('Dex http '+r.status);
  return r.json();
}

// Mapeos útiles para CoinGecko por símbolo
const CG_ID_MAP = { SOL: 'solana', USDC: 'usd-coin', USDT: 'tether' };

/**
 * Devuelve precio USD (number) o null si no lo pudo obtener.
 * input: 'SOL' | 'SOL/USDC' | '<address SPL>'
 */
export async function getPriceUSD(input, opts = {}){
  try{
    const raw = String(input||'').trim();
    const key = 'p:'+raw.toUpperCase();
    const hit = _fromCache(key); if(hit!=null) return hit;

    // si viene par tipo "SOL/USDC", me quedo con la base
    const base = raw.includes('/') ? raw.split('/')[0] : raw;
    let price = null;

    if (_isSolAddress(base)) {
      // 1) CG por address
      try {
        const j = await cgTokenPriceSol(base);
        const k = Object.keys(j)[0];
        if(k && j[k] && j[k].usd != null) price = Number(j[k].usd);
      } catch {}

      // 2) CMC por address
      if(price==null){
        try {
          const j = await cmcQuoteAddressSol(base);
          const data = j?.data && Object.values(j.data)[0];
          price = Number(data?.quote?.USD?.price);
        } catch {}
      }

      // 3) DexScreener
      if(price==null){
        try {
          const j = await dexScreenerToken(base);
          const pairs = j?.pairs || [];
          const best = pairs.sort((a,b)=>(Number(b.liquidity?.usd||0)-Number(a.liquidity?.usd||0)))[0];
          if(best && best.priceUsd) price = Number(best.priceUsd);
        } catch {}
      }
    } else {
      // símbolo
      const sym = base.toUpperCase();

      // 1) CG por id conocido
      const id = CG_ID_MAP[sym];
      if(id){
        try {
          const j = await cgSimple(id);
          const v = j?.[id]?.usd;
          if(v!=null) price = Number(v);
        } catch {}
      }

      // 2) CMC por símbolo (si hay key)
      if(price==null){
        try {
          const j = await cmcQuoteSymbol(sym);
          const arr = j?.data?.[sym];
          const item = Array.isArray(arr) ? arr[0] : null;
          const v = item?.quote?.USD?.price;
          if(v!=null) price = Number(v);
        } catch {}
      }
    }

    if(price==null) return null;
    return _toCache(key, price);
  } catch {
    return null;
  }
}

export async function getPriceUsdByMint(mint){ return getPriceUSD(mint); }
export async function getPriceUsdBySymbol(sym){ return getPriceUSD(sym); }
export default { getPriceUSD, getPriceUsdByMint, getPriceUsdBySymbol };
