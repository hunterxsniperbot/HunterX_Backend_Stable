/* 
HUNTER X — src/services/trading.js
Versión: v2025-08-19
Módulo: HX-LOG-01 (Logging unificado)
Autoridad: Único operador (bot privado)

Estructura:
  [1] Imports & Fallbacks
  [2] Normalizadores (contratos de datos)
  [3] Logger local NDJSON (resiliente)
  [4] API pública: logTrade(), logEvent()

Objetivo:
  - Registrar TODA operación/evento en 2 destinos “best-effort”:
    (a) Google Sheets (si existe sheets.appendTrade)
    (b) Supabase (si existen upsertTrade / insertEvent)
  - Además, SIEMPRE escribir a logs locales NDJSON (no bloqueo).

Contratos (resumen):
  logTrade(input):
    input: {
      mode: 'DEMO'|'REAL',
      type: 'buy'|'sell'|'sell_partial'|'shadow',
      token: string, mint: string,
      inversion_usd?: number, entrada_usd?: number, salida_usd?: number,
      pnl_usd?: number, pnl_pct?: number,
      slippage_pct?: number,
      volumen_24h_usd?: number, liquidez_usd?: number, holders?: number,
      fdv_usd?: number, marketcap_usd?: number,
      fuente?: string, url?: string, extra?: object|string,
      fecha_hora?: ISOString
    }
    efecto: best-effort a Sheets + Supabase + NDJSON local.
    invariantes: números válidos o null; strings acotadas; extra stringified.
  
  logEvent(input):
    input: { ts?: ISOString, type: string, mode?: 'DEMO'|'REAL', token?: string, mint?: string, fuente?: string, extra?: object|string }
    efecto: best-effort a Supabase + NDJSON local.

Invariantes globales:
  - Ningún NaN/Infinity; números → Number o null.
  - Strings recortadas a longitudes razonables (evitar basura).
  - No arrojar (los destinos son opcionales).
*/

///////////////////////////////
// [1] Imports & Fallbacks  //
///////////////////////////////
import fs from 'node:fs';
import path from 'node:path';

// Sheets (named imports “flexibles”)
import * as sheets from './sheets.js';          // esperamos sheets.appendTrade(trade)
const appendTradeToSheets = typeof sheets?.appendTrade === 'function' ? sheets.appendTrade : null;

// Tabs (solo si tu appendTrade no existe; aquí no los usamos)
let TAB_DEMO = null, TAB_REAL = null;
try {
  const tabs = await import('./tabs.js');
  TAB_DEMO = tabs?.TAB_DEMO ?? null;
  TAB_REAL = tabs?.TAB_REAL ?? null;
} catch { /* opcional */ }

// Supabase helper (objeto con métodos opcionales)
let supabase = {};
try {
  const mod = await import('./supabase.js');
  supabase = (mod?.default ?? mod) || {};
} catch { supabase = {}; }


