// src/commands/demoBuyOnce.js
import { buyDemo, getState } from '../services/demoBank.js';

async function getSolPriceUsd(){
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const j = await r.json();
    const p = Number(j?.solana?.usd);
    return Number.isFinite(p) ? p : 100; // fallback
  } catch { return 100; }                 // fallback
}

export async function runOnce({ token='SOL', amountUsd=20 }={}){
  const price = await getSolPriceUsd();
  const pos = buyDemo({ token, amountUsd, priceUsd: price });
  const state = getState();
  return { ok:true, token, amountUsd, priceUsd: price, qty: pos.qty, state };
}

// Ejecutable por CLI: node src/commands/demoBuyOnce.js 25
if (process.argv[1]?.endsWith('demoBuyOnce.js')){
  const amount = Number(process.argv[2] || 20);
  runOnce({ amountUsd: amount }).then(r=>{
    console.log(JSON.stringify(r, null, 2));
  }).catch(e=>{
    console.error('ERR', e?.message||e);
    process.exit(1);
  });
}
