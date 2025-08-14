// ESM
import axios from 'axios';

// ===== Config desde env (con defaults sensatos) =====
const ORDER = (process.env.PRICES_ORDER || 'JUPITER,DEXSCREENER,BIRDEYE,RAYDIUM,COINGECKO,CMC')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

const PRICES_TIMEOUT_MS   = +(process.env.PRICES_TIMEOUT_MS   || 5000);
const TTL_MS              = +(process.env.PRICES_TTL_MS       || 15000);

const BIRDEYE_API_KEY     = process.env.BIRDEYE_API_KEY || '';
const CMC_API_KEY         = process.env.CMC_API_KEY     || ''; // (no lo usamos aquí, pero se deja por compat)

// Mints conocidos
const MINT_SOL  = 'So11111111111111111111111111111111111111112';
const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WELL_KNOWN = Object.freeze({
  [MINT_SOL]: 'SOL',
  [MINT_USDC]: 'USDC',
});

// ===== Infra de caché =====
const priceCache = new Map(); // mint -> { price, source, ts }
function now() { return Date.now(); }
function setPriceCache(mint, price, source) {
  priceCache.set(mint, { price, source, ts: now() });
}
function getPriceCache(mint) {
  const e = priceCache.get(mint);
  if (!e) return null;
  if (now() - e.ts > TTL_MS) return null;
  return e;
}

// ===== Helpers =====
function httpGet(url, { headers = {}, timeout = PRICES_TIMEOUT_MS } = {}) {
  return axios.get(url, { headers, timeout, validateStatus: s => s>=200 && s<500 })
    .then(r => r.data)
    .catch(() => null);
}
function parseFloatSafe(x) {
  const n = +x;
  return Number.isFinite(n) && n>0 ? n : null;
}
function isMint(m) { return typeof m === 'string' && m.length >= 32; }

// ====== Proveedores ======

// 1) Jupiter: https://price.jup.ag/v6/price?ids=<mint|symbol>
async function pJUPITER(mint) {
  const id = WELL_KNOWN[mint] || mint;
  const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`;
  const data = await httpGet(url);
  const price = data?.data?.[id]?.price ?? data?.data?.[mint]?.price;
  const v = parseFloatSafe(price);
  return v ? { source: 'JUPITER', price: v } : null;
}

// 2) DexScreener: https://api.dexscreener.com/latest/dex/tokens/<mint>
async function pDEXSCREENER(mint) {
  if (!isMint(mint)) return null;
  const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
  const data = await httpGet(url);
  const pairs = data?.pairs;
  if (!Array.isArray(pairs) || pairs.length===0) return null;
  // Elegir el par con mayor liquidez que tenga priceUsd
  let best = null;
  for (const p of pairs) {
    const pu = parseFloatSafe(p?.priceUsd);
    const liq = parseFloatSafe(p?.liquidity?.usd);
    if (!pu) continue;
    if (!best || (liq||0) > (best.liq||0)) best = { price: pu, liq };
  }
  return best ? { source: 'DEXSCREENER', price: best.price } : null;
}

// 3) Birdeye (opcional): https://public-api.birdeye.so/public/price?address=<mint>
async function pBIRDEYE(mint) {
  if (!BIRDEYE_API_KEY) return null;
  if (!isMint(mint)) return null;
  const url = `https://public-api.birdeye.so/public/price?address=${mint}`;
  const data = await httpGet(url, { headers: { 'X-API-KEY': BIRDEYE_API_KEY } });
  const v = parseFloatSafe(data?.data?.value);
  return v ? { source: 'BIRDEYE', price: v } : null;
}

// 4) Raydium (limitado): API expone símbolos, no mints arbitrarios.
//    Usamos Raydium sólo para SOL/USDC (mints conocidos).
async function pRAYDIUM(mint) {
  const sym = WELL_KNOWN[mint];
  if (!sym) return null;
  // https://api.raydium.io/v2/main/price?ids=SOL,USDC
  const data = await httpGet('https://api.raydium.io/v2/main/price?ids=SOL,USDC');
  if (!data) return null;
  const key = sym.toUpperCase();
  const v = parseFloatSafe(data?.data?.[key]);
  return v ? { source: 'RAYDIUM', price: v } : null;
}

// 5) CoinGecko (sólo SOL ⇢ USD como último fallback)
async function pCOINGECKO_SOL(mint) {
  if (mint !== MINT_SOL) return null;
  const data = await httpGet('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    { headers: { accept: 'application/json' }});
  const v = parseFloatSafe(data?.solana?.usd);
  return v ? { source: 'COINGECKO_SOL', price: v } : null;
}

// ====== API pública ======

export async function getSOLPriceUSD() {
  const r = await getPriceUSD(MINT_SOL);
  return r?.price ?? null;
}
export async function getUSDCPriceUSD() {
  return 1.0;
}

export async function getPriceUSD(mint) {
  // Caché
  const c = getPriceCache(mint);
  if (c) return { ...c, cached: true };

  // USDC shortcut estable
  if (mint === MINT_USDC) {
    const out = { source: 'STATIC_USDC', price: 1.0, cached: false };
    setPriceCache(mint, out.price, out.source);
    return out;
  }

  // Orden de proveedores
  for (const prov of ORDER) {
    let r = null;
    try {
      if (prov === 'JUPITER')       r = await pJUPITER(mint);
      else if (prov === 'DEXSCREENER') r = await pDEXSCREENER(mint);
      else if (prov === 'BIRDEYE')  r = await pBIRDEYE(mint);
      else if (prov === 'RAYDIUM')  r = await pRAYDIUM(mint);
      else if (prov === 'COINGECKO') r = await pCOINGECKO_SOL(mint);
      // CMC omitido aquí (normalmente requiere mapping adicional o key pro)
    } catch {
      r = null;
    }
    if (r && Number.isFinite(r.price)) {
      setPriceCache(mint, r.price, r.source);
      return { ...r, cached: false };
    }
  }

  // No hay precio
  return null;
}

export default { getPriceUSD, getSOLPriceUSD, getUSDCPriceUSD };