/////////////////////////////////////////
// [2] Normalizadores (contratos datos) //
/////////////////////////////////////////
function toNum(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function trimStr(s, max = 140) {
  if (s == null) return '';
  const t = String(s).trim();
  return t.length > max ? t.slice(0, max) : t;
}

/** Normaliza un trade y asegura tipos (números o null; strings cortas). */
function normalizeTrade(trade = {}) {
  const t = { ...trade };

  // Campos base
  t.fecha_hora       = t.fecha_hora ?? new Date().toISOString();
  t.mode             = (t.mode === 'REAL') ? 'REAL' : 'DEMO';
  t.type             = trimStr(t.type || 'buy', 20);
  t.token            = trimStr(t.token || '', 40);
  t.mint             = trimStr(t.mint || '', 64);
  t.fuente           = trimStr(t.fuente || '', 32);
  t.url              = trimStr(t.url || '', 256);
  t.red              = trimStr(t.red || 'Solana', 16);

  // Números
  t.entrada_usd      = toNum(t.entrada_usd, null);
  t.salida_usd       = toNum(t.salida_usd, null);
  t.inversion_usd    = toNum(t.inversion_usd, null);
  t.pnl_usd          = toNum(t.pnl_usd, null);
  t.pnl_pct          = toNum(t.pnl_pct, null);
  t.slippage_pct     = toNum(t.slippage_pct, null);

  t.volumen_24h_usd  = toNum(t.volumen_24h_usd, null);
  t.liquidez_usd     = toNum(t.liquidez_usd, null);
  t.holders          = toNum(t.holders, null);
  t.fdv_usd          = toNum(t.fdv_usd, null);
  t.marketcap_usd    = toNum(t.marketcap_usd, null);

  // Completa pnl_pct si falta y hay referencia entrada/salida
  if (t.pnl_pct == null && t.entrada_usd != null && t.salida_usd != null && t.entrada_usd > 0) {
    const pct = ((t.salida_usd / t.entrada_usd) - 1) * 100;
    t.pnl_pct = toNum(pct, null);
  }

  // Extra JSON
  if (t.extra != null && typeof t.extra !== 'string') {
    try { t.extra = JSON.stringify(t.extra); }
    catch { t.extra = String(t.extra); }
  } else if (t.extra == null) {
    t.extra = '';
  }

  return t;
}

/** Normaliza un evento genérico para auditoría. */
function normalizeEvent(evt = {}) {
  const e = { ...evt };
  e.ts     = e.ts ?? new Date().toISOString();
  e.type   = trimStr(e.type || 'event', 32);
  e.mode   = (e.mode === 'REAL') ? 'REAL' : (e.mode === 'DEMO' ? 'DEMO' : '');
  e.token  = trimStr(e.token || '', 40);
  e.mint   = trimStr(e.mint || '', 64);
  e.fuente = trimStr(e.fuente || '', 32);
  if (e.extra != null && typeof e.extra !== 'string') {
    try { e.extra = JSON.stringify(e.extra); } catch { e.extra = String(e.extra); }
  } else if (e.extra == null) {
    e.extra = '';
  }
  return e;
}


//////////////////////////////////////////
// [3] Logger local NDJSON (resiliente) //
//////////////////////////////////////////
const LOG_DIR = path.resolve('logs');
const TRADES_FILE = path.join(LOG_DIR, 'trades.ndjson');
const EVENTS_FILE = path.join(LOG_DIR, 'events.ndjson');

function safeAppendNdjson(filePath, obj) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', { encoding: 'utf8' });
    return true;
  } catch (e) {
    console.error('[Trading NDJSON] append error:', e?.message || e);
    return false;
  }
}


//////////////////////////////////////
// [4] API pública: logTrade/event  //
//////////////////////////////////////

/**
 * logTrade(trade)
 * Efecto:
 *  - Siempre: escribe línea NDJSON en logs/trades.ndjson
 *  - Si existe: sheets.appendTrade(trade normalizado)
 *  - Si existe: supabase.upsertTrade(trade normalizado)
 * Nunca lanza excepciones hacia arriba (best-effort).
 */
export async function logTrade(trade = {}) {
  const t = normalizeTrade(trade);

  // 1) NDJSON local
  safeAppendNdjson(TRADES_FILE, { kind: 'trade', ...t });

  // 2) Sheets (si tenés appendTrade)
  if (appendTradeToSheets) {
    try { await appendTradeToSheets(t); }
    catch (e) { console.error('[Sheets] appendTrade error:', e?.message || e); }
  }

  // 3) Supabase (si existe helper)
  if (typeof supabase?.upsertTrade === 'function') {
    try { await supabase.upsertTrade(t); }
    catch (e) { console.error('[Supabase] upsertTrade error:', e?.message || e); }
  }

  return true;
}

/**
 * logEvent(evt)
 * Efecto:
 *  - Siempre: escribe línea NDJSON en logs/events.ndjson
 *  - Si existe: supabase.insertEvent(evt normalizado)
 * Nunca lanza excepciones hacia arriba.
 */
export async function logEvent(evt = {}) {
  const e = normalizeEvent(evt);

  // 1) NDJSON local
  safeAppendNdjson(EVENTS_FILE, { kind: 'event', ...e });

  // 2) Supabase (si existe helper)
  if (typeof supabase?.insertEvent === 'function') {
    try { await supabase.insertEvent(e); }
    catch (err) { console.error('[Supabase] insertEvent error:', err?.message || err); }
  }

  return true;
}

export default { logTrade, logEvent };
