// test_price_simple.js
import fetch from 'node-fetch';

(async () => {
  const mint = 'So1aNaBoMb11111111111111111111111111111';
  const url  = `https://api.dexscreener.com/latest/dex/solana/${mint}`;
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const text = await res.text();
    console.log('–– raw response ––\n', text.slice(0, 500));  // sólo primeros 500 chars
    if (text.trim().startsWith('{')) {
      const json = JSON.parse(text);
      console.log('✅ priceUsd:', json.pairs?.[0]?.priceUsd);
    } else {
      console.warn('⚠️ No es JSON válido, obtuvo HTML o texto distinto');
    }
  } catch (err) {
    console.error('❌ Fetch falló:', err);
  }
})();
