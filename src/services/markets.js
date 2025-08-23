// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — Markets DataRouter — HX-MKT-01 — v2025-08-19 (ESM)
// Secciones:
//   [1] ENV / Constantes
//   [2] Helpers (fetch JSON con timeout, normalizadores)
//   [3] Proveedores: DexScreener, Birdeye, CoinGecko (SOL)
//   [4] Router: getPrice (primario/fallback), getTokenInfoFromPair
//   [5] Stubs seguros (scanNewTokens)
// Exports: getDexScreener, getBirdeye, getPrice, getSolUsd, getTokenInfoFromPair, scanNewTokens
//
// Notas:
//   • MARKET_PRIMARY: 'birdeye' | 'dexscreener'  (default: 'dexscreener')
//   • BIRDEYE_API_KEY requerido para usar Birdeye
//   • Todos los campos devueltos son best-effort; faltantes → null
//   • Diseñado para no romper: si falla un proveedor, degrada suave
// ─────────────────────────────────────────────────────────────────────────────

import fetch from 'node-fetch';

// ─────────────────────────────────────────────────────────────────────────────
// [1] ENV / Constantes
// ─────────────────────────────────────────────────────────────────────────────
const MARKET_PRIMARY     = (process.env.MARKET_PRIMARY || 'dexscreener').toLowerCase();
const MARKET_TIMEOUT_MS  = Number(process.env.MARKET_TIMEOUT_MS || 6000);

const BIRDEYE_API_KEY    = process.env.BIRDEYE_API_KEY || '';
const BIRDEYE_BASE       = process.env.BIRDEYE_BASE || 'https://public-api.birdeye.so';

const COINGECKO_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
const SOL_MINT            = 'So11111111111111111111111111111111111111112';

