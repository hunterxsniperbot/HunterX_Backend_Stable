// src/services/marketsMux.js
// Selecciona la primera fuente que devuelva pares válidos, en este orden
// indicado por FEED_SOURCES=gecko,birdeye,raydium,dexscreener (ejemplo).
function trim(s){ return typeof s === 'string' ? s.trim() : s; }
function sanitize(p){
  return { ...p, baseSymbol: trim(p.baseSymbol), quoteSymbol: trim(p.quoteSymbol) };
}

// Reexportá lo demás para no romper imports existentes:
export * from './markets.js';

export async function getSolanaPairs(opts = {}) {
  const order = (process.env.FEED_SOURCES || 'gecko')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  for (const src of order) {
    try {
      let out = [];
      if (src === 'gecko') {
        const { getSolanaPairs: g } = await import('./marketsPref.js'); // tu feed Gecko ya probado
        out = await g(opts);
      } else if (src === 'birdeye') {
        // cuando agregues adapter: src/services/marketsBirdeye.js
        const be = await import('./marketsBirdeye.js');
        out = await be.getSolanaPairs(opts);
      } else if (src === 'raydium' || src === 'dexscreener') {
        // feed clásico (puede tener 429/Cloudflare a veces)
        const orig = await import('./markets.js');
        out = await orig.getSolanaPairs(opts);
      }
      if (Array.isArray(out) && out.length) return out.map(sanitize);
    } catch (e) {
      // console.log('[mux] fuente falla:', src, String(e?.message||e));
      continue; // probá con la siguiente
    }
  }
  return [];
}
