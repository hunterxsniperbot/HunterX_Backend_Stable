import * as orig from './markets.js';

const DEBUG = process.env.MARKETS_DEBUG === '1';
const ORDER = (process.env.MARKETS_ORDER || 'gecko,raydium,dexscreener')
  .split(',').map(s => s.trim().toLowerCase());

function log(...a){ if (DEBUG) console.log('[marketsPref]', ...a); }
function scoreSource(s){ const i = ORDER.indexOf(String(s||'').toLowerCase()); return i === -1 ? 999 : i; }

async function fetchJson(url, { timeoutMs=3000, headers={} } = {}){
  const ac = new AbortController(); const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0', ...headers }, signal: ac.signal });
    const ok = r.ok, st = r.status;
    let j=null; try { j = await r.json(); } catch { j=null; }
    log('GET', url, '->', st);
    return ok ? j : null;
  }catch(e){ log('ERR', url, String(e.message||e)); return null; }
  finally{ clearTimeout(t); }
}

// ---------- 1) intentar markets.js original (sea default o named) ----------
async function getFromOrig(limit){
  const cands = [
    orig.getSolanaPairs,
    orig.default && orig.default.getSolanaPairs,
    typeof orig.default === 'function' ? orig.default : null,
    orig.getPairs,
  ].filter(Boolean);

  for (const fn of cands){
    try{
      const r = await fn.call(orig.default||orig, { limit });
      if (Array.isArray(r) && r.length){ log('orig hit', r.length); return r; }
    }catch{}
  }
  log('orig empty');
  return [];
}

// ---------- 2) GeckoTerminal (fallback) ----------
async function getFromGecko(limit){
  const out = [];
  for (let page=1; out.length<limit && page<=2; page++){
    const j = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/pools?page=${page}`);
    const arr = j?.data || [];
    log('gecko page', page, 'items', arr.length);
    for (const it of arr){
      const a = it?.attributes || {};
      const name = a.name || '';
      const [baseSymbol='?', quoteSymbol='?'] = String(name).split('/');
      let pairAddress = null;
      if (typeof it?.id === 'string' && it.id.startsWith('solana_')){
        pairAddress = it.id.slice('solana_'.length);
      }
      out.push({
        source: 'gecko',
        dexId: 'unknown',
        pairAddress,
        baseSymbol,
        quoteSymbol,
        priceUsd: a.base_token_price_usd ? Number(a.base_token_price_usd) : null,
        liquidityUsd: a.reserve_in_usd ?? a.reserve_usd ?? a.total_reserve_in_usd ?? null,
        fdvUsd: a.fdv_usd ?? a.fdv ?? null,
      });
      if (out.length>=limit) break;
    }
  }
  return out;
}

// ---------- 3) Raydium v3 (ultimo recurso) ----------
async function getFromRaydium(limit){
  const j = await fetchJson('https://api.raydium.io/pairs?limit=50');
  const arr = Array.isArray(j) ? j : [];
  log('raydium items', arr.length);
  const out = [];
  for (const it of arr){
    const name = it.name || '';
    const [baseSymbol='?', quoteSymbol='?'] = String(name).split('/');
    out.push({
      source: 'raydium',
      dexId: 'raydium',
      pairAddress: it.pair_id || null,
      baseSymbol, quoteSymbol,
      priceUsd: null,
      liquidityUsd: it.liquidity || it.liq || null,
      fdvUsd: null,
    });
    if (out.length>=limit) break;
  }
  return out;
}

export async function getSolanaPairs(opts = {}){
  const limit = Number(opts.limit || 20);
  const useGeckoOnly = process.env.USE_GECKO_ONLY === '1';

  let arr = [];
  if (!useGeckoOnly){
    arr = await getFromOrig(limit);
  }
  if (!arr.length){
    arr = await getFromGecko(limit);
  }
  if (!arr.length){
    arr = await getFromRaydium(limit);
  }

  // ordenar + dedupe + cortar
  const seen = new Set(); const out = [];
  const sorted = arr.sort((a,b)=>scoreSource(a.source)-scoreSource(b.source));
  for (const p of sorted){
    const key = p.pairAddress || `${p.baseSymbol}|${p.quoteSymbol}|${p.dexId||p.source}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push(p); if (out.length>=limit) break;
  }
  log('final out', out.length);
  return out;
}

export default { getSolanaPairs };
