// src/services/vendors/solscan.js
// Solscan vendor (helpers de links + API opcional con SOLSCAN_API_KEY)
// - Links directos a token/tx/address
// - API pública (rate limited) con key opcional
// - Funciones devuelven null si no hay datos o rate limit

const BASE_WEB = 'https://solscan.io';
const BASE_API = 'https://pro-api.solscan.io'; // preferible (puede requerir key)
const KEY = process.env.SOLSCAN_API_KEY || '';

export const solscanToken  = (mint)   => mint ? `${BASE_WEB}/token/${encodeURIComponent(mint)}` : null;
export const solscanTx     = (sig)    => sig  ? `${BASE_WEB}/tx/${encodeURIComponent(sig)}`      : null;
export const solscanAddr   = (addr)   => addr ? `${BASE_WEB}/account/${encodeURIComponent(addr)}`: null;
export const solscanPair   = (addr)   => addr ? `${BASE_WEB}/amm/${encodeURIComponent(addr)}`    : null;

function withTimeout(promise, ms=5000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

async function apiGet(path, params={}, { timeout=5000 } = {}) {
  const u = new URL(BASE_API + path);
  for (const [k,v] of Object.entries(params)) if (v!==undefined && v!==null) u.searchParams.set(k, String(v));
  const headers = { accept: 'application/json' };
  if (KEY) headers['token'] = KEY; // header de Solscan Pro
  const res = await withTimeout(fetch(u, { headers }), timeout).catch(()=>null);
  if (!res || !res.ok) return null;
  return res.json().catch(()=>null);
}

// --------- Funciones públicas (tolerantes a errores) ---------

// Metadata básica del token (nombre, símbolo, decimals, supply, holders aprox)
export async function ssTokenMeta(tokenAddress) {
  if (!tokenAddress) return null;
  // endpoints posibles: /token/meta, /token?tokenAddress=...
  const j = await apiGet('/v2/token/meta', { tokenAddress }).catch(()=>null)
        || await apiGet('/v1/token/meta', { tokenAddress }).catch(()=>null);
  // estructura varía por versión; normalizamos lo común
  const d = j?.data || j || null;
  if (!d) return null;
  return {
    address: d.address || tokenAddress,
    name:    d.tokenName || d.name || null,
    symbol:  d.symbol || d.tokenSymbol || null,
    decimals: Number(d.decimals ?? d.tokenDecimal ?? NaN) || null,
    supply:   Number(d.supply ?? d.tokenSupply ?? NaN) || null,
    holders:  Number(d.holder ?? d.holders ?? NaN) || null,
    verified: Boolean(d.verified ?? d.isVerified ?? false),
    raw: d
  };
}

// Lista de tokens de una cuenta (ATA balances)
export async function ssAccountTokens(owner) {
  if (!owner) return null;
  const j = await apiGet('/v2/account/tokens', { address: owner }).catch(()=>null)
        || await apiGet('/v1/account/tokens', { address: owner }).catch(()=>null);
  const arr = j?.data || j || [];
  if (!Array.isArray(arr)) return null;
  return arr.map(t => ({
    mint: t.tokenAddress || t.mintAddress || t.mint || null,
    symbol: t.tokenSymbol || t.symbol || null,
    amountUi: Number(t.tokenAmount || t.amount || t.uiAmount || 0) || 0,
    decimals: Number(t.decimals ?? t.tokenDecimals ?? NaN) || null,
  })).filter(x => x.mint);
}

// Info de transacción
export async function ssTxInfo(signature) {
  if (!signature) return null;
  const j = await apiGet('/v2/transaction', { tx: signature }).catch(()=>null)
        || await apiGet('/v1/transaction', { tx: signature }).catch(()=>null);
  const d = j?.data || j || null;
  if (!d) return null;
  return {
    slot: Number(d.slot ?? NaN) || null,
    blockTime: Number(d.blockTime ?? d.block_time ?? NaN) || null,
    status: d.status || d.confirmationStatus || null,
    fee: Number(d.fee ?? NaN) || null,
    raw: d
  };
}
