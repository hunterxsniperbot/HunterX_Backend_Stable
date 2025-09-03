export function normalizePair(p){
  const n = {...p};
  n.baseSymbol   = String(p.baseSymbol||'?').trim();
  n.quoteSymbol  = String(p.quoteSymbol||'?').trim();
  n.source       = String(p.source||'unknown').toLowerCase();
  n.dexId        = p.dexId || n.source;
  n.pairAddress  = p.pairAddress || null;

  // numéricos robustos
  const num = (x)=> (x==null ? null : Number(x));
  n.priceUsd     = num(p.priceUsd);
  n.liquidityUsd = num(p.liquidityUsd);
  n.fdvUsd       = num(p.fdvUsd);

  return n;
}
