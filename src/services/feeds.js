// src/services/feeds.js — Feeds gratis robustos
const UA = 'Mozilla/5.0 (HXBot)';
const DEF_TIMEOUT = Number(process.env.HTTP_TIMEOUT_MS || 8000);
const RETRIES = Number(process.env.HTTP_RETRIES || 2);
const FEEDS_DEBUG = process.env.FEEDS_DEBUG === '1';

const ALLOWED_QUOTES = (process.env.ALLOWED_QUOTES || 'WSOL,USDC,USDT')
  .split(',').map(s=>s.trim().toUpperCase());

const M4_MIN_LIQ_USD   = Number(process.env.M4_MIN_LIQ_USD   || 1500);
const M4_MIN_PRICE_USD = Number(process.env.M4_MIN_PRICE_USD || 0.0000001);
const M4_MAX_AGE_MIN   = Number(process.env.M4_MAX_AGE_MIN   || 720); // 12h

function ageMinutes(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  return isFinite(t) ? (Date.now() - t)/60000 : Infinity;
}

async function fetchJsonWithRetry(url, {timeoutMs=DEF_TIMEOUT, headers={}}={}) {
  let lastErr;
  for (let i=0; i<=RETRIES; i++) {
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, 'accept': 'application/json', ...headers }, signal: ac.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP '+r.status);
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (FEEDS_DEBUG) console.error('[feeds] fetch fail', url, String(e?.message||e), 'try', i+1);
      await new Promise(r=>setTimeout(r, 300*(i+1))); // backoff
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr || new Error('fetch failed');
}

/* ================= GeckoTerminal ================= */
async function geckoPairs(limit=50, page=1) {
  const out = [];
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools?include=base_token,quote_token&page=${page}`;
  try {
    const j = await fetchJsonWithRetry(url);
    const arr = j?.data || [];
    const included = j?.included || [];
    const incMap = new Map();
    for (const inc of included) incMap.set(inc?.id, inc?.attributes || {});

    for (const p of arr) {
      const a = p?.attributes || {};
      const baseId  = p?.relationships?.base_token?.data?.id;
      const quoteId = p?.relationships?.quote_token?.data?.id;
      const base = baseId ? incMap.get(baseId) : {};
      const quote = quoteId ? incMap.get(quoteId) : {};

      const baseSymbol  = String(base?.symbol || a?.base_token_symbol || '?').toUpperCase();
      const baseMint    = base?.address || base?.contract_address || null;
      const quoteSymbol = String(quote?.symbol || a?.quote_token_symbol || '?').toUpperCase();
      const quoteMint   = quote?.address || quote?.contract_address || null;

      out.push({
        source: 'gecko',
        pairId: p?.id || null,
        baseSymbol,
        baseMint,
        quoteSymbol,
        quoteMint,
        priceUsd: Number(a?.base_token_price_usd ?? a?.price_usd ?? 0) || 0,
        liquidityUsd: Number(a?.reserve_in_usd ?? a?.liquidity_usd ?? 0) || 0,
        fdvUsd: Number(a?.fdv_usd ?? 0) || 0,
        volume24hUsd: Number(a?.volume_usd_24h ?? 0) || 0,
        createdAt: a?.pool_created_at || null,
      });
    }
  } catch (e) {
    if (FEEDS_DEBUG) console.error('[feeds] gecko error', e?.message||e);
  }
  return out.slice(0, limit);
}

/* ================= Raydium (opcional) ================= */
async function raydiumPairs(limit=50) {
  const out = [];
  const url = 'https://api.raydium.io/pairs?limit=50';
  try {
    const j = await fetchJsonWithRetry(url);
    const arr = Array.isArray(j) ? j : (j?.data || []);
    for (const p of arr) {
      const name = p?.name || '';
      const [symA] = name.split('/');
      out.push({
        source: 'raydium',
        pairId: p?.pair_id || null,
        baseSymbol: String(symA || '?').toUpperCase(),
        baseMint: p?.base_mint || null,
        quoteSymbol: 'WSOL',
        quoteMint: 'So11111111111111111111111111111111111111112',
        priceUsd: Number(p?.price || p?.priceUsd || 0) || 0,
        liquidityUsd: Number(p?.liquidity ?? p?.liquidity_usd ?? 0) || 0,
        fdvUsd: Number(p?.fdv ?? p?.fdv_usd ?? 0) || 0,
        volume24hUsd: Number(p?.volume_24h ?? p?.volumeUsd24h ?? 0) || 0,
        createdAt: p?.created_at || null,
      });
    }
  } catch (e) {
    if (FEEDS_DEBUG) console.error('[feeds] raydium error', e?.message||e);
  }
  return out.slice(0, limit);
}

/* ================= Agregador + filtros ================= */
export async function getSolanaPairs({ limit=50 } = {}) {
  const order = (process.env.MARKETS_ORDER || 'gecko,raydium').split(',').map(s=>s.trim());
  let acc = [];
  for (const src of order) {
    if (src === 'gecko') {
      const g1 = await geckoPairs(limit, 1);
      const need = Math.max(0, limit - g1.length);
      const g2 = need ? await geckoPairs(limit, 2) : [];
      acc = acc.concat(g1, g2);
    }
    if (src === 'raydium') {
      const r = await raydiumPairs(limit);
      acc = acc.concat(r);
    }
  }

  // dedup
  const seen = new Set();
  const dedup = [];
  for (const p of acc) {
    const key = p.baseMint || p.pairId || (p.source+':'+p.baseSymbol);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedup.push(p);
  }

  // filtros
  const filtered = dedup.filter(p => {
    const qOk   = !p.quoteSymbol || ALLOWED_QUOTES.includes(String(p.quoteSymbol).toUpperCase());
    const liqOk = (p.liquidityUsd || 0) >= M4_MIN_LIQ_USD;
    const pxOk  = (p.priceUsd || 0) >= M4_MIN_PRICE_USD;
    const ageOk = ageMinutes(p.createdAt) <= M4_MAX_AGE_MIN;
    return qOk && liqOk && pxOk && ageOk;
  });

  filtered.sort((a,b)=> (b.liquidityUsd||0) - (a.liquidityUsd||0));
  if (FEEDS_DEBUG) console.log('[feeds] out', filtered.slice(0,5));
  return filtered.slice(0, limit);
}
