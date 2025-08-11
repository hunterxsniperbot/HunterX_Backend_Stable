// src/services/markets.js — resolver par/mint (DexScreener) + precio SOL (CoinGecko)
import fetch from 'node-fetch';

/** Precio de SOL en USD (CoinGecko free). */
export async function getSolUsd() {
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { timeout: 7000 }
    );
    const j = await r.json();
    const v = j?.solana?.usd;
    return (typeof v === 'number') ? v : null;
  } catch {
    return null;
  }
}

/**
 * Resuelve info de un par/token en DexScreener: "SOL", "SOL/USDT", "SOL/USDC".
 * Devuelve { symbol, mint, priceUsd, url, metrics{ vol24h, liquidity_usd, holders, fdv, marketcap } } o null.
 */
export async function getTokenInfoFromPair(pair) {
  try {
    let base = String(pair || '').trim();
    let quote = 'USDT';
    if (base.includes('/')) {
      const [b, q] = base.split('/');
      base = (b || '').trim();
      quote = (q || 'USDT').trim();
    }

    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(base + (quote ? '/' + quote : ''))}`;
    const res = await fetch(url, { timeout: 7000 });
    if (!res.ok) throw new Error(`DexScreener status ${res.status}`);
    const data = await res.json();

    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    const solPairs = pairs.filter(p => (p?.chainId || '').toLowerCase() === 'solana');

    if (solPairs.length) {
      const cand = solPairs[0];
      return {
        symbol:   cand.baseToken?.symbol || base.toUpperCase(),
        mint:     cand.baseToken?.address || '',
        priceUsd: cand.priceUsd ? Number(cand.priceUsd) : null,
        url:      cand.url || null,
        metrics: {
          vol24h:        cand.volume?.h24 ?? null,
          liquidity_usd: cand.liquidity?.usd ?? null,
          holders:       cand.holders ?? null,
          fdv:           cand.fdv ?? null,
          marketcap:     cand.marketCap ?? null
        }
      };
    }

    // Fallback tokens sueltos
    const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
    const solTokens = tokens.filter(t => (t?.chainId || '').toLowerCase() === 'solana');
    if (solTokens.length) {
      const t0 = solTokens[0];
      return {
        symbol:   t0.symbol || base.toUpperCase(),
        mint:     t0.address || '',
        priceUsd: null,
        url:      null,
        metrics:  { vol24h: null, liquidity_usd: null, holders: null, fdv: null, marketcap: null }
      };
    }

    // Built-in SOL
    if (base.toUpperCase() === 'SOL') {
      return {
        symbol: 'SOL',
        mint: 'So11111111111111111111111111111111111111112',
        priceUsd: await getSolUsd(),
        url: null,
        metrics: { vol24h: null, liquidity_usd: null, holders: null, fdv: null, marketcap: null }
      };
    }

    return null;
  } catch (err) {
    console.error(`[Markets] Error al resolver par ${pair}:`, err?.message || err);
    return null;
  }
}

// Default por compatibilidad (por si algo usa default).
export default { getSolUsd, getTokenInfoFromPair };
