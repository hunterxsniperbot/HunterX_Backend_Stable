// src/services/markets.js — PRO (gratis-first)
// Fuentes: GeckoTerminal (new pools) → Raydium v3 → DexScreener (último)
// Precio: Jupiter Price v3 (lite)
// Estrategia: rate-limit local por host, caché 5s, backoff 15s en 429/timeout.

const ORDER = (process.env.MARKET_ORDER || 'gecko,raydium,dexs')
  .split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

const CFG = {
  cacheMs:  Number(process.env.MARKET_CACHE_MS || 5000),
  timeout:  Number(process.env.MARKET_TIMEOUT_MS || 3000),
  backoff:  Number(process.env.MARKET_BACKOFF_MS || 15000),
  minInt: {
    gecko:   Number(process.env.MARKET_MIN_INTERVAL_MS_gecko   || 3000),
    raydium: Number(process.env.MARKET_MIN_INTERVAL_MS_raydium || 4000),
    dexs:    Number(process.env.MARKET_MIN_INTERVAL_MS_dexs    || 5000),
  },
  jupLite:  process.env.JUP_LITE_URL || 'https://lite-api.jup.ag/price/v3',
};

const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari';

const hostsState = new Map(); // host -> {lastAt, cooldownUntil}
const memCache   = new Map(); // key -> {ts, data}

function now(){ return Date.now(); }
function inCooldown(host){ return (hostsState.get(host)?.cooldownUntil||0) > now(); }
function setCooldown(host, ms){ hostsState.set(host, { ...(hostsState.get(host)||{}), cooldownUntil: now()+ms }); }
function canHit(host, minInterval){
  const st = hostsState.get(host)||{};
  if ((st.cooldownUntil||0) > now()) return false;
  if ((st.lastAt||0) + minInterval > now()) return false;
  return true;
}
function markHit(host){ hostsState.set(host, { ...(hostsState.get(host)||{}), lastAt: now() }); }

async function fetchJson(url, { timeoutMs=CFG.timeout }={}){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  const host = new URL(url).host;
  try{
    if (inCooldown(host)) return { ok:false, status:429, json:null, url, error:'cooldown' };
    markHit(host);
    const r = await fetch(url, {
      signal: ac.signal,
      headers: { 'user-agent': DESKTOP_UA, 'accept':'application/json' }
    });
    const ok = r.ok;
    let json = null;
    try { json = await r.json(); } catch {}
    if (!ok && (r.status===429||r.status===503)) setCooldown(host, CFG.backoff);
    return { ok, status:r.status, json, url };
  } catch(e){
    setCooldown(host, Math.max(CFG.backoff, 8000));
    return { ok:false, status:null, json:null, error:String(e?.message||e), url };
  } finally { clearTimeout(t); }
}

function num(...xs){ for (const x of xs){ const v=Number(x); if (Number.isFinite(v)&&v!==0) return v; } return 0; }

// ---------- Shapes a formato común ----------
function findIncludedToken(included, rel){
  if (!included || !rel?.data?.id) return null;
  const id = rel.data.id;
  // fallback: buscar por id o por address
  const byId = included.find(i => i.type==='tokens' && i.id===id);
  if (byId?.attributes) return byId.attributes;
  // a veces el id no matchea; intentamos por address si viene en attributes
  return null;
}

function symbolFromName(name, idx){
  if (typeof name !== 'string') return null;
  const parts = name.split('/');
  if (parts.length >= 2) return (idx===0 ? parts[0] : parts[1]).trim();
  return null;
}

