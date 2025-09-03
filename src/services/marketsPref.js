const UA = { 'user-agent': 'Mozilla/5.0' };

async function fetchJson(url, { timeoutMs=2500 } = {}){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, { headers: UA, signal: ac.signal });
    return await r.json();
  }catch{ return null; }
  finally{ clearTimeout(t); }
}

// GeckoTerminal (3 páginas rápidas) → mapeo mínimo
async function getFromGecko(limit=20){
  const out = [];
  for (let page=1; page<=3 && out.length<limit; page++){
    const j = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/pools?page=${page}`);
    const arr = j?.data || [];
    for (const it of arr){
      const a = it.attributes || {};
      const [baseSymbol='?', quoteSymbol='?'] = String(a.name||'').split('/');
      const pairAddress = typeof it.id==='string' && it.id.startsWith('solana_') ? it.id.slice(7) : null;
      out.push({
        source: 'gecko',
        dexId: 'unknown',
        pairAddress,
        baseSymbol,
        quoteSymbol,
        priceUsd: a.base_token_price_usd ? Number(a.base_token_price_usd) : null,
        liquidityUsd: a.reserve_in_usd ? Number(a.reserve_in_usd) : (a.total_reserve_in_usd ? Number(a.total_reserve_in_usd) : null),
        fdvUsd: a.fdv_usd ? Number(a.fdv_usd) : null,
      });
      if (out.length>=limit) break;
    }
  }
  return out;
}

export async function getSolanaPairs({limit=20}={}){
  // Fase 1: intentá tu markets.js original (si existe)
  let arr = [];
  try {
    const orig = await import('./markets.js');
    if (orig.getSolanaPairs) {
      const r = await orig.getSolanaPairs({limit}).catch(()=>[]);
      arr = Array.isArray(r) ? r : [];
    }
  } catch { arr = []; }

  // Fase 2: si no hay nada, Gecko
  if (arr.length === 0) {
    const gk = await getFromGecko(limit).catch(()=>[]);
    arr = Array.isArray(gk) ? gk : [];
  }

  // Dedup básico
  const seen = new Set();
  const out = [];
  for (const p of arr){
    const key = p.pairAddress || `${p.baseSymbol}|${p.quoteSymbol}|${p.dexId||p.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length>=limit) break;
  }
  return out;
}

export default { getSolanaPairs };
