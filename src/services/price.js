import { bePrice } from './vendors/birdeye.js';
import { dsTokenPairs } from './vendors/dexscreener.js';

export async function getTokenPriceUsd(mint) {
  const b = await bePrice(mint).catch(()=>null);
  if (Number.isFinite(b) && b > 0) return b;
  const pairs = await dsTokenPairs(mint).catch(()=>null);
  const p = Array.isArray(pairs) ? pairs[0] : null;
  return p?.priceUsd ? Number(p.priceUsd) : null;
}
