// src/api/dexscreener.js
import fetch from 'node-fetch';

export async function getDexScreenerPairs() {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/pairs/solana', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Respuesta inválida: Content-Type = ${contentType}`);
    }

    const data = await res.json();
    return data.pairs || [];
  } catch (error) {
    console.error('❌ Error al conectar con DexScreener:', error.message);
    return [];
  }
}
