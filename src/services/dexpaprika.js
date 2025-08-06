// src/services/dexpaprika.js

/**
 * fetchDexPaprikaToken
 * Devuelve un objeto con métricas clave de DexPaprika para un mint de Solana.
 * Si falla, devuelve null.
 */
export async function fetchDexPaprikaToken(mintAddress) {
  try {
    const res = await fetch(
      `https://api.dexpaprika.com/networks/solana/tokens/${mintAddress}`
    );
    if (!res.ok) {
      console.warn(`⚠️ DexPaprika HTTP ${res.status} for ${mintAddress}`);
      return null;
    }
    const json = await res.json();
    return {
      priceUsd:   parseFloat(json.priceUsd),
      liquidity: parseFloat(json.liquidityUsd),
      volume24h: parseFloat(json.volumeUsd24h),
      holders:   parseInt(json.holders, 10),
      fdvUsd:    parseFloat(json.fdvUsd)
    };
  } catch (err) {
    console.warn(`⚠️ DexPaprika fetch failed for ${mintAddress}: ${err.message}`);
    return null;
  }
}