// ─────────────────────────────────────────────────────────────────────────────
// [2] Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function fetchJson(url, { timeout = MARKET_TIMEOUT_MS, headers = {} } = {}) {
  try {
    const r = await fetch(url, { timeout, headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    return null;
  }
}

function n(x, d = null) {
  const v = Number(x);
  return Number.isFinite(v) ? v : d;
}
function pickFirst(...vals) {
  for (const v of vals) if (v != null) return v;
  return null;
}

// Normaliza estructura “token metrics” a un shape común
function normalizeToken({ symbol, mint, priceUsd, url, raw = {}, source = 'unknown' }) {
  return {
    source,
    symbol: symbol || null,
    mint: mint || null,
    priceUsd: n(priceUsd, null),
    url: url || null,
    // Métricas best-effort (pueden venir faltantes en cada proveedor)
    liquidityUsd: n(raw.liquidityUsd ?? raw.liquidity_usd ?? raw.liquidity, null),
    spreadPct: n(raw.spreadPct ?? raw.spread_pct ?? raw.spread, null),
    vol5m: n(raw.vol5m ?? raw.volume5m ?? raw.vol_5m, null),
    txPerMin: n(raw.txPerMin ?? raw.tpm, null),
    uniqueBuyersMin: n(raw.uniqueBuyersMin ?? raw.ubuy, null),
    holders: n(raw.holders ?? raw.holder ?? raw.holdersCount, null),
    fdv: n(raw.fdv ?? raw.fdvUsd ?? raw.fdv_usd, null),
    marketcap: n(raw.marketcap ?? raw.marketCap ?? raw.mcap, null),
    lpLockOrBurnPct: n(raw.lpLockOrBurnPct ?? raw.lp_lock_pct ?? raw.lp_burn_pct, null),
    _raw: raw, // por si querés debuggear luego
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [3] Proveedores
// ─────────────────────────────────────────────────────────────────────────────

// 3.1 — CoinGecko (precio de SOL en USD)
export async function getSolUsd() {
  try {
    const j = await fetchJson(COINGECKO_PRICE_URL, { timeout: 7000 });
    const v = j?.solana?.usd;
    return (typeof v === 'number') ? v : null;
  } catch {
    return null;
  }
}

// 3.2 — DexScreener (token/pair info)
export async function getDexScreener(mintOrQuery) {
  try {
    const q = String(mintOrQuery || '').trim();
    const looksLikeAddress = q.length > 25; // heurística simple

    // a) Por token address directo (más preciso)
    if (looksLikeAddress) {
      const urlTok = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(q)}`;
      const data = await fetchJson(urlTok);
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      const solPairs = pairs.filter(p => (p?.chainId || '').toLowerCase() === 'solana');
      if (solPairs.length) {
        const cand = solPairs[0];
        return normalizeToken({
          source: 'dexscreener',
          symbol: cand.baseToken?.symbol,
          mint: cand.baseToken?.address,
          priceUsd: n(cand.priceUsd, null),
          url: cand.url,
          raw: {
            liquidityUsd: cand.liquidity?.usd,
            // Algunos campos no existen en DS; dejar null si no hay
          }
        });
      }
    }

    // b) Por búsqueda “base/quote” o símbolo
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
    const data = await fetchJson(url);
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    const solPairs = pairs.filter(p => (p?.chainId || '').toLowerCase() === 'solana');
    if (solPairs.length) {
      const cand = solPairs[0];
      return normalizeToken({
        source: 'dexscreener',
        symbol: cand.baseToken?.symbol || q.toUpperCase(),
        mint: cand.baseToken?.address || '',
        priceUsd: n(cand.priceUsd, null),
        url: cand.url || null,
        raw: {
          liquidityUsd: cand.liquidity?.usd,
        }
      });
    }

    // c) SOL built-in
    if (q.toUpperCase() === 'SOL') {
      return normalizeToken({
        source: 'dexscreener',
        symbol: 'SOL',
        mint: SOL_MINT,
        priceUsd: await getSolUsd(),
        url: null,
        raw: {}
      });
    }

    return null;
  } catch {
    return null;
  }
}

// 3.3 — Birdeye (requiere API Key)
export async function getBirdeye(mintOrQuery) {
  try {
    if (!BIRDEYE_API_KEY) return null;
    const q = String(mintOrQuery || '').trim();
    const looksLikeAddress = q.length > 25;
    if (!looksLikeAddress) return null; // Birdeye trabaja mejor por address

    // Overview (liquidez, holders, etc.)
    const ovUrl = `${BIRDEYE_BASE}/defi/token_overview?chain=solana&address=${encodeURIComponent(q)}`;
    const ov = await fetchJson(ovUrl, {
      headers: { 'X-API-KEY': BIRDEYE_API_KEY, accept: 'application/json' },
      timeout: MARKET_TIMEOUT_MS
    });

    // Precio (algunos planes lo traen en overview; si no, pedirlo aparte)
    let priceUsd = n(ov?.data?.price, null);
    if (priceUsd == null) {
    const pUrl = `${BIRDEYE_BASE}/public/price?address=${encodeURIComponent(q)}`;
    const p = await fetchJson(pUrl, {
    headers: { 'X-API-KEY': BIRDEYE_API_KEY, accept: 'application/json' },
    timeout: MARKET_TIMEOUT_MS
    });
    priceUsd = n(p?.data?.value, null);
    }

    // Intentar símbolo desde overview (si existe)
    const symbol =
      ov?.data?.symbol ||
      ov?.data?.name ||
      (q === SOL_MINT ? 'SOL' : null);

    return normalizeToken({
      source: 'birdeye',
      symbol,
      mint: q,
      priceUsd,
      url: null,
      raw: {
        liquidityUsd: ov?.data?.liquidity,
        holders: ov?.data?.holders,
        fdvUsd: ov?.data?.fdv,
        marketcap: ov?.data?.marketCap,
        // spread/vol/tpm tal vez no estén disponibles en tu plan
      }
    });
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [4] Router & compat
// ─────────────────────────────────────────────────────────────────────────────

// Precio USD por mint (primario/fallback → Number | null)
export async function getPrice(mintOrQuery) {
  // 1) Primario
  if (MARKET_PRIMARY === 'birdeye') {
    const be = await getBirdeye(mintOrQuery);
    if (n(be?.priceUsd, null) != null) return n(be.priceUsd, null);
    const ds = await getDexScreener(mintOrQuery);
    if (n(ds?.priceUsd, null) != null) return n(ds.priceUsd, null);
  } else {
    // 'dexscreener' por defecto
    const ds = await getDexScreener(mintOrQuery);
    if (n(ds?.priceUsd, null) != null) return n(ds.priceUsd, null);
    const be = await getBirdeye(mintOrQuery);
    if (n(be?.priceUsd, null) != null) return n(be.priceUsd, null);
  }

  // 2) Fallback específico para SOL
  if (String(mintOrQuery).toUpperCase() === 'SOL' || String(mintOrQuery) === SOL_MINT) {
    return await getSolUsd();
  }
  return null;
}

/**
 * Compat: resolver par/símbolo “SOL”, “SOL/USDT”… usando DexScreener (como antes).
 * Devuelve:
 *   { symbol, mint, priceUsd, url, metrics:{vol24h, liquidity_usd, holders, fdv, marketcap} } | null
 */
export async function getTokenInfoFromPair(pair) {
  try {
    const info = await getDexScreener(pair);
    if (!info) {
      // Fallback mínimo para SOL
      if (String(pair || '').toUpperCase() === 'SOL') {
        return {
          symbol: 'SOL',
          mint: SOL_MINT,
          priceUsd: await getSolUsd(),
          url: null,
          metrics: { vol24h: null, liquidity_usd: null, holders: null, fdv: null, marketcap: null }
        };
      }
      return null;
    }
    return {
      symbol: info.symbol,
      mint: info.mint,
      priceUsd: info.priceUsd,
      url: info.url,
      metrics: {
        vol24h: null, // DexScreener search no siempre trae estos campos
        liquidity_usd: info.liquidityUsd,
        holders: info.holders,
        fdv: info.fdv,
        marketcap: info.marketcap
      }
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [5] Stubs seguros (para no romper si alguien llama)
// ─────────────────────────────────────────────────────────────────────────────
/** Escaneo de candidatos (por ahora sin implementación → lista vacía). */
export async function scanNewTokens() {
  return [];
}

// Default por compatibilidad
export default {
  getDexScreener,
  getBirdeye,
  getPrice,
  getSolUsd,
  getTokenInfoFromPair,
  scanNewTokens,
};
