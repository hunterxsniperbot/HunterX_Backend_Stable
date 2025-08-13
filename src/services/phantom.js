// src/services/phantom.js — lectura de saldo SOL vía QuickNode RPC
// Requiere:
//   QUICKNODE_URL   -> tu endpoint HTTPS de QuickNode (Solana mainnet)
//   PHANTOM_ADDRESS -> tu address real de Phantom (base58)

import { getPriceUSD } from './prices.js';

const QN_URL = process.env.QUICKNODE_URL || '';
if (!QN_URL) {
  console.warn('⚠️ QUICKNODE_URL no configurado: saldo REAL se mostrará como 0.');
}

async function rpc(method, params = []){
  if (!QN_URL) return null;
  const res = await fetch(QN_URL, {
    method: 'POST',
    headers: { 'content-type':'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params })
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`RPC ${method} error: ${j.error.message||j.error}`);
  return j.result;
}

export async function getSolBalanceLamports(address){
  if (!QN_URL || !address) return 0;
  const r = await rpc('getBalance', [address, { commitment:'confirmed' }]);
  return Number(r?.value || 0);
}

export async function getSolBalanceUSD(address){
  try{
    const lam = await getSolBalanceLamports(address);
    const sol = lam / 1e9;
    const px  = await getPriceUSD('SOL');
    return sol * px;
  }catch{
    return 0;
  }
}

export default { getSolBalanceLamports, getSolBalanceUSD };