function shapeGeckoPool(p, included){
  const attrs = p?.attributes || {};
  // 1) intentar símbolos directos del payload
  let baseSymbol = attrs.base_token_symbol || null;
  let quoteSymbol = attrs.quote_token_symbol || null;

  // 2) si no, usar el name "AAA/BBB"
  if (!baseSymbol)  baseSymbol  = symbolFromName(attrs.name, 0);
  if (!quoteSymbol) quoteSymbol = symbolFromName(attrs.name, 1);

  // 3) included (si vino y podemos mapear)
  if ((!baseSymbol || !quoteSymbol) && included?.length){
    const baseTok  = findIncludedToken(included, p.relationships?.base_token);
    const quoteTok = findIncludedToken(included, p.relationships?.quote_token);
    baseSymbol  ||= baseTok?.symbol || baseTok?.name || null;
    quoteSymbol ||= quoteTok?.symbol || quoteTok?.name || null;
  }

  // Direcciones (mismos criterios: attrs directos; si no, nada)
  const baseAddress  = attrs.base_token_address || null;
  const quoteAddress = attrs.quote_token_address || null;

  return {
    source: 'gecko',
    chainId: 'solana',
    pairAddress: attrs.address || null,
    dexId: attrs.dex || attrs.dex_id || null,
    baseSymbol: baseSymbol || '?',
    baseAddress: baseAddress || null,
    quoteSymbol: quoteSymbol || null,
    quoteAddress: quoteAddress || null,
    liquidityUsd: num(attrs.reserve_in_usd, attrs.tvl_usd),
    fdvUsd: num(attrs.fdv_usd, attrs.fully_diluted_valuation),
    vol_m1_usd: 0, // Gecko no expone m1 directo en este endpoint
    vol_m5_usd: 0,
    txns_m1: 0,
    txns_m5: 0,
    createdAtMs: attrs.pool_created_at ? Date.parse(attrs.pool_created_at) : null,
    raw: { p, included: !!included }
  };
}

function shapeRay(p){
  return {
    source: 'raydium',
    chainId: 'solana',
    pairAddress: p?.id || p?.pair_id || null,
    dexId: 'raydium',
    baseSymbol: p?.baseSymbol || p?.base?.symbol || (p?.name?.split('/')?.[0]) || '?',
    baseAddress: p?.baseMint || p?.base?.mint || null,
    quoteSymbol: p?.quoteSymbol || p?.quote?.symbol || (p?.name?.split('/')?.[1]) || null,
    quoteAddress: p?.quoteMint || p?.quote?.mint || null,
    liquidityUsd: num(p?.liquidity, p?.liquidityUSD, p?.liquidityUsd, p?.tvl),
    fdvUsd: num(p?.marketCap, p?.fdv),
    vol_m1_usd: 0,
    vol_m5_usd: num(p?.volume24h, p?.volumeUSD24h) / (24*12),
    txns_m1: 0,
    txns_m5: 0,
    createdAtMs: null,
    raw: p,
  };
}

function shapeDexs(p){
  const base = p?.baseToken || {};
  const quote= p?.quoteToken || {};
  const vol  = p?.volume || {};
  const txns = p?.txns || {};
  const liq  = p?.liquidity || {};
  const createdAt = p?.pairCreatedAt || p?.info?.launchedAt || null;
  return {
    source: 'dexs',
    chainId: (p?.chainId||'solana').toLowerCase(),
    pairAddress: p?.pairAddress || p?.url || null,
    dexId: p?.dexId || null,
    baseSymbol: base.symbol || p?.baseSymbol || p?.symbol || '?',
    baseAddress: base.address || p?.baseAddress || null,
    quoteSymbol: quote.symbol || null,
    quoteAddress: quote.address || null,
    liquidityUsd: num(liq.usd, liq.usdValue, liq.total, p?.tvl),
    fdvUsd: num(p?.fdv, p?.marketCap),
    vol_m1_usd: num(vol.m1, vol['1m']),
    vol_m5_usd: num(vol.m5, vol['5m']),
    txns_m1: (txns.m1?.buys ?? 0) + (txns.m1?.sells ?? 0) || 0,
    txns_m5: (txns.m5?.buys ?? 0) + (txns.m5?.sells ?? 0) || 0,
    createdAtMs: createdAt ? Number(createdAt) : null,
    raw: p,
  };
}

