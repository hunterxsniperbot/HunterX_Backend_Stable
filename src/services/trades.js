import { getJson } from './http.js';
import { readRows } from './sheets.js';
import { getPriceUsdByMint, getPriceUsdBySymbol } from './prices.js';

// Esquema de trade esperado (flexible por encabezados):
// uid, mode: 'REAL'|'DEMO', mint, symbol, side: 'BUY'|'SELL', qty, priceUsd, usd?, ts

const SUPABASE_URL  = process.env.SUPABASE_URL || '';
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_TABLE= process.env.SUPABASE_TRADES_TABLE || 'trades';
const DEMO_TAB = process.env.GDEMO_TAB || 'DEMO';
const REAL_TAB = process.env.GREAL_TAB || 'REAL';

function pick(obj, keys, d=null){
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
  return d;
}
function toNum(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
function toTs(v){ const t = Date.parse(v); return Number.isFinite(t) ? t : Date.now(); }

// ---------- LOADERS ----------
async function fetchTradesSupabase(uid){
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try{
    const url = `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/${SUPABASE_TABLE}?uid=eq.${encodeURIComponent(uid)}&select=*`;
    const j = await getJson(url, { headers:{
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    }, timeout: 10000, retries: 2});
    return Array.isArray(j) ? j : [];
  }catch{ return null; }
}

async function fetchTradesSheets(uid){
  try{
    const rowsDemo = await readRowsCached(DEMO_TAB).catch(()=>[]);
    const rowsReal = await readRowsCached(REAL_TAB).catch(()=>[]);
    const all = [];

    function pushRows(rows, fallbackMode){
      for (const r of rows){
        const t = {
          uid: String(pick(r, ['uid','UID','user','User','telegram_id','TelegramID'], '')),
          mode: String(pick(r, ['mode','MODE'], fallbackMode)).toUpperCase()==='REAL' ? 'REAL' : 'DEMO',
          mint: pick(r, ['mint','Mint','token_mint','TokenMint'], ''),
          symbol: pick(r, ['symbol','Symbol','ticker','Ticker'], ''),
          side: String(pick(r, ['side','Side','action','Action'],'')).toUpperCase(),
          qty: toNum(pick(r, ['qty','Qty','amount','Amount'], '')),
          priceUsd: toNum(pick(r, ['priceUsd','PriceUsd','price_usd','Price_USD','price','Price'], '')),
          usd: toNum(pick(r, ['usd','Usd','USD'], '')),
          ts: toTs(pick(r, ['ts','timestamp','Timestamp','date','Date'], ''))
        };
        if (!t.uid || !t.side || !t.qty || !t.priceUsd) continue;
        if (String(t.uid)!==String(uid)) continue;
        all.push(t);
      }
    }
    pushRows(rowsDemo, 'DEMO');
    pushRows(rowsReal, 'REAL');
    return all;
  }catch{ return null; }
}

// Fallback: memoria
function fetchTradesMemory(bot, uid){
  const d = Array.isArray(bot?._trades_demo?.[uid]) ? bot._trades_demo[uid] : [];
  const r = Array.isArray(bot?._trades_real?.[uid]) ? bot._trades_real[uid] : [];
  return d.concat(r);
}

// ---------- AGREGACIÓN ----------
export function aggregateByMint(trades){
  const pos = new Map(); // mint -> { symbol, qty, avg, invested }
  let realizedUsd = 0;

  for (const t of trades) {
    const mint   = t?.mint || '';
    const sym    = t?.symbol || (mint ? ('$'+mint.slice(0,4)+'…') : '$?');
    const side   = String(t?.side||'').toUpperCase();
    const qty    = Number(t?.qty);
    const px     = Number(t?.priceUsd);

    if (!mint || !Number.isFinite(qty) || !Number.isFinite(px)) continue;

    const it = pos.get(mint) || { symbol: sym, qty: 0, avg: 0, invested: 0 };
    if (side === 'BUY') {
      const newQty = it.qty + qty;
      const newAvg = newQty > 0 ? ((it.avg*it.qty) + (px*qty)) / newQty : 0;
      it.qty = newQty;
      it.avg = newAvg;
      it.invested = it.qty * it.avg;
      pos.set(mint, it);
    } else if (side === 'SELL') {
      const sellQty = Math.min(qty, it.qty);
      if (sellQty > 0) {
        const pnl = (px - it.avg) * sellQty;
        realizedUsd += pnl;
        it.qty -= sellQty;
        it.invested = it.qty * it.avg;
        pos.set(mint, it);
      }
    }
  }

  const open = [];
  for (const [mint, it] of pos.entries()) {
    if (it.qty > 1e-9) {
      open.push({ mint, symbol: it.symbol, openQty: it.qty, avgEntryPrice: it.avg, investedUsd: it.invested });
    }
  }
  return { open, realizedUsd };
}

export async function enrichWithLive(open){
  const out = [];
  for (const p of open) {
    let now = await getPriceUsdByMint(p.mint);
    if (now==null && p.symbol) now = await getPriceUsdBySymbol(p.symbol); // fallback por símbolo (CMC/CG)
    let pnlPct = null, pnlUsd = null;
    if (Number.isFinite(now) && Number.isFinite(p.avgEntryPrice) && Number.isFinite(p.openQty)) {
      pnlPct = ((now - p.avgEntryPrice) / p.avgEntryPrice) * 100;
      pnlUsd = p.openQty * (now - p.avgEntryPrice);
    }
    out.push({ ...p, currentPrice: now, pnlPct, pnlUsd });
  }
  return out;
}

// ---------- API DE ALTO NIVEL ----------
// Devuelve DEMO y REAL por separado
export async function getOpenPositionsSeparated(bot, uid){
  // encadenado: Sheets -> Supabase -> Memoria (merge con dedupe)
  const all = [];
  const seen = new Set();

  const fromSheets   = await fetchTradesSheets(uid);      if (fromSheets)   for(const t of fromSheets){ const k=JSON.stringify([t.uid,t.mode,t.mint,t.side,t.qty,t.priceUsd,t.ts]); if(!seen.has(k)){ seen.add(k); all.push(t); } }
  const fromSupabase = await fetchTradesSupabase(uid);    if (fromSupabase) for(const t of fromSupabase){ const k=JSON.stringify([t.uid,t.mode,t.mint,t.side,t.qty,t.priceUsd,t.ts]); if(!seen.has(k)){ seen.add(k); all.push(t); } }
  const fromMemory   = fetchTradesMemory(bot, uid) || []; for(const t of fromMemory){ const k=JSON.stringify([t.uid,t.mode,t.mint,t.side,t.qty,t.priceUsd,t.ts]); if(!seen.has(k)){ seen.add(k); all.push(t); } }

  const demoTrades = all.filter(t => String(t.mode).toUpperCase() !== 'REAL');
  const realTrades = all.filter(t => String(t.mode).toUpperCase() === 'REAL');

  const demoAgg = aggregateByMint(demoTrades);
  const realAgg = aggregateByMint(realTrades);

  const demoOpen = await enrichWithLive(demoAgg.open);
  const realOpen = await enrichWithLive(realAgg.open);

  return {
    demoOpen, realOpen,
    realizedUsdDemo: demoAgg.realizedUsd,
    realizedUsdReal: realAgg.realizedUsd
  };
}
