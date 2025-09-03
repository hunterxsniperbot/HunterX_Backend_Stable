import * as base from './markets.js';

// Acepta: named export, default={getSolanaPairs}, o default=function
const origGetSolanaPairs =
  base.getSolanaPairs ||
  (base.default && (base.default.getSolanaPairs || (typeof base.default === 'function' ? base.default : null)));

if (typeof origGetSolanaPairs !== 'function') {
  console.warn('[marketsPref] WARNING: markets.js no expone getSolanaPairs; usaré sólo fallback Gecko.');
}

const ORDER = (process.env.MARKETS_ORDER || 'gecko,raydium,dexscreener')
  .split(',').map(s => s.trim().toLowerCase());

function scoreSource(s){
  const i = ORDER.indexOf(String(s||'').toLowerCase());
  return i === -1 ? 999 : i;
}

async function fetchJson(url, { timeoutMs=2500 } = {}){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, { headers:{'user-agent':'Mozilla/5.0'}, signal: ac.signal });
    return await r.json();
  }catch{ return null; } finally{ clearTimeout(t); }
}

// Fallback directo a GeckoTerminal (rápido, 3 páginas)
async function getFromGecko(limit=20){
  const out = [];
  for (let page=1; page<=3 && out.length<limit; page++){
    const j = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/pools?page=${page}`);
    const arr = j?.data || [];
    for (const it of arr){
      const a = it.attributes || {};
      const name = (a.name || '').trim(); // "TOKEN/WSOL"
      let baseSymbol='Token', quoteSymbol='?';
      if (name.includes('/')){
        const [b,q] = name.split('/');
        baseSymbol = (b||'Token').slice(0,12);
        quoteSymbol = (q||'?').slice(0,12);
      }
      let pairAddress = null;
      if (typeof it.id === 'string' && it.id.startsWith('solana_')){
        pairAddress = it.id.slice('solana_'.length);
      }
      const priceUsd = a.base_token_price_usd ? Number(a.base_token_price_usd) : null;
      const liquidityUsd = a.reserve_in_usd ?? a.reserve_usd ?? a.total_reserve_in_usd ?? null;
      const fdvUsd = a.fdv_usd ?? a.fdv ?? null;

      out.push({
        source: 'gecko',
        dexId: 'gecko',
        pairAddress,
        baseSymbol, quoteSymbol,
        priceUsd,
        liquidityUsd: liquidityUsd ? Number(liquidityUsd) : null,
        fdvUsd: fdvUsd ? Number(fdvUsd) : null,
        links: pairAddress ? { gecko: `https://www.geckoterminal.com/solana/pools/${pairAddress}` } : {},
        gecko: { raw: a },
      });
      if (out.length>=limit) break;
    }
  }
  return out;
}

export async function getSolanaPairs(opts = {}) {
  const limit = Number(opts.limit || 20);
  let arr = [];

  // Intento markets.js si existe
  try {
    if (typeof origGetSolanaPairs === 'function') {
      const baseArr = await origGetSolanaPairs({ limit });
      if (Array.isArray(baseArr) && baseArr.length) arr = baseArr;
    }
  } catch {}

  // Si no trajo nada, usá Gecko
  if (!arr.length) {
    const gk = await getFromGecko(limit).catch(()=>[]);
    if (Array.isArray(gk)) arr = gk;
  }

  // Orden y dedup
  const seen = new Set();
  const sorted = arr.sort((a,b) => scoreSource(a.source) - scoreSource(b.source));
  const out = [];
  for (const p of sorted) {
    const key = p.pairAddress || `${p.baseSymbol}|${p.quoteSymbol}|${p.dexId||p.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length>=limit) break;
  }
  return out;
}

export default { getSolanaPairs };