// ---------- Clientes ----------
async function geckoNewPools(){
  // https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token,quote_token&per_page=100
  const url = 'https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token,quote_token&per_page=100';
  const r = await fetchJson(url);
  if (!r.ok || !Array.isArray(r.json?.data)) return [];
  const data = r.json.data, inc = r.json.included || [];
  return data.map(d => shapeGeckoPool(d, inc)).filter(p => p.chainId==='solana');
}

async function raydiumV3List(){
  const url = 'https://api-v3.raydium.io/pools/info?poolType=all&size=100';
  const r = await fetchJson(url, { timeoutMs: Math.max(CFG.timeout, 3500) });
  if (!r.ok || !Array.isArray(r.json?.data)) return [];
  return r.json.data.map(shapeRay);
}

async function dexsPairs(){
  const url = 'https://api.dexscreener.com/latest/dex/pairs/solana';
  const r = await fetchJson(url, { timeoutMs: Math.max(CFG.timeout, 3500) });
  if (!r.ok || !Array.isArray(r.json?.pairs)) return [];
  return r.json.pairs.filter(p=>(p?.chainId||'solana').toLowerCase()==='solana').map(shapeDexs);
}

// ---------- Agregador con rate-limit local + backoff ----------
async function callWithGuard(name, fn){
  const minInt = CFG.minInt[name] || 3000;
  const host = name; // usamos name como key de ritmo
  if (!canHit(host, minInt)) return [];
  const out = await fn().catch(()=>[]);
  if (!out || !Array.isArray(out)) return [];
  return out;
}

function uniqBy(arr, keyFn){
  const m=new Set(); const out=[];
  for (const x of arr){
    const k=keyFn(x); if (m.has(k)) continue; m.add(k); out.push(x);
  }
  return out;
}

// ---------- Jupiter price (lite) ----------
async function enrichPrices(pairs){
  try{
    const mints = pairs.map(p=>p.baseAddress).filter(Boolean).slice(0,50);
    if (!mints.length) return pairs;
    const url = CFG.jupLite + '?ids=' + encodeURIComponent(mints.join(','));
    const r = await fetchJson(url, { timeoutMs: 2500 });
    const map = r.ok && r.json?.data ? r.json.data : {};
    for (const p of pairs){
      const mint = p.baseAddress;
      const price = map?.[mint]?.price;
      if (price) p.priceUsd = Number(price);
    }
  }catch{}
  return pairs;
}

// ---------- API público ----------
export async function getSolanaPairs({ limit=80, withPrice=false }={}){
  const cacheKey = `pairs:${limit}:${withPrice}`;
  const hit = memCache.get(cacheKey);
  if (hit && now()-hit.ts < CFG.cacheMs) return hit.data;

  let list = [];
  for (const name of ORDER){
    let got = [];
    if (name==='gecko')      got = await callWithGuard('gecko',   geckoNewPools);
    else if (name==='raydium') got = await callWithGuard('raydium', raydiumV3List);
    else if (name==='dexs')     got = await callWithGuard('dexs',    dexsPairs);
    if (got.length){
      list = got;
      break;
    }
  }
  if (!Array.isArray(list)) list = [];
  list = uniqBy(list, x => x.pairAddress || x.baseAddress || x.baseSymbol);
  if (limit>0) list = list.slice(0, limit);
  if (withPrice) list = await enrichPrices(list);

  memCache.set(cacheKey, { ts: now(), data: list });
  return list;
}

// Edad en minutos (si la fuente provee timestamp)
export function ageMinutes(p){
  if (!p?.createdAtMs) return null;
  const ms = Date.now() - Number(p.createdAtMs);
  if (!Number.isFinite(ms) || ms<=0) return null;
  return Math.floor(ms/60000);
}
