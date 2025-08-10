// src/services/vendors/birdeye.js
// Cliente ESM para Birdeye (free/pro). Necesita BIRDEYE_API_KEY en .env
// Endpoints usados:
//  - /defi/price                → precio en USD
//  - /defi/token_overview       → holders, fdv, liquidity, vol
//  - /defi/holders              → top holders (lista)
//  - /defi/trades               → últimos trades (útil para detectar dumps/whales)

const BIRD = 'https://public-api.birdeye.so';
const KEY  = process.env.BIRDEYE_API_KEY || '';

function ensureKey() {
  if (!KEY) throw new Error('BIRDEYE_API_KEY no configurada en .env');
}

function withTimeout(promise, ms = 4000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

async function get(path, params = {}, { timeout = 4000 } = {}) {
  ensureKey();
  const u = new URL(BIRD + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  const r = await withTimeout(fetch(u, {
    headers: { 'X-API-KEY': KEY, accept: 'application/json' }
  }), timeout);
  if (!r.ok) throw new Error(`birdeye ${r.status} ${path}`);
  return r.json();
}

// --------- Funciones públicas ---------

// Precio USD actual del token (number | null)
export async function bePrice(mint) {
  if (!KEY) return null;
  if (!mint) return null;
  const j = await get('/defi/price', { address: mint }).catch(() => null);
  const v = j?.data?.value;
  return (typeof v === 'number') ? v : Number(v || 0) || null;
}

// Overview: holders, fdv, liquidity, vol 24h, etc. (obj | null)
export async function beTokenOverview(mint) {
  if (!KEY) return null;
  if (!mint) return null;
  const j = await get('/defi/token_overview', { address: mint }).catch(() => null);
  return j?.data || null;
}

// Top holders (array | null) – limit típico 10–50
export async function beTopHolders(mint, limit = 10) {
  if (!KEY) return null;
  if (!mint) return null;
  const j = await get('/defi/holders', { address: mint, limit }).catch(() => null);
  return j?.data?.items || null;
}

// Últimos trades (array | null) – útil para detectar dumps/whales
export async function beRecentTrades(mint, limit = 50) {
  if (!KEY) return null;
  if (!mint) return null;
  const j = await get('/defi/trades', { address: mint, limit }).catch(() => null);
  return j?.data?.items || null;
}

// --------- Helpers de análisis (opcionales) ---------

// Retorna { sellsUsd, buysUsd, netUsd } en la ventana de los últimos N trades
export async function beFlowSnapshotUsd(mint, limit = 50) {
  const trades = await beRecentTrades(mint, limit);
  if (!Array.isArray(trades)) return null;
  let sells = 0, buys = 0;
  for (const t of trades) {
    // Birdeye trae fields como: 'side' ('buy'/'sell'), 'price', 'amount', 'value'
    const side = String(t?.side || '').toLowerCase();
    const val  = Number(t?.value || 0); // USD
    if (!Number.isFinite(val)) continue;
    if (side === 'sell') sells += val;
    else if (side === 'buy') buys += val;
  }
  return { sellsUsd: sells, buysUsd: buys, netUsd: buys - sells };
}
