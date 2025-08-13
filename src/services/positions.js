// src/services/positions.js
import { getPriceUSD } from './prices.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2q9G4YpYxGX4j5Hn7hU3eGz3vAQ';

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtUSD(n){ return '$' + (Number(n||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function round(n,d=4){ const f=Math.pow(10,d); return Math.round(Number(n||0)*f)/f; }

function _normPos(pos, fallbackId){
  const qty = Number(pos.qty ?? pos.amount ?? pos.size ?? 0);
  const sym = pos.symbol || pos.sym || pos.ticker || pos.baseSymbol || 'TOKEN';
  const mint= pos.mint || pos.address || pos.tokenAddress || '';
  const entry = Number(
    pos.entryPriceUsd ?? pos.entry_price_usd ?? pos.buyPriceUsd ??
    (pos.investedUsd && qty ? Number(pos.investedUsd)/qty : 0)
  ) || 0;
  const invested = Number(pos.investedUsd ?? (qty*entry)) || 0;
  const id = pos.id || String(fallbackId);
  const links = pos.links || {};
  return { id, sym, mint, qty, entry, invested, links };
}

export async function valuePosition(pos){
  const price = await getPriceUSD(pos.mint || pos.sym || pos.symbol || pos.ticker || pos.baseSymbol || pos.address || pos.id).catch(()=>null);
  if (!price) return null;
  const now = Number(price);
  const valNow = pos.qty * now;
  const pnlAbs  = valNow - pos.invested;
  const pnlPct  = pos.entry>0 ? ((now - pos.entry)/pos.entry)*100 : 0;
  return { ...pos, now, valNow, pnlAbs, pnlPct };
}

export async function buildMetrics({ storeDemo = [], storeReal = [], max=10 } = {}){
  const demoNorm = storeDemo.map((p,i)=>_normPos(p,'D'+i)).filter(p=>p.qty>0);
  const realNorm = storeReal.map((p,i)=>_normPos(p,'R'+i)).filter(p=>p.qty>0);

  const demoVal = (await Promise.all(demoNorm.map(valuePosition))).filter(Boolean);
  const realVal = (await Promise.all(realNorm.map(valuePosition))).filter(Boolean);

  demoVal.sort((a,b)=>b.valNow-a.valNow);
  realVal.sort((a,b)=>b.valNow-a.valNow);

  const dTop = demoVal.slice(0,max);
  const rTop = realVal.slice(0,max);

  const sum = arr => arr.reduce((a,x)=>a+x,0);
  const demoInvested = sum(demoVal.map(x=>x.invested));
  const realInvested = sum(realVal.map(x=>x.invested));
  const demoNow      = sum(demoVal.map(x=>x.valNow));
  const realNow      = sum(realVal.map(x=>x.valNow));
  const demoPnlAbs   = demoNow-demoInvested;
  const realPnlAbs   = realNow-realInvested;
  const demoPnlPct   = demoInvested>0 ? (demoPnlAbs/demoInvested)*100 : 0;
  const realPnlPct   = realInvested>0 ? (realPnlAbs/realInvested)*100 : 0;

  return {
    demo: { list: dTop, count: demoNorm.length, invested: demoInvested, now: demoNow, pnlAbs: demoPnlAbs, pnlPct: demoPnlPct },
    real: { list: rTop, count: realNorm.length, invested: realInvested, now: realNow, pnlAbs: realPnlAbs, pnlPct: realPnlPct },
    USDC_MINT,
    fmtUSD, esc, round
  };
}
