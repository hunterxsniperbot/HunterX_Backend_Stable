// scripts/testDexScreener.js
import { getDexScreenerPairs } from '../src/api/dexscreener.js';

const main = async () => {
  const pairs = await getDexScreenerPairs();
  console.log(`📊 Tokens encontrados: ${pairs.length}`);
  if (pairs.length) {
    console.log('🔍 Primer token:', pairs[0]);
  }
};

main();
