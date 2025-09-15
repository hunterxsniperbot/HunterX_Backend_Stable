
// src/services/pnl.js

export function calcUnrealizedFor(info, currPx){
  const entry = Number(info.entryUsd||0);
  const amountOrig = Number(info.amountUsdOrig ?? info.amountUsd ?? 0);
  const qtyEntry = Number(info.qtyEntry || (entry>0 ? (amountOrig/entry) : 0));
  const remPct  = Number.isFinite(info.remPct) ? info.remPct : 100;

  const qtyRem  = qtyEntry * (remPct/100);
  const costRem = qtyRem * entry;     // costo base del remanente
  const mktRem  = qtyRem * currPx;    // valor de mercado live
  const pnlUsd  = mktRem - costRem;   // no realizado (USD)
  const pnlPct  = entry ? ((currPx - entry)/entry)*100 : 0;

  return { qtyRem, costRem, mktRem, pnlUsd, pnlPct, currPx, entry, remPct };
}

export function aggregateUnrealized(rows){
  return rows.reduce((acc,r)=>{
    acc.totalCost += Number(r.costRem||0);
    acc.totalMkt  += Number(r.mktRem||0);
    acc.totalUsd  += Number(r.pnlUsd||0);
    return acc;
  }, { totalCost:0, totalMkt:0, totalUsd:0, get pct(){ return this.totalCost ? (this.totalUsd/this.totalCost)*100 : 0; }});
}

export function fmtUsd(n){ return (Number(n)||0).toFixed(2); }
export function fmtPx(n){ return (Number(n)||0).toFixed(4); }
export function fmtPct(n){ return (Number(n)||0).toFixed(2); }
export default { calcUnrealizedFor, aggregateUnrealized, fmtUsd, fmtPx, fmtPct };
