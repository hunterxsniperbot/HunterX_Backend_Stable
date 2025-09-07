import { getSolanaPairs } from '../services/marketsPref.js';
import { normalizePair } from '../services/pairNormalize.js';

const ENV = {
  M4_LIMIT: Number(process.env.M4_LIMIT || 50),
  M4_MIN_LIQ_USD: Number(process.env.M4_MIN_LIQ_USD || 150),   // tu regla
  M4_MAX_FDV_USD: Number(process.env.M4_MAX_FDV_USD || 300_000),
};

export async function findM4Candidates(){
  const raw = await getSolanaPairs({ limit: ENV.M4_LIMIT }).catch(()=>[]);
  const arr = Array.isArray(raw) ? raw.map(normalizePair) : [];

  const ok = arr.filter(p =>
    p.baseSymbol !== '?' &&
    (p.priceUsd ?? 0) > 0 &&
    (p.liquidityUsd ?? 0) >= ENV.M4_MIN_LIQ_USD &&
    (p.fdvUsd == null || p.fdvUsd <= ENV.M4_MAX_FDV_USD)
  );

  // orden simple: más liquidez primero, después menor FDV
  ok.sort((a,b) => (b.liquidityUsd??0) - (a.liquidityUsd??0) || (a.fdvUsd??Infinity) - (b.fdvUsd??Infinity));
  return ok;
}
