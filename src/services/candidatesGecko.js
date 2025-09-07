// src/services/candidatesGecko.js — Discovery a partir de Gecko (sin mints)
import { getSolanaPairs } from './marketsPref.js';

const toNum = v => (typeof v === 'number' ? v : Number(v || 0));

export async function discoverTop({ limit = Number(process.env.DISC_LIMIT || 40) } = {}) {
  const rows = await getSolanaPairs({ limit });

  const minLiq   = Number(process.env.CAND_MIN_LIQ_USD || 20000);
  const maxFdv   = Number(process.env.CAND_MAX_FDV_USD || 300000);
  const minPrice = Number(process.env.CAND_MIN_PRICE_USD || 0);
  const quoteOK  = String(process.env.CAND_QUOTE || 'SOL').toUpperCase();
  const topN     = Number(process.env.CAND_TOP || 8);

  const out = rows
    .map(p => ({
      source: p.source,
      pairAddress: p.pairAddress,
      sym: String(p.baseSymbol || '').trim().replace(/\s+/g, ''), // compactar
      quote: String((p.quoteSymbol || '').replace(/\s+/g, '')).toUpperCase(),
      priceUsd: toNum(p.priceUsd),
      liqUsd:   toNum(p.liquidityUsd),
      fdvUsd:   toNum(p.fdvUsd),
    }))
    // filtros básicos
    .filter(x => x.quote === quoteOK)
    .filter(x => x.sym.length > 0)
    .filter(x => x.liqUsd >= minLiq && x.fdvUsd > 0 && x.fdvUsd <= maxFdv && x.priceUsd >= minPrice)
    // ranking por liquidez (más robusto al principio)
    .sort((a, b) => b.liqUsd - a.liqUsd)
    .slice(0, topN);

  return out;
}

export default { discoverTop };
