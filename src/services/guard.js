import { enrichMint } from './intel.js';

export async function canBuyToken(candidate) {
  const reasons = [];
  const mint = candidate?.mint || candidate?.mintAddress || null;
  if (!mint) return { ok: false, reasons: ['mint_invalido'] };

  const intel = candidate.__intel || await enrichMint(mint);

  const riskFlags = intel?.risk?.flags || [];
  const riskLevel = intel?.risk?.level || 'unknown';
  if (riskFlags.includes('honeypot_detectado')) reasons.push('honeypot_detectado');
  if (riskFlags.includes('restriccion_venta')) reasons.push('restriccion_venta');

  const liqSol  = Number(intel?.liqSol ?? candidate?.metrics?.liquidity ?? NaN);
  const holders = Number(intel?.holders ?? candidate?.metrics?.holders ?? NaN);
  const fdv     = Number(intel?.fdv ?? candidate?.metrics?.fdv ?? NaN);
  const vol     = Number(intel?.volumeH24 ?? candidate?.metrics?.volume ?? NaN);
  const ageMin  = Number(candidate?.ageMinutes ?? intel?.ageMinutes ?? NaN);

  if (Number.isFinite(liqSol) && liqSol < 75) reasons.push('liquidez_<75_SOL');
  if (Number.isFinite(holders) && holders < 10 && Number.isFinite(ageMin) && ageMin <= 2) {
    reasons.push('holders_<10_en_<=2min');
  }

  const sellTax = Number(intel?.security?.sellTax ?? NaN);
  const buyTax  = Number(intel?.security?.buyTax ?? NaN);
  if (Number.isFinite(sellTax) && sellTax > 12) reasons.push('sell_tax_>12%');
  if (Number.isFinite(buyTax) && buyTax > 12) reasons.push('buy_tax_>12%');

  if (Number.isFinite(fdv) && fdv > 300000 && Number.isFinite(ageMin) && ageMin <= 5) {
    reasons.push('fdv_>300k_en_<=5min');
  }

  if (riskLevel === 'critical' && reasons.length === 0) reasons.push('riesgo_critico');

  return { ok: reasons.length === 0, reasons, intel };
}
