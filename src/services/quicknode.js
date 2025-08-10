// src/services/quicknode.js — precio y scanner "free-friendly"
// - getPrice(mintOrSymbol): USD
// - scanNewTokens(): tokens nuevos con métricas mínimas (edad, liq SOL, fdv, volumen/min aprox)
// Usa DexScreener (gratis) y, si tenés, Birdeye (PRO) como fallback.
// Listo para integrarse con tu autoSniper.js actual.

import fetch from 'node-fetch';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';

/** Utilidad: fetch JSON con timeout suave */
async function fetchJson(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

/** Precio de SOL (USD) desde CoinGecko (gratis) */
async function getSolUsd() {
  try {
    const j = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const px = Number(j?.solana?.usd);
    return Number.isFinite(px) ? px : null;
  } catch {
    return null;
  }
}

/** Precio por mint/símbolo (USD) */
export async function getPrice(mintOrSymbol) {
  if (!mintOrSymbol) return null;

  // 1) Si me piden SOL, devolveme SOL
  if (mintOrSymbol === SOL_MINT || String(mintOrSymbol).toUpperCase() === 'SOL') {
    return await getSolUsd();
  }

  // 2) DexScreener — tokens/<mintOrSymbol>
  try {
    const j = await fetchJson(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mintOrSymbol)}`
    );
    const pair = j?.pairs?.[0];
    const px = Number(pair?.priceUsd);
    if (Number.isFinite(px)) return px;
  } catch (_) {}

  // 3) Birdeye — si tengo key
  if (BIRDEYE_API_KEY) {
    try {
      const j = await fetchJson(
        `https://public-api.birdeye.so/defi/price?address=${encodeURIComponent(mintOrSymbol)}&chain=solana`,
        { headers: { 'X-API-KEY': BIRDEYE_API_KEY, 'accept': 'application/json' } }
      );
      const px = Number(j?.data?.value);
      if (Number.isFinite(px)) return px;
    } catch (_) {}
  }

  return null;
}

/**
 * Escaneo de tokens nuevos en Solana (free via DexScreener).
 * Devuelve array de candidatos con shape:
 * {
 *   mint: '...', symbol: '...', priceUsd: number,
 *   ageMinutes: number,
 *   metrics: {
 *     liquidity: number (EN SOL),
 *     fdv: number (USD),
 *     holders: number|null,
 *     volume: number (USD/min aprox)
 *   },
 *   url: 'https://dexscreener.com/...'
 * }
 */
export async function scanNewTokens({ maxAgeMin = 10 } = {}) {
  // 1) Traemos últimos pares en Solana
  let data;
  try {
    data = await fetchJson('https://api.dexscreener.com/latest/dex/pairs/solana', {}, 9000);
  } catch {
    return []; // si DexScreener falla, devolvemos vacío (no rompemos el loop)
  }
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  if (!pairs.length) return [];

  // 2) Precio SOL para convertir liq USD → SOL
  const solUsd = await getSolUsd();

  const now = Date.now();
  const out = [];

  for (const p of pairs) {
    try {
      // Filtros básicos: cadena y timestamp de creación
      if (!p?.chainId || String(p.chainId).toLowerCase() !== 'solana') continue;

      const createdAt = Number(p?.pairCreatedAt || p?.createdAt || 0); // ms
      if (!createdAt) continue;

      const ageMin = Math.max(0, (now - createdAt) / 60000);
      if (ageMin > maxAgeMin) continue; // sólo recientes

      // Tomamos el "baseToken" como el token que queremos snipear
      const base = p.baseToken || {};
      const quote = p.quoteToken || {};
      const mint = base.address || null;
      if (!mint) continue;

      // Precio (USD)
      const priceUsd = Number(p?.priceUsd) || Number(p?.priceUsd?.toString?.()) || null;

      // Liquidez: DexScreener da liquidity.usd; convertimos a SOL si tenemos precio SOL
      const liqUsd = Number(p?.liquidity?.usd) || null;
      const liqSol = (Number.isFinite(liqUsd) && Number.isFinite(solUsd) && solUsd > 0)
        ? (liqUsd / solUsd)
        : null;

      // FDV USD
      const fdvUsd = Number(p?.fdv) || null;

      // Volumen aprox USD/min (no hay m1; usamos h24/1440 como aproximación)
      const vol24h = Number(p?.volume?.h24) || null;
      const volUsdMin = (Number.isFinite(vol24h)) ? (vol24h / 1440) : null;

      // Holders — DexScreener no lo expone; lo dejamos null (lo completa intel.js si lo tenés)
      const holders = null;

      out.push({
        mint,
        symbol: base.symbol || (mint.slice(0, 6) + '…'),
        priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
        ageMinutes: ageMin,
        metrics: {
          liquidity: Number.isFinite(liqSol) ? liqSol : null, // EN SOL (clave para tus filtros)
          fdv: Number.isFinite(fdvUsd) ? fdvUsd : null,
          holders,
          volume: Number.isFinite(volUsdMin) ? volUsdMin : null
        },
        url: p?.url || p?.pairUrl || null,
        // guard fields opcionales que otras capas pueden leer:
        pairCreatedAt: createdAt,
        baseToken: base,
        quoteToken: quote
      });
    } catch {
      /* ignorar par malformado */
    }
  }

  return out;
}

// Export default por compatibilidad
export default {
  getPrice,
  scanNewTokens
};
