import { getJson } from '../util/http.js';
import { getSolanaPairs as origGetSolanaPairs } from './markets.js';
import { readFileSync } from 'node:fs';

const ORDER = (process.env.MARKETS_ORDER || 'gecko,raydium,dexscreener')
  .split(',').map(s => s.trim().toLowerCase());

function scoreSource(s){
  const i = ORDER.indexOf(String(s||'').toLowerCase());
  return i === -1 ? 999 : i;
}

async function getFromGecko(limit=20){
  const out = [];
  let page = 1;
  while (out.length < limit && page <= 3){
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools?page=${page}`;
    const j = await getJson(url, { timeoutMs: 4500 });
    const arr = j?.data || [];
    for (const it of arr){
      const a = it?.attributes || {};
      const name = a.name || '';
      const [baseSymbol='?', quoteSymbol='?'] = name.split('/');
      let pairAddress = null;
      if (typeof it?.id === 'string' && it.id.startsWith('solana_')){
        pairAddress = it.id.slice('solana_'.length);
      }
      const basePriceUsd = a.base_token_price_usd ? Number(a.base_token_price_usd) : null;
      const liqUsd = a.reserve_in_usd ?? a.reserve_usd ?? a.total_reserve_in_usd ?? null;
      const fdvUsd = a.fdv_usd ?? a.fdv ?? null;

      out.push({
        source: 'gecko',
        dexId: 'unknown',
        pairAddress,
        baseSymbol,
        quoteSymbol,
        priceUsd: basePriceUsd,
        liquidityUsd: liqUsd ? Number(liqUsd) : null,
        fdvUsd: fdvUsd ? Number(fdvUsd) : null,
      });
      if (out.length >= limit) break;
    }
    page++;
  }
  return out;
}

function getLocalSample(limit=20){
  try{
    const j = JSON.parse(readFileSync('src/data/sample_pools.sol.json', 'utf8'));
    return Array.isArray(j) ? j.slice(0, limit) : [];
  }catch{ return []; }
}

export async function getSolanaPairs(opts = {}) {
  const limit = Number(opts.limit || 20);
  let arr = [];
  try {
    arr = await origGetSolanaPairs({ limit });
    if (!Array.isArray(arr)) arr = [];
  } catch { arr = []; }

  if (arr.length === 0) {
    const gk = await getFromGecko(limit).catch(()=>[]);
    arr = Array.isArray(gk) ? gk : [];
  }

  if (arr.length === 0) {
    arr = getLocalSample(limit);
  }

  const seen = new Set();
  const sorted = arr.sort((a,b) => scoreSource(a.source) - scoreSource(b.source));
  const out = [];
  for (const p of sorted) {
    const key = p.pairAddress || `${p.baseSymbol}|${p.quoteSymbol}|${p.dexId||p.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export default { getSolanaPairs };
