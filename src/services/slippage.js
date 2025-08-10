import { jupGetQuote, jupPriceImpact } from './vendors/jupiter.js';
import { getSolUsd } from './intel.js';

const ENV_MIN = Number(process.env.SLIPPAGE_MIN_BPS || 30);    // 0.30%
const ENV_MAX = Number(process.env.SLIPPAGE_MAX_BPS || 1200);  // 12.00%

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

export async function computeDynamicSlippageBps(bot, cand, { amountUsd, solUsd }) {
  const amt = Number(amountUsd || 50);
  const solPrice = Number(solUsd || await getSolUsd());

  let bps = 50; // 0.50%

  const age = Number(cand?.ageMinutes ?? NaN);
  const liqSol = Number(cand?.metrics?.liquidity ?? NaN);
  const vol = Number(cand?.metrics?.volume ?? NaN);

  if (Number.isFinite(age)) {
    if (age < 2) bps += 20;
    else if (age <= 5) bps += 10;
  }
  if (Number.isFinite(liqSol)) {
    if (liqSol < 150) bps += 20;
    else if (liqSol > 500) bps -= 10;
  }
  if (Number.isFinite(vol) && Number.isFinite(liqSol) && liqSol > 0) {
    const vPerSol = vol / liqSol;
    if (vPerSol > 30) bps += 30;
    else if (vPerSol > 10) bps += 15;
  }

  try {
    const amountSol = amt / solPrice;
    const quote = await jupGetQuote({
      inputMint: SOL_MINT,
      outputMint: cand.mint || cand.mintAddress,
      amountUi: amountSol,
      slippageBps: clamp(bps, ENV_MIN, ENV_MAX)
    });
    const route = quote?.routes?.[0] || null;
    const impactPct = jupPriceImpact(route);
    if (impactPct !== null) {
      if (impactPct > 1.0) bps += 30;
      else if (impactPct < 0.3) bps -= 10;
    }
  } catch (_) {}

  try {
    if (bot?.ai && typeof bot.ai.suggestSlippageBps === 'function') {
      const aiBps = await bot.ai.suggestSlippageBps({
        ageMinutes: age, liqSol, volume: vol, amountUsd: amt
      });
      if (Number.isFinite(aiBps)) bps = aiBps;
    }
  } catch (_) {}

  return clamp(bps, ENV_MIN, ENV_MAX);
}
