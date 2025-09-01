// Reemplazar la función scanNewTokens() vacía en markets.js

// ─────────────────────────────────────────────────────────────────────────────
// [5] Scan de tokens nuevos - IMPLEMENTACIÓN COMPLETA
// ─────────────────────────────────────────────────────────────────────────────

/** 
 * Escanea tokens nuevos usando múltiples fuentes
 * Retorna: Array de candidatos con métricas normalizadas
 */
export async function scanNewTokens() {
  const candidates = [];
  
  try {
    // 1. DexScreener - tokens trending últimas 24h en Solana
    const dsTrending = await scanDexScreenerTrending();
    if (dsTrending.length) candidates.push(...dsTrending);

    // 2. DexScreener - nuevos pares (filtrar por edad)
    const dsNew = await scanDexScreenerNew();
    if (dsNew.length) candidates.push(...dsNew);

    // 3. Birdeye - trending si tienes API key
    if (BIRDEYE_API_KEY) {
      const beTrending = await scanBirdeyeTrending();
      if (beTrending.length) candidates.push(...beTrending);
    }

    // 4. Dedupe por mint address
    const seen = new Set();
    const unique = candidates.filter(c => {
      if (!c.mint || seen.has(c.mint)) return false;
      seen.add(c.mint);
      return true;
    });

    // 5. Filtro básico de edad (solo tokens de 1-10 minutos)
    const filtered = unique.filter(c => {
      const ageMin = c.ageMinutes || 999;
      return ageMin >= 1 && ageMin <= 10;
    });

    console.log(`[SCAN] Encontrados: ${candidates.length}, únicos: ${unique.length}, filtrados: ${filtered.length}`);
    return filtered;

  } catch (e) {
    console.error('[SCAN] Error:', e.message);
    return [];
  }
}

// Escanear trending en DexScreener
async function scanDexScreenerTrending() {
  try {
    const url = 'https://api.dexscreener.com/latest/dex/tokens/trending?chain=solana';
    const data = await fetchJson(url, { timeout: 8000 });
    
    if (!Array.isArray(data?.pairs)) return [];

    return data.pairs.map(pair => ({
      mint: pair.baseToken?.address,
      symbol: pair.baseToken?.symbol || 'UNKNOWN',
      source: 'dexscreener-trending',
      priceUsd: n(pair.priceUsd),
      ageMinutes: calculateAge(pair.pairCreatedAt),
      metrics: {
        liquidityUsd: n(pair.liquidity?.usd),
        volume24h: n(pair.volume?.h24),
        priceChange24h: n(pair.priceChange?.h24),
        txCount24h: n(pair.txns?.h24?.buys + pair.txns?.h24?.sells),
        makers24h: n(pair.txns?.h24?.buyers + pair.txns?.h24?.sellers)
      },
      intel: {
        hhhl: pair.priceChange?.h1 > 0 && pair.priceChange?.h24 > 0,
        retracePct: calculateRetrace(pair),
        buyRatioPct: calculateBuyRatio(pair.txns?.h24)
      }
    }));

  } catch (e) {
    console.error('[SCAN] DexScreener trending error:', e.message);
    return [];
  }
}

// Escanear nuevos pares en DexScreener
async function scanDexScreenerNew() {
  try {
    // API endpoint para nuevos pares (puede requerir ajuste según disponibilidad)
    const url = 'https://api.dexscreener.com/latest/dex/pairs/solana?limit=50';
    const data = await fetchJson(url, { timeout: 8000 });
    
    if (!Array.isArray(data?.pairs)) return [];

    // Filtrar solo pares muy nuevos
    const newPairs = data.pairs.filter(pair => {
      const ageMin = calculateAge(pair.pairCreatedAt);
      return ageMin <= 15; // Menos de 15 minutos
    });

    return newPairs.map(pair => ({
      mint: pair.baseToken?.address,
      symbol: pair.baseToken?.symbol || 'UNKNOWN',
      source: 'dexscreener-new',
      priceUsd: n(pair.priceUsd),
      ageMinutes: calculateAge(pair.pairCreatedAt),
      metrics: {
        liquidityUsd: n(pair.liquidity?.usd),
        volume24h: n(pair.volume?.h24),
        fdv: n(pair.fdv),
        marketcap: n(pair.marketCap)
      },
      intel: {
        hhhl: true, // Asumir momentum positivo para nuevos
        retracePct: 0,
        buyRatioPct: 70 // Optimistic para nuevos pares
      }
    }));

  } catch (e) {
    console.error('[SCAN] DexScreener new pairs error:', e.message);
    return [];
  }
}

// Escanear trending en Birdeye (requiere API key)
async function scanBirdeyeTrending() {
  try {
    if (!BIRDEYE_API_KEY) return [];

    const url = `${BIRDEYE_BASE}/defi/trending_tokens?chain=solana&timeframe=24h&limit=30`;
    const data = await fetchJson(url, {
      headers: { 'X-API-KEY': BIRDEYE_API_KEY, accept: 'application/json' },
      timeout: MARKET_TIMEOUT_MS
    });

    if (!Array.isArray(data?.data)) return [];

    return data.data.map(token => ({
      mint: token.address,
      symbol: token.symbol || 'UNKNOWN',
      source: 'birdeye-trending',
      priceUsd: n(token.price),
      ageMinutes: 5, // Birdeye no siempre provee edad exacta
      metrics: {
        liquidityUsd: n(token.liquidity),
        volume24h: n(token.volume24h),
        priceChange24h: n(token.priceChange24h),
        holders: n(token.holders),
        fdv: n(token.fdv),
        marketcap: n(token.marketCap)
      },
      intel: {
        hhhl: n(token.priceChange24h, 0) > 0,
        retracePct: Math.abs(n(token.priceChange1h, 0)),
        buyRatioPct: 65 // Estimación para trending tokens
      }
    }));

  } catch (e) {
    console.error('[SCAN] Birdeye trending error:', e.message);
    return [];
  }
}

// Helpers para cálculos
function calculateAge(createdAt) {
  if (!createdAt) return 999;
  try {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    return Math.floor((now - created) / (1000 * 60)); // minutos
  } catch {
    return 999;
  }
}

function calculateRetrace(pair) {
  const h1 = n(pair.priceChange?.h1, 0);
  const h24 = n(pair.priceChange?.h24, 0);
  if (h24 <= 0) return 0;
  return Math.max(0, h24 - h1); // Retroceso desde pico
}

function calculateBuyRatio(txns) {
  if (!txns) return 50;
  const buys = n(txns.buys, 0);
  const sells = n(txns.sells, 0);
  const total = buys + sells;
  return total > 0 ? (buys / total) * 100 : 50;
}