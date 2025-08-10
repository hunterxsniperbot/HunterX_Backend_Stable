// src/services/intel.js
// Inteligencia de mercado para HunterX (ESM, completo y tolerante a fallos)
// - Precio SOL con fallback (CMC -> CoinGecko -> valor fijo)
// - Escaneo de pares recientes (DexScreener)
// - Enriquecimiento por mint (DexScreener + Birdeye + GoPlus + señales externas)
// - Precio por token con fallback (Birdeye -> DexScreener)
// - Señales externas: Whale Alert / Discord (opcionales, no auto-ejecutan)
// - Cache y timeouts suaves

import { cgSimplePrice } from './vendors/coingecko.js';
import { cmcSolPrice } from './vendors/coinmarketcap.js';
import {
  dsScanRecentSolana,
  dsTokenPairs,
  dsGetPriceForMint,
} from './vendors/dexscreener.js';
import {
  bePrice,
  beTokenOverview,
  beTopHolders,
} from './vendors/birdeye.js';
import {
  gpTokenSecuritySolana,
  evaluateRisks,
} from './vendors/goplus.js';

// Señales externas (opcionales)
let getSignal = null, pushSignal = null;
try {
  ({ getSignal, pushSignal } = await import('./feeds.js'));
} catch { getSignal = null; pushSignal = null; }

// Opcional: integradores de señales externas (no obligatorios)
let waFetchLargeTransfers = null, eventToSignal = null;
try {
  ({ waFetchLargeTransfers, eventToSignal } = await import('./vendors/whalealert.js'));
} catch { /* opcional */ }

let fetchDiscordJSON = null, parseMintsFromText = null;
try {
  ({ fetchDiscordJSON, parseMintsFromText } = await import('./vendors/discord.js'));
} catch { /* opcional */ }

// ————— Helpers —————
const cache = {
  solUsd: { val: null, ts: 0, ttl: 60_000 },     // 1 min
  intel:  new Map(),                              // mint -> { val, ts }
  intelTTL: 30_000,                               // 30s
  price:  new Map(),                              // mint -> { val, ts }
  priceTTL: 10_000,                               // 10s
  scan:   { list: null, ts: 0, ttl: 10_000 },     // escaneo reciente
};

const num = (v) => (v === null || v === undefined) ? null : Number(v);
const minutesSince = (tsMs) =>
  tsMs ? Math.max(0, Math.round((Date.now() - Number(tsMs)) / 60000)) : null;

// ————— Precio SOL (CMC -> CG -> fijo) —————
export async function getSolUsd() {
  const now = Date.now();
  if (cache.solUsd.val && (now - cache.solUsd.ts) < cache.solUsd.ttl) {
    return cache.solUsd.val;
  }
  let out = null;
  try { out = await cmcSolPrice(); } catch { out = null; }
  if (!out) {
    try {
      const cg = await cgSimplePrice(['solana'], 'usd');
      out = Number(cg?.solana?.usd ?? NaN) || null;
    } catch { out = null; }
  }
  if (!out) out = 170; // fallback fijo si TODO falla
  cache.solUsd = { val: out, ts: now, ttl: 60_000 };
  return out;
}

// ————— Precio por token (Birdeye -> DexScreener) —————
export async function getTokenPriceUsd(mint) {
  if (!mint) return null;
  const now = Date.now();
  const hit = cache.price.get(mint);
  if (hit && (now - hit.ts) < cache.priceTTL) return hit.val;

  let price = null;
  try { price = await bePrice(mint); } catch { price = null; }
  if (!price) {
    try {
      const { priceUsd } = await dsGetPriceForMint(mint);
      price = priceUsd || null;
    } catch { price = null; }
  }

  cache.price.set(mint, { val: price, ts: now });
  return price;
}

// ————— Escaneo de pares recientes (DexScreener) —————
export async function scanRecentPairs({ limit = 50 } = {}) {
  const now = Date.now();
  if (cache.scan.list && (now - cache.scan.ts) < cache.scan.ttl) {
    return cache.scan.list.slice(0, limit);
  }
  let list = [];
  try {
    const ds = await dsScanRecentSolana({ limit: Math.max(limit, 100) });
    list = (ds || []).map(p => ({
      mint: p.mint,
      symbol: p.symbol || 'TOKEN',
      url: p.url || null,
      pairCreatedAt: num(p.pairCreatedAt),
      ageMinutes: minutesSince(p.pairCreatedAt),
      priceUsd: num(p.priceUsd),
      liquidityUsd: num(p.liquidityUsd),
      volumeH24: num(p.volumeH24),
      fdv: num(p.fdv),
    })).filter(x => !!x.mint);
  } catch {
    list = [];
  }
  cache.scan = { list, ts: now, ttl: 10_000 };
  return list.slice(0, limit);
}

