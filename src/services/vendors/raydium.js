// src/services/vendors/raydium.js
// Raydium vendor — info de pools + orderbook ligero (API pública).
// PREPARADO para modo híbrido: este vendor funciona hoy mismo y
// además expone funciones que usará el vendor de QuickNode como fallback.

const ENDPOINTS = {
  pools: [
    'https://api.raydium.io/v2/main/pairs',      // oficial clásico (a veces lento)
    'https://api-v3.raydium.io/pools',           // v3 pools (formato distinto)
    'https://raydium-api-v2.vercel.app/api/pairs', // mirror comunitario
  ],
  orderbook: [
    // mirrors comunitarios (opcional; si no responden, devolvemos null sin romper)
    'https://raydium-orderbook.fly.dev/depth',
  ]
};

function withTimeout(promise, ms=5000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

async function getJson(url, { timeout=5000 } = {}) {
  const res = await withTimeout(fetch(url, { headers: { accept: 'application/json' } }), timeout).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

// ---------- Normalización de pools ----------

function normPoolV2(p) {
  try {
    return {
      id: p?.id || p?.ammId || null,
      baseMint: p?.baseMint || p?.base?.mint || null,
      quoteMint: p?.quoteMint || p?.quote?.mint || null,
      baseSymbol: p?.baseSymbol || p?.base?.symbol || null,
      quoteSymbol: p?.quoteSymbol || p?.quote?.symbol || null,
      price: (p?.price != null) ? Number(p.price) : null,
      liquidityUsd: (p?.liquidity ?? p?.liquidityUsd) ? Number(p.liquidity ?? p.liquidityUsd) : null,
      volume24hUsd: (p?.volume24h ?? p?.volume24hUsd) ? Number(p.volume24h ?? p.volume24hUsd) : null,
      feeBps: (p?.feeBps != null) ? Number(p.feeBps) : null,
      updatedAt: Number(p?.updatedAt ?? Date.now()),
      raw: p
    };
  } catch { return null; }
}

function normPoolV3(p) {
  try {
    return {
      id: p?.id || p?.pool_id || null,
      baseMint: p?.mintA || p?.baseMint || null,
      quoteMint: p?.mintB || p?.quoteMint || null,
      baseSymbol: p?.symbolA || p?.baseSymbol || null,
      quoteSymbol: p?.symbolB || p?.quoteSymbol || null,
      price: (p?.price != null) ? Number(p.price) : null,
      liquidityUsd: (p?.liquidity ?? p?.tvl ?? p?.liquidityUsd) ? Number(p.liquidity ?? p.tvl ?? p.liquidityUsd) : null,
      volume24hUsd: (p?.volume_24h ?? p?.volume24h ?? p?.volume24hUsd) ? Number(p.volume_24h ?? p.volume24h ?? p.volume24hUsd) : null,
      feeBps: (p?.feeBps != null) ? Number(p.feeBps) : null,
      updatedAt: Number(p?.updated_at ?? p?.updatedAt ?? Date.now()),
      raw: p
    };
  } catch { return null; }
}

function bestNonNull(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return null;
}

function normalizePool(p) {
  if (!p) return null;
  const a = normPoolV2(p);
  if (a && a.baseMint) return a;
  const b = normPoolV3(p);
  if (b && b.baseMint) return b;
  return {
    id: p?.id || p?.ammId || p?.pool_id || null,
    baseMint: bestNonNull(p?.baseMint, p?.base?.mint, p?.mintA),
    quoteMint: bestNonNull(p?.quoteMint, p?.quote?.mint, p?.mintB),
    baseSymbol: bestNonNull(p?.baseSymbol, p?.base?.symbol, p?.symbolA),
    quoteSymbol: bestNonNull(p?.quoteSymbol, p?.quote?.symbol, p?.symbolB),
    price: (p?.price != null) ? Number(p.price) : null,
    liquidityUsd: (p?.liquidityUsd ?? p?.liquidity ?? p?.tvl) ? Number(p.liquidityUsd ?? p.liquidity ?? p.tvl) : null,
    volume24hUsd: (p?.volume24hUsd ?? p?.volume24h ?? p?.volume_24h) ? Number(p.volume24hUsd ?? p.volume24h ?? p.volume_24h) : null,
    feeBps: (p?.feeBps != null) ? Number(p.feeBps) : null,
    updatedAt: Number(p?.updatedAt ?? p?.updated_at ?? Date.now()),
    raw: p
  };
}

// ---------- API pública ----------

export async function rayListPools({ limit = 300 } = {}) {
  for (const url of ENDPOINTS.pools) {
    const j = await getJson(url).catch(()=>null);
    if (!j) continue;

    const arr =
      (Array.isArray(j) && j) ||
      (Array.isArray(j?.data) && j.data) ||
      (Array.isArray(j?.pairs) && j.pairs) ||
      null;

    if (!arr) continue;

    const out = [];
    for (const x of arr.slice(0, limit)) {
      const n = normalizePool(x);
      if (n?.baseMint) out.push(n);
    }
    if (out.length) return out;
  }
  return null;
}

export async function rayFindPoolsByMint(mint, { limit = 50 } = {}) {
  if (!mint) return null;
  const all = await rayListPools({ limit: 1000 }).catch(()=>null);
  if (!Array.isArray(all)) return null;
  const m = String(mint).toLowerCase();
  const out = all.filter(p =>
    String(p.baseMint || '').toLowerCase() === m ||
    String(p.quoteMint || '').toLowerCase() === m
  );
  return out.slice(0, limit);
}

export async function rayBestPoolByLiquidity(mint) {
  const list = await rayFindPoolsByMint(mint, { limit: 200 }).catch(()=>null);
  if (!Array.isArray(list) || !list.length) return null;
  let best = null;
  for (const p of list) {
    if (!best || Number(p.liquidityUsd || 0) > Number(best.liquidityUsd || 0)) best = p;
  }
  return best;
}

// ---------- Orderbook/Depth (ligero) ----------

export async function rayOrderbookDepth({ poolId, limit = 20 } = {}) {
  if (!poolId) return null;
  for (const base of ENDPOINTS.orderbook) {
    const url = `${base}?poolId=${encodeURIComponent(poolId)}&limit=${limit}`;
    const j = await getJson(url).catch(()=>null);
    if (!j) continue;

    const bids = Array.isArray(j?.bids) ? j.bids.map(([p, s]) => [Number(p), Number(s)]) : null;
    const asks = Array.isArray(j?.asks) ? j.asks.map(([p, s]) => [Number(p), Number(s)]) : null;

    if (bids || asks) return { bids, asks, raw: j };
  }
  return null;
}
