// src/services/trading.js — logging unificado a Sheets + Supabase (ESM)
import sheets from './sheets.js';      // <- USAMOS NAMED IMPORTS
import supabase from './supabase.js';  // helpers: upsertTrade, insertEvent, etc.

function normalizeTrade(trade = {}) {
  const t = { ...trade };
  t.fecha_hora     = t.fecha_hora ?? new Date().toISOString();
  t.mode           = t.mode ?? 'DEMO';    // 'DEMO' | 'REAL'
  t.type           = t.type ?? 'buy';     // 'buy' | 'sell' | 'sell_partial'
  t.token          = t.token ?? '';
  t.mint           = t.mint ?? '';
  t.entrada_usd    = (t.entrada_usd != null) ? Number(t.entrada_usd) : null;
  t.salida_usd     = (t.salida_usd  != null) ? Number(t.salida_usd)  : null;
  t.inversion_usd  = (t.inversion_usd != null) ? Number(t.inversion_usd) : null;
  t.pnl_usd        = (t.pnl_usd != null) ? Number(t.pnl_usd) : null;
  t.pnl_pct        = (t.pnl_pct != null) ? Number(t.pnl_pct) : null;
  t.slippage_pct   = (t.slippage_pct != null) ? Number(t.slippage_pct) : null;
  t.volumen_24h_usd= (t.volumen_24h_usd != null) ? Number(t.volumen_24h_usd) : null;
  t.liquidez_usd   = (t.liquidez_usd    != null) ? Number(t.liquidez_usd)    : null;
  t.holders        = (t.holders         != null) ? Number(t.holders)         : null;
  t.fdv_usd        = (t.fdv_usd         != null) ? Number(t.fdv_usd)         : null;
  t.marketcap_usd  = (t.marketcap_usd   != null) ? Number(t.marketcap_usd)   : null;
  t.red            = t.red ?? 'Solana';
  t.fuente         = t.fuente ?? '';
  t.url            = t.url ?? '';
  if (t.extra && typeof t.extra !== 'string') t.extra = JSON.stringify(t.extra);
  return t;
}

export async function logTrade(trade = {}) {
  const t = normalizeTrade(trade);
  // Sheets
  await sheets.appendTrade(t);
  // Supabase
  if (supabase?.upsertTrade) {
    try { await supabase.upsertTrade(t); } catch (e) {
      console.error('[Supabase] upsertTrade error:', e?.message || e);
    }
  }
  return true;
}

export async function logEvent(evt = {}) {
  if (supabase?.insertEvent) {
    try { await supabase.insertEvent(evt); } catch (e) {
      console.error('[Supabase] insertEvent error:', e?.message || e);
    }
  }
}

export default { logTrade, logEvent };