// ————— Enriquecimiento por mint —————
export async function enrichMint(mint) {
  if (!mint) return null;

  const now = Date.now();
  const hit = cache.intel.get(mint);
  if (hit && (now - hit.ts) < cache.intelTTL) return hit.val;

  // Llamadas en paralelo (tolerantes a error)
  const [pairs, ov, priceBird, secRaw, topH] = await Promise.all([
    (async () => { try { return await dsTokenPairs(mint); } catch { return null; } })(),
    (async () => { try { return await beTokenOverview(mint); } catch { return null; } })(),
    (async () => { try { return await bePrice(mint); } catch { return null; } })(),
    (async () => { try { return await gpTokenSecuritySolana(mint); } catch { return null; } })(),
    (async () => { try { return await beTopHolders(mint, 5); } catch { return null; } })(),
  ]);

  // Mejor par por liquidez (DexScreener)
  const pair0 = Array.isArray(pairs) && pairs.length ? pairs[0] : null;
  const priceDs = pair0?.priceUsd ? Number(pair0.priceUsd) : null;
  const url = pair0?.url || null;
  const pairCreatedAt = pair0?.pairCreatedAt || null;

  // Precio final
  const priceUsd = num(priceBird) || num(priceDs) || null;

  // Liquidez / FDV / Holders (preferimos Birdeye si viene)
  const solUsd = await getSolUsd().catch(() => null);
  let liquidityUsd = null;
  if (ov?.liquidity != null) liquidityUsd = Number(ov.liquidity);
  else if (pair0?.liquidityUsd != null) liquidityUsd = Number(pair0.liquidityUsd);
  const liqSol = (Number.isFinite(liquidityUsd) && liquidityUsd && solUsd)
    ? liquidityUsd / solUsd
    : null;

  const fdv = num(ov?.fdv) || num(pair0?.fdv) || null;
  const holders = num(ov?.holders) || null;
  const volumeH24 = num(ov?.v24hUSD) || num(pair0?.volumeH24) || null;

  // Seguridad (GoPlus)
  const security = secRaw || null;
  const risk = security ? evaluateRisks(security) : { flags: [], level: 'unknown' };

  // Señal externa (whales/discord), si existe feeds.js
  let signal = null;
  if (typeof getSignal === 'function') {
    try { signal = getSignal(mint); } catch { signal = null; }
  }

  const out = {
    mint,
    symbol: pair0?.symbol || null,
    priceUsd,
    liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : null,
    liqSol: Number.isFinite(liqSol) ? liqSol : null,
    fdv,
    holders,
    volumeH24,
    url,
    pairCreatedAt,
    security,          // objeto normalizado de GoPlus (o null)
    risk,              // { flags:[], level:'ok|warning|critical|unknown' }
    topHolders: topH || null,
    solUsd: solUsd || null,
    signal: signal || { score: 0, source: null, ts: 0 },
    ts: Date.now(),
  };

  cache.intel.set(mint, { val: out, ts: now });
  return out;
}

// ————— Lote —————
export async function enrichMintsBatch(mints = []) {
  const out = [];
  for (const m of mints) {
    try { out.push(await enrichMint(m)); }
    catch { out.push(null); }
  }
  return out.filter(Boolean);
}

// ————— Señales externas (opcionales, NO auto-ejecutan) —————

// Whale Alert → empuja señales al buffer (feeds.js)
export async function refreshSignalsFromWhales({ windowSec = 60, minUsd = 25000 } = {}) {
  if (!waFetchLargeTransfers || !eventToSignal) return 0;
  const now = Math.floor(Date.now() / 1000);
  const evts = await waFetchLargeTransfers({
    start: now - windowSec,
    end: now,
    minUsd,
    blockchain: 'solana',
  }).catch(() => []);
  let pushed = 0;
  for (const e of evts) {
    const r = eventToSignal(e);
    if (r) pushed++;
  }
  return pushed;
}

// Discord feed JSON → empuja señales si encuentra mints en los textos
export async function refreshSignalsFromDiscord() {
  if (!fetchDiscordJSON || !parseMintsFromText || !pushSignal) return 0;
  const arr = await fetchDiscordJSON().catch(() => null);
  if (!Array.isArray(arr)) return 0;
  let pushed = 0;
  for (const m of arr) {
    const text = String(m?.content || '');
    const mints = parseMintsFromText(text);
    for (const mint of mints) {
      pushSignal({ mint, score: 1, source: 'discord' });
      pushed++;
    }
  }
  return pushed;
}
