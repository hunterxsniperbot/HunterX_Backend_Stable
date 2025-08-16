// src/services/tuner.js — calcula parámetros por operación (dinámico)
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function liqBand(usd){
  if (usd >= 100_000) return 'XL';
  if (usd >= 50_000)  return 'L';
  if (usd >= 20_000)  return 'M';
  if (usd >= 5_000)   return 'S';
  return 'XS';
}
function priorityFromLatency(p95ConfirmMs){
  if (!Number.isFinite(p95ConfirmMs)) return 30_000;
  if (p95ConfirmMs > 1800) return 200_000;
  if (p95ConfirmMs > 1200) return 120_000;
  if (p95ConfirmMs > 800)  return 80_000;
  return 30_000;
}
/**
 * computeTradeParams(context)
 * context: {
 *   mode, liquidityUSD, poolAgeSec, taxesBps:{buy,sell}, honeypot, tradingOpen, freezeEnabled, mintRenounced,
 *   quoteTimeMs, rpcP95ConfirmMs, volatilityBps1m, spreadBps,
 *   base:{ slippageBps, priorityLamports, skipPreflight, maxPriceImpactBps, jupTimeoutMs }
 * }
 */
export function computeTradeParams(ctx){
  const base = ctx.base || {};
  let slippage = Number(process.env.FASTSELL_SLIPPAGE_BPS || base.slippageBps || 100);
  let priority = Number(process.env.FASTSELL_PRIORITY_LAMPORTS || base.priorityLamports || 30_000);
  let skipPre = String(process.env.FASTSELL_SKIP_PREFLIGHT || base.skipPreflight || 'true')==='true';
  let maxImpact = Number(process.env.AUTOSNIPER_MAX_PRICE_IMPACT_BPS || base.maxPriceImpactBps || 300);
  let jupTimeout = Number(process.env.JUPITER_TIMEOUT_MS || base.jupTimeoutMs || 1200);

  const risky =
    ctx.honeypot ||
    !ctx.tradingOpen ||
    ctx.freezeEnabled ||
    (ctx.taxesBps?.sell ?? 0) > 1000; // 10% sell tax

  const band = liqBand(Number(ctx.liquidityUSD || 0));
  const vol = Number(ctx.volatilityBps1m || 0);
  const spread = Number(ctx.spreadBps || 0);

  if (band === 'XL') slippage = 50;
  else if (band === 'L') slippage = 75;
  else if (band === 'M') slippage = 100;
  else if (band === 'S') slippage = 150;
  else slippage = 200; // XS

  slippage += Math.round(vol * 0.25);
  slippage += Math.round(spread * 0.50);
  if ((ctx.poolAgeSec || 0) < 120) slippage += 25;

  if (risky) { slippage += 50; maxImpact = Math.min(maxImpact, 200); skipPre = false; }
  slippage = clamp(slippage, 40, 300);

  const basePrio = priorityFromLatency(Number(ctx.rpcP95ConfirmMs));
  priority = Math.max(priority, basePrio);
  if (Number(ctx.quoteTimeMs) > 900) priority = Math.max(priority, 120_000);
  if (band === 'XS') priority = Math.max(priority, 150_000);

  if (risky) skipPre = false;
  if (Number(ctx.quoteTimeMs) > 1000) jupTimeout = Math.max(jupTimeout, 1500);

  return {
    slippageBps: slippage,
    priorityLamports: priority,
    skipPreflight: skipPre,
    maxPriceImpactBps: maxImpact,
    jupTimeoutMs: jupTimeout
  };
}
