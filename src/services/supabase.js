// src/services/supabase.js — HX-LOG-03 — Wrapper mínimo y robusto para Supabase (ESM)
// Objetivo: dar helpers de logging que NUNCA rompan el bot si falta config o hay timeouts.
// Exports (default):
//   - upsertTrade(trade)  -> Promise<boolean>
//   - insertEvent(evt)    -> Promise<boolean>
//   - ping()              -> Promise<boolean>
// Notas:
//   - Crea el cliente lazy (on-demand), tolerante si falta @supabase/supabase-js o ENV.
//   - Si no hay config, devuelve false y loguea suave (no lanza).
//   - Genera un id determinista para trades (hash) si no viene uno.

import crypto from 'node:crypto';

// ===================== ENV / CONFIG =====================
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const SUPABASE_SCHEMA = process.env.SUPABASE_SCHEMA || 'public';
const SB_TRADES_TABLE = process.env.SB_TRADES_TABLE || 'trades';
const SB_EVENTS_TABLE = process.env.SB_EVENTS_TABLE || 'events';

// Timeouts “amables”
const SB_TIMEOUT_MS = Number(process.env.SB_TIMEOUT_MS || 5000);

// Cache del cliente (lazy)
let _clientPromise = null;

// ===================== HELPERS BASE =====================
function hasConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function stableIdFromTrade(t = {}) {
  // id determinista: fecha|mode|type|mint|entrada|inversion
  const key = [
    t.fecha_hora ?? '',
    (t.mode ?? '').toUpperCase(),
    (t.type ?? '').toLowerCase(),
    t.mint ?? '',
    (t.entrada_usd != null ? Number(t.entrada_usd) : ''),
    (t.inversion_usd != null ? Number(t.inversion_usd) : '')
  ].join('|');
  return crypto.createHash('sha1').update(key).digest('hex'); // 40 chars
}

function waitWithTimeout(promise, ms = SB_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ error: 'timeout' });
    }, ms);
    promise
      .then((v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } })
      .catch((e) => { if (!done) { done = true; clearTimeout(timer); resolve({ error: e?.message || String(e) }); } });
  });
}

// ===================== CLIENTE LAZY =====================
async function getClient() {
  if (!hasConfig()) return null;
  if (_clientPromise) return _clientPromise;

  _clientPromise = (async () => {
    try {
      // Carga dinámica para no romper si falta el paquete
      const mod = await import('@supabase/supabase-js').catch(() => null);
      if (!mod?.createClient) {
        console.warn('⚠️ [supabase] Falta "@supabase/supabase-js". Deshabilitado.');
        return null;
      }
      const { createClient } = mod;

      const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
        db: { schema: SUPABASE_SCHEMA },
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'x-client-info': 'hunterx-logger/1.0' } },
      });
      return client;
    } catch (e) {
      console.warn('[supabase] No se pudo crear cliente:', e?.message || e);
      return null;
    }
  })();

  return _clientPromise;
}

// ===================== COLUMNAS ESPERADAS =====================
// Trades (alineadas con sheets.js / trading.js)
const TRADE_COLS = [
  'id', 'fecha_hora', 'mode', 'type', 'token', 'mint',
  'entrada_usd', 'salida_usd', 'inversion_usd',
  'pnl_usd', 'pnl_pct', 'slippage_pct',
  'volumen_24h_usd', 'liquidez_usd', 'holders',
  'fdv_usd', 'marketcap_usd', 'red', 'fuente', 'url', 'extra'
];

// Events
// Sugerido en BD: id (uuid default), ts timestamptz, mode text, type text,
// token text, mint text, fuente text, extra json/text
const EVENT_COLS = [
  'ts', 'mode', 'type', 'token', 'mint', 'fuente', 'extra'
];

// ===================== API: upsertTrade =====================
async function upsertTrade(trade = {}) {
  try {
    const client = await getClient();
    if (!client) return false;

    // Normalizar + id
    const row = {};
    for (const k of TRADE_COLS) row[k] = null; // base nulls
    // Copiar
    for (const [k, v] of Object.entries(trade)) {
      if (k in row) row[k] = v;
    }
    row.id = trade.id || stableIdFromTrade(trade);
    row.extra = safeJson(trade.extra);

    // UPSERT: si definiste constraint UNIQUE (id)
    const q = client.from(SB_TRADES_TABLE).upsert(row, { onConflict: 'id' });

    const res = await waitWithTimeout(q, SB_TIMEOUT_MS);
    if (res?.error) {
      console.warn('[supabase] upsertTrade error:', res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[supabase] upsertTrade catch:', e?.message || e);
    return false;
  }
}

// ===================== API: insertEvent =====================
async function insertEvent(evt = {}) {
  try {
    const client = await getClient();
    if (!client) return false;

    const row = {};
    for (const k of EVENT_COLS) row[k] = null;
    row.ts     = evt.ts || new Date().toISOString();
    row.mode   = evt.mode ?? null;
    row.type   = evt.type ?? null;
    row.token  = evt.token ?? null;
    row.mint   = evt.mint ?? null;
    row.fuente = evt.fuente ?? null;
    row.extra  = safeJson(evt.extra);

    const q = client.from(SB_EVENTS_TABLE).insert(row);
    const res = await waitWithTimeout(q, SB_TIMEOUT_MS);
    if (res?.error) {
      console.warn('[supabase] insertEvent error:', res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[supabase] insertEvent catch:', e?.message || e);
    return false;
  }
}

// ===================== API: ping =====================
async function ping() {
  try {
    const client = await getClient();
    if (!client) return false;
    // SELECT 1 simulado (no hay "dual"; hacemos un SELECT con limit 1 del sistema)
    const q = client.rpc('now'); // si no existe, degradamos a false
    const res = await waitWithTimeout(q, SB_TIMEOUT_MS);
    if (res?.error) return false;
    return true;
  } catch {
    return false;
  }
}

// ===================== EXPORT =====================
export default {
  upsertTrade,
  insertEvent,
  ping,
};
