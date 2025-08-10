// src/services/vendors/dexscreener.js
// Cliente ESM para DexScreener (free). Provee utilidades para:
// - listar pares recientes de Solana
// - obtener pares por mint/token
// - normalizar datos y elegir el mejor par por liquidez
// - obtener precio USD de un mint con fallback al mejor par
//
// Nota: DexScreener no requiere API key. Usamos fetch nativo de Node≥18.
// Si tu Node es <18, instalá 'node-fetch' y haz: import fetch from 'node-fetch'

const DEX_BASE = 'https://api.dexscreener.com/latest/dex';

// ——— helpers ———
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJSON(url, { timeout = 4000, retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: ctrl.signal
      });
      clearTimeout(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(id);
      if (i === retries) throw e;
      await sleep(200 + 150 * i); // pequeño backoff
    }
  }
}

// ——— normalización de pares ———
export function dsNormalizePair(p) {
  if (!p) return null;
  const base = p.baseToken || {};
  return {
    chainId:        p.chainId || 'solana',
    pairAddress:    p.pairAddress || null,
    mint:           base.address || p.pairAddress || null,
    symbol:         base.symbol || 'TOKEN',
    url:            p.url || null,
    // métricas directas
    priceUsd:       (p.priceUsd != null) ? Number(p.priceUsd) : null,
    liquidityUsd:   (p.liquidity?.usd != null) ? Number(p.liquidity.usd) : null,
    volumeH24:      (p.volume?.h24 != null) ? Number(p.volume.h24) : null,
    fdv:            (p.fdv != null) ? Number(p.fdv) : null,
    pairCreatedAt:  (p.pairCreatedAt != null) ? Number(p.pairCreatedAt) : null,
  };
}

// elegir el par con mayor liquidez USD (si hay)
export function dsBestPairByLiquidity(pairs = []) {
  let best = null;
  for (const p of pairs) {
    const n = dsNormalizePair(p);
    if (!n) continue;
    if (!best || (Number(n.liquidityUsd || 0) > Number(best.liquidityUsd || 0))) {
      best = n;
    }
  }
  return best;
}

// ——— listas ———

// Últimos pares en Solana (crudos)
export async function dsPairsSolanaRaw() {
  const j = await getJSON(`${DEX_BASE}/pairs/solana`);
  return Array.isArray(j?.pairs) ? j.pairs : [];
}

// Últimos pares en Solana (normalizados) — acepta limit
export async function dsPairsSolana({ limit = 100 } = {}) {
  const raw = await dsPairsSolanaRaw();
  const out = [];
  for (const p of raw.slice(0, limit)) {
    const n = dsNormalizePair(p);
    if (n?.mint) out.push(n);
  }
  return out;
}

// Pares por token/mint (crudos)
export async function dsTokenPairsRaw(mint) {
  if (!mint) return [];
  const j = await getJSON(`${DEX_BASE}/tokens/solana/${mint}`);
  return Array.isArray(j?.pairs) ? j.pairs : [];
}

// Pares por token/mint (normalizados)
export async function dsTokenPairs(mint) {
  const raw = await dsTokenPairsRaw(mint);
  return raw.map(dsNormalizePair).filter(Boolean);
}

// ——— precio por mint ———

// Devuelve { priceUsd, pair } usando el mejor par por liquidez
export async function dsGetPriceForMint(mint) {
  const pairs = await dsTokenPairs(mint);
  if (!pairs.length) return { priceUsd: null, pair: null };
  const best = dsBestPairByLiquidity(pairs) || pairs[0];
  return { priceUsd: best.priceUsd ?? null, pair: best };
}

// ——— escaneo de recientes ———

// Atajo para “escaneo”: devuelve últimos pares normalizados (para tu autosniper)
export async function dsScanRecentSolana({ limit = 50 } = {}) {
  const list = await dsPairsSolana({ limit });
  return list; // ya normalizados con campos: mint, symbol, priceUsd, liquidityUsd, volumeH24, fdv, pairCreatedAt, url
}

// ——— caché simple (reduce llamadas repetidas) ———
const cache = {
  tokenPairs: new Map(), // mint -> { ts, data }
  ttl: 10_000,           // 10s
};

export async function dsTokenPairsCached(mint) {
  const now = Date.now();
  const hit = cache.tokenPairs.get(mint);
  if (hit && (now - hit.ts) < cache.ttl) return hit.data;
  const data = await dsTokenPairs(mint);
  cache.tokenPairs.set(mint, { ts: now, data });
  return data;
}
