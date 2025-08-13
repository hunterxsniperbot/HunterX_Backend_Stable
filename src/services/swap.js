// src/services/swap.js — ruteo/cotización simple (fallback precios) + stubs de venta
import { getPriceUSD } from './prices.js';

/**
 * Cotiza la mejor ruta (fallback por precio USD de símbolo).
 * Params: { symbol, mint, qty, percent=100, slippageBps=100 }
 */
export async function quoteBest({ symbol, mint, qty, percent = 100, slippageBps = 100 }) {
  try {
    const sym = (symbol || '').toUpperCase();
    const q   = Number(qty);
    const pct = Number(percent);
    if (!Number.isFinite(q) || q <= 0) return { ok:false, error:'bad_qty' };

    const priceUsd = await getPriceUSD(sym);
    if (!Number.isFinite(priceUsd)) return { ok:false, error:'no_price' };

    const toSell = q * (isNaN(pct) ? 1 : (pct/100));
    const toUSDC = toSell * priceUsd; // USDC ~ USD

    return {
      ok: true,
      source: 'prices',
      route: 'direct',
      symbol: sym,
      priceUsd,
      qty: q,
      percent: pct,
      toUSDC,
      slippageBps: Number(slippageBps) || 100,
    };
  } catch (e) {
    return { ok:false, error: String(e?.message || e) };
  }
}

/**
 * quoteSell: alias que devuelve la misma estructura de quoteBest
 */
export async function quoteSell(params) {
  const r = await quoteBest(params);
  if (!r.ok) return r;
  return { ok:true, ...r };
}

/** Compat para quien llame "quoteToUSDC" */
export function quoteToUSDC(params) { return quoteSell(params); }

/**
 * Venta DEMO: usa la cotización y marca "simulated: true"
 */
export async function sellPercentDemo({ bot, uid, symbol, mint, qty, percent = 100, slippageBps = 100 }) {
  const quote = await quoteSell({ symbol, mint, qty, percent, slippageBps });
  if (!quote.ok) return quote;
  return {
    ok: true,
    simulated: true,
    quote,
    receivedUSDC: quote.toUSDC,
    txid: null,
  };
}

/**
 * Venta REAL (stub por ahora): simula usando la misma cotización
 * Luego reemplazamos por integración Jupiter (instrucciones + firma)
 */
export async function sellPercentReal({ bot, uid, symbol, mint, qty, percent = 100, slippageBps = 100 }) {
  const quote = await quoteSell({ symbol, mint, qty, percent, slippageBps });
  if (!quote.ok) return quote;
  return {
    ok: true,
    simulated: true,
    quote,
    receivedUSDC: quote.toUSDC,
    txid: null,
  };
}

/**
 * sellToUSDC: elige DEMO o REAL según flag "real"
 */
export async function sellToUSDC({ bot, uid, symbol, mint, qty, percent = 100, slippageBps = 100, real = false }) {
  const fn = real ? sellPercentReal : sellPercentDemo;
  return fn({ bot, uid, symbol, mint, qty, percent, slippageBps });
}

/** getBestRoute: devuelve info mínima de la ruta tomada */
export async function getBestRoute(params) {
  const r = await quoteBest(params);
  if (!r.ok) return r;
  return { ok:true, route: r.route, source: r.source, priceUsd: r.priceUsd };
}

/** executeSellPercent: alias a sellToUSDC */
export async function executeSellPercent(params) {
  return sellToUSDC(params);
}

/** Default export con todo lo público */
export default {
  quoteBest,
  quoteSell,
  quoteToUSDC,
  getBestRoute,
  sellPercentDemo,
  sellPercentReal,
  sellToUSDC,
  executeSellPercent,
};
