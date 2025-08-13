// src/services/positions.js — Open positions + PnL (DEMO/REAL)
import * as sheets from './sheets.js';
import { TAB_DEMO, TAB_REAL } from './tabs.js';
import { getPriceUSD } from './prices.js';

// Cache de filas por pestaña (ya existe otra en sheets; esta es por si queremos aislar TTL)
const _rowsCache = new Map(); // tab -> { t, rows }
const ROWS_TTL_MS = 7000;

async function readRowsCached(tab){
  const hit = _rowsCache.get(tab);
  const now = Date.now();
  if (hit && (now - hit.t) < ROWS_TTL_MS) return hit.rows;
  const rows = await sheets.readRows(tab); // usa la de sheets (ya robusta)
  _rowsCache.set(tab, { t: now, rows });
  return rows;
}

function num(x, def=0){
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

// Agrega operaciones para producir posición neta por clave (mint||symbol)
function aggregatePositions(rows){
  // mapa: k -> { symbol, mint, qty, costUsd, avgIn, investedUsd }
  const map = new Map();
  for (const r of rows){
    const side = String(r.side||'').toUpperCase();
    const symbol = (r.symbol ?? '').toString().trim();
    const mint = (r.mint ?? '').toString().trim();
    const qty = num(r.qty);
    const pu  = num(r.priceUsd);
    if (!qty || !pu || !symbol) continue;

    const k = mint || symbol;
    if (!map.has(k)) map.set(k, { symbol, mint, qty:0, costUsd:0 });
    const p = map.get(k);

    if (side === 'BUY'){
      p.qty += qty;
      p.costUsd += qty * pu;
    } else if (side === 'SELL'){
      // salida al costo promedio (reduce posición)
      const avg = p.qty > 0 ? (p.costUsd / p.qty) : 0;
      const q = Math.min(qty, p.qty);
      p.qty = Math.max(0, p.qty - q);
      p.costUsd = Math.max(0, p.costUsd - q * avg);
    }
  }

  // convertir a array, filtrando posiciones cerradas (qty==0)
  const out = [];
  for (const k of map.keys()){
    const p = map.get(k);
    if (p.qty <= 0) continue;
    p.avgIn = p.qty > 0 ? (p.costUsd / p.qty) : 0;
    p.investedUsd = p.costUsd; // lo que quedó invertido al costo
    out.push(p);
  }
  return out;
}

async function enrichWithPrices(arr){
  // resuelve precios actuales y PnL
  const out = [];
  for (const p of arr){
    const priceNow = await getPriceUSD(p.mint || p.symbol); // mint preferente
    const pnlPct = priceNow > 0 && p.avgIn > 0 ? ((priceNow - p.avgIn) / p.avgIn) * 100 : 0;
    const pnlUsd = (priceNow - p.avgIn) * p.qty;
    out.push({
      ...p,
      priceNow,
      pnlPct,
      pnlUsd,
    });
  }
  return out;
}

export async function getOpenPositions(){
  // DEMO
  const rowsDemo = await readRowsCached(TAB_DEMO);
  const posDemo = aggregatePositions(rowsDemo);
  const demo = await enrichWithPrices(posDemo);

  // REAL
  const rowsReal = await readRowsCached(TAB_REAL);
  const posReal = aggregatePositions(rowsReal);
  const real = await enrichWithPrices(posReal);

  const totals = {
    demoCount: demo.length,
    realCount: real.length,
    totalCount: demo.length + real.length,
    demoInvested: demo.reduce((a,b)=>a + (b.investedUsd||0), 0),
    realInvested: real.reduce((a,b)=>a + (b.investedUsd||0), 0),
  };

  return { demo, real, totals };
}

export default { getOpenPositions };
