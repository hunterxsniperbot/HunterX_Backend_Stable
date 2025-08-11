// src/services/quicknode.js — precio (DexScreener), scan stub y saldo SOL (QuickNode)
import fetch from 'node-fetch';

// Precio USD por mint o símbolo (DexScreener)
export async function getPrice(mintOrSymbol) {
  try {
    const q = encodeURIComponent(String(mintOrSymbol || '').trim());
    const url = `https://api.dexscreener.com/latest/dex/search?q=${q}`;
    const r = await fetch(url, { timeout: 7000 });
    const j = await r.json();
    const pairs = Array.isArray(j?.pairs) ? j.pairs : [];
    const sol = pairs.find(p => (p?.chainId || '').toLowerCase() === 'solana');
    const price = sol?.priceUsd ? Number(sol.priceUsd) : null;
    return price;
  } catch { return null; }
}

// Stub de escaneo (vos ya lo usás)
export async function scanNewTokens() {
  return []; // dejar así hasta que integres tu QuickNode stream
}

// Saldo de SOL por address (QuickNode RPC)
export async function getSolBalance(address) {
  try {
    if (!process.env.QUICKNODE_RPC_URL) throw new Error('QUICKNODE_RPC_URL missing');
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address, { commitment: 'confirmed' }]
    };
    const r = await fetch(process.env.QUICKNODE_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      timeout: 8000
    });
    const j = await r.json();
    const lamports = Number(j?.result?.value ?? 0);
    return lamports / 1e9;
  } catch (e) {
    console.error('[quicknode.getSolBalance] error:', e?.message || e);
    return null;
  }
}

export default { getPrice, scanNewTokens, getSolBalance };
