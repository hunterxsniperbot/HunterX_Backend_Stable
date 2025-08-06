// src/services/price.js
import fetch from 'node-fetch';

export async function fetchDexscreenerPrice(mint) {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/solana/${mint}`,
      { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return parseFloat(json.pairs?.[0]?.priceUsd) || null;
  } catch {
    return null;
  }
}
