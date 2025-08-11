// src/services/supabase.js — Upsert robusto con 'extra' (ESM)
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/,'');
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const TB_EVENTS = process.env.SUPABASE_TABLE_EVENTS || 'events';
const TB_TRADES = process.env.SUPABASE_TABLE_TRADES || 'trades';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[Supabase] Faltan SUPABASE_URL / SUPABASE_KEY (los helpers seguirán definidos pero fallarán al llamar).');
}

async function post(table, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env faltantes');
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${txt || 'sin cuerpo'}`);
  }
}

// Columnas “duras” que existen en trades (puede crecer con tus migraciones)
const TRADE_COLUMNS = new Set([
  'fecha_hora','mode','type','token','mint','entrada_usd','salida_usd','inversion_usd','pnl_usd','pnl_pct',
  'slippage_pct','volumen_24h_usd','liquidez_usd','holders','fdv_usd','marketcap_usd','red','fuente','url','extra',
  // extendidas opcionales:
  'time_to_first_sell_sec','hold_time_sec','peak_gain_pct','max_drawdown_pct','volatility_pct_1m','rsi_30s',
  'whale_inflow_usd_5m','whale_outflow_usd_5m','liquidity_locked','owner_renounced','honeypot_flag',
  'first_10_txs_whale_sell','blocks_since_creation','source_signals',
]);

/**
 * upsertTrade: separa campos conocidos de “otros” en extra.
 * Si mandás campos nuevos que aún no están como columnas, NO falla: van a extra.
 */
export async function upsertTrade(tradeObj = {}) {
  // separar en payload + extra
  const payload = {};
  const extra = { ...(tradeObj.extra || {}) };

  for (const [k,v] of Object.entries(tradeObj)) {
    if (TRADE_COLUMNS.has(k)) {
      payload[k] = v;
    } else {
      // mandar a extra lo que no sea columna
      extra[k] = v;
    }
  }

  // asegura que extra quede como json
  if (Object.keys(extra).length) payload.extra = extra;

  return post(TB_TRADES, payload);
}

export async function insertEvent(payload) {
  return post(TB_EVENTS, payload);
}

export default { upsertTrade, insertEvent };
