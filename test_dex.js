// test_dex.js
import fetch from 'node-fetch';

async function main() {
  const mint = 'Es9vMFrzaCERveKiWv8ZF58u5TA3fDCT9J6FmG5h6Xr';  // USDC

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/solana/${mint}`,
      { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    console.log('✅ Dex JSON:', JSON.stringify(json.pairs[0], null, 2));
  } catch (e) {
    console.error('❌ Dex fetch failed:', e.message);
    process.exit(1);
  }
}

main();
