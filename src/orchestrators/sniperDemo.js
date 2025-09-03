import { getSolanaPairs, ageMinutes } from '../services/markets.js';
import { buyDemo } from '../services/demoBank.js';

const CFG = {
  scanLimit: Number(process.env.M4_SCAN_LIMIT || 40),
  maxAgeMin: Number(process.env.M4_MAX_AGE_MIN || 5),
  minLiq:    Number(process.env.M4_MIN_LIQ_USD || 1),
  maxFdv:    Number(process.env.M4_MAX_FDV_USD || 1000000000),
  minVol1m:  Number(process.env.M4_MIN_VOL_1M_USD || 0),
  autoBuy:   process.env.M4_AUTOBUY === '1',
  buyUsd:    Number(process.env.M4_BUY_USD || 20),
};

const seen = new Set();
let lastBuyMs = 0;

function score(p){
  const v = (p.vol_m1_usd || (p.vol_m5_usd/5) || 0);
  const t = (p.txns_m1 || (p.txns_m5/5) || 0);
  const fdv = p.fdvUsd || 1;
  return (v * 1.0) + (t * 50) - (Math.log10(fdv || 1) * 200);
}

function passFilters(p){
  const age = ageMinutes(p);
  if (age !== null && age > CFG.maxAgeMin) return false;
  if (p.liquidityUsd < CFG.minLiq) return false;
  if (p.fdvUsd > CFG.maxFdv && p.fdvUsd > 0) return false;
  const vol1m = (p.vol_m1_usd || (p.vol_m5_usd/5) || 0);
  if (vol1m < CFG.minVol1m) return false;
  return true;
}

export async function demoScanTick(log = true){
  const list = await getSolanaPairs({ limit: CFG.scanLimit, timeoutMs: 2800 });

  if (log) {
    const preview = list.slice(0, 5).map(p => ({
      src: p.source, sym: p.baseSymbol, liq: Math.round(p.liquidityUsd),
      fdv: Math.round(p.fdvUsd), v1m: Math.round(p.vol_m1_usd || (p.vol_m5_usd/5) || 0),
    }));
    console.log('M4 raw:', list.length, preview);
  }

  const filtered = list.filter(passFilters);
  const ranked = filtered.sort((a,b)=> score(b) - score(a));

  if (log) {
    const peek = ranked.slice(0, 5).map(p => ({
      sym: p.baseSymbol, liq: Math.round(p.liquidityUsd),
      fdv: Math.round(p.fdvUsd), v1m: Math.round(p.vol_m1_usd || (p.vol_m5_usd/5) || 0),
      age: ageMinutes(p),
    }));
    console.log('M4 kept:', ranked.length, peek);
  }

  // Autobuy DEMO (apagado por defecto)
  if (CFG.autoBuy && ranked.length){
    const best = ranked.find(p => !seen.has(p.pairAddress || p.baseAddress || p.baseSymbol));
    const now = Date.now();
    if (best && now - lastBuyMs > 10_000){
      const tokenLabel = best.baseSymbol || 'SOL';
      try{
        const price = Math.max(1, best.raw?.priceUsd || best.raw?.price || 100);
        const r = buyDemo({ token: tokenLabel, amountUsd: CFG.buyUsd, priceUsd: price });
        lastBuyMs = now;
        seen.add(best.pairAddress || best.baseAddress || best.baseSymbol);
        console.log(`🟣 [M4] DEMO AUTOBUY ${tokenLabel} $${CFG.buyUsd} — liq=${Math.round(best.liquidityUsd)} fdv=${Math.round(best.fdvUsd)}`);
        return { bought: tokenLabel, cfg: CFG };
      }catch(e){
        console.error('M4 autobuy error:', e?.message||e);
      }
    }
  }
  return { ok:true };
}
