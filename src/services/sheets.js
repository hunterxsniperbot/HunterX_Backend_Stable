// src/services/sheets.js — HX-LOG-02 — Google Sheets con auth por JWT + caché simple (ESM)
// Propósito: logging best-effort a Google Sheets SIN romper si falta configuración.
// Exports: readRows, readRowsCached, appendRow, writeRows, appendTrade (usado por trading.js)

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

// ============= Config & helpers básicos =============
const SHEET_ID =
  process.env.GOOGLE_SHEETS_ID ||
  process.env.SHEETS_ID ||
  '';

function hasSheetsConfig() {
  const p = process.env.GOOGLE_SA_JSON_PATH;
  const inline = process.env.GOOGLE_SA_JSON;
  const email = process.env.GOOGLE_SA_EMAIL;
  const key   = process.env.GOOGLE_SA_PRIVATE_KEY;
  return Boolean(
    SHEET_ID &&
    (p || inline || (email && key))
  );
}

if (!SHEET_ID) {
  console.warn('⚠️ [sheets] GOOGLE_SHEETS_ID no está definido. El logging a Sheets quedará deshabilitado.');
}

// 1) Cargar credenciales del SA (service account) desde:
//    - GOOGLE_SA_JSON_PATH (ruta a .json)
//    - GOOGLE_SA_JSON (json en una sola variable)
//    - GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY (pareja suelta)
function loadServiceAccountCreds() {
  // a) archivo
  const p = process.env.GOOGLE_SA_JSON_PATH;
  if (p) {
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    const raw = fs.readFileSync(abs, 'utf8');
    const obj = JSON.parse(raw);
    if (obj.private_key && obj.private_key.includes('\\n')) {
      obj.private_key = obj.private_key.replace(/\\n/g, '\n');
    }
    return obj;
  }
  // b) JSON inline
  const inlineJson = process.env.GOOGLE_SA_JSON;
  if (inlineJson) {
    const obj = JSON.parse(inlineJson);
    if (obj.private_key && obj.private_key.includes('\\n')) {
      obj.private_key = obj.private_key.replace(/\\n/g, '\n');
    }
    return obj;
  }
  // c) email + private key
  const email = process.env.GOOGLE_SA_EMAIL;
  let key     = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (email && key) {
    if (key.includes('\\n')) key = key.replace(/\\n/g, '\n');
    return { client_email: email, private_key: key };
  }
  throw new Error('Service Account de Google Sheets no configurado (usa GOOGLE_SA_JSON_PATH o GOOGLE_SA_JSON o GOOGLE_SA_EMAIL/GOOGLE_SA_PRIVATE_KEY)');
}

// 2) Crear auth JWT + abrir documento
async function openDoc() {
  if (!hasSheetsConfig()) return null;
  try {
    const creds = loadServiceAccountCreds();
    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
    });
    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();
    return doc;
  } catch (e) {
    console.warn('[sheets] No se pudo abrir Sheets:', e?.message || e);
    return null;
  }
}

// 3) Helper: obtener hoja por nombre (crea si no existe, opcional)
async function getSheetByTitle(doc, title, { createIfMissing = false, headerValues = null } = {}) {
  if (!doc) throw new Error('doc=null');
  let sheet = doc.sheetsByTitle[title];
  if (!sheet && createIfMissing) {
    sheet = await doc.addSheet({
      title,
      headerValues: headerValues || ['timestamp', 'side', 'symbol', 'mint', 'qty', 'priceUsd', 'txid', 'note']
    });
  }
  if (!sheet) throw new Error(`Hoja "${title}" no encontrada`);
  return sheet;
}

// ============= API pública: lectura/escritura genérica =============

// Lee todas las filas de una pestaña (array de objetos)
export async function readRows(tab) {
  const doc = await openDoc();
  if (!doc) return []; // no rompe si no hay config
  const sheet = await getSheetByTitle(doc, tab, { createIfMissing: false });
  const rows = await sheet.getRows();
  return rows.map(r => ({ ...r.toObject() }));
}

// Caché simple por pestaña (para no pegarle muy seguido a Sheets)
const _cache = new Map(); // tab -> { t:number, rows:Array }
const ROWS_TTL_MS = 7000;

export async function readRowsCached(tab) {
  const hit = _cache.get(tab);
  const now = Date.now();
  if (hit && (now - hit.t) < ROWS_TTL_MS) return hit.rows;
  const rows = await readRows(tab);
  _cache.set(tab, { t: now, rows });
  return rows;
}

// Agrega una fila (obj con claves = encabezados)
export async function appendRow(tab, obj) {
  const doc = await openDoc();
  if (!doc) return false;
  const sheet = await getSheetByTitle(doc, tab, { createIfMissing: true });
  await sheet.addRow(obj);
  _cache.delete(tab);
  return true;
}

// Sobrescribe todas las filas (array de objetos)
export async function writeRows(tab, rows) {
  const doc = await openDoc();
  if (!doc) return false;
  const sheet = await getSheetByTitle(doc, tab, { createIfMissing: true });
  await sheet.clear();
  const headers = Object.keys(rows[0] || { timestamp: '', side: '', symbol: '' });
  await sheet.setHeaderRow(headers);
  if (rows.length) await sheet.addRows(rows);
  _cache.delete(tab);
  return true;
}

// ============= API específica: appendTrade (usado por trading.js) =============

// Títulos por modo (si luego querés centralizar, podés importar de ./tabs.js)
const TAB_DEMO_DEFAULT = process.env.SHEETS_TAB_DEMO || 'Trades_DEMO';
const TAB_REAL_DEFAULT = process.env.SHEETS_TAB_REAL || 'Trades_REAL';

function sheetTitleForMode(mode) {
  const m = (mode || 'DEMO').toUpperCase();
  return m === 'REAL' ? TAB_REAL_DEFAULT : TAB_DEMO_DEFAULT;
}

const TRADE_HEADERS = [
  'fecha_hora', 'mode', 'type', 'token', 'mint',
  'entrada_usd', 'salida_usd', 'inversion_usd',
  'pnl_usd', 'pnl_pct', 'slippage_pct',
  'volumen_24h_usd', 'liquidez_usd', 'holders',
  'fdv_usd', 'marketcap_usd', 'red', 'fuente', 'url', 'extra'
];

/** Inserta una operación ya normalizada (trading.js hace normalizeTrade) */
export async function appendTrade(trade) {
  try {
    // Best-effort: si no hay config, no rompemos el flujo
    if (!hasSheetsConfig()) return false;

    const doc = await openDoc();
    if (!doc) return false;

    const tab = sheetTitleForMode(trade?.mode);
    const sheet = await getSheetByTitle(doc, tab, {
      createIfMissing: true,
      headerValues: TRADE_HEADERS
    });

    // Asegurar headers (por si la hoja ya existía con otros encabezados)
    try {
      const current = sheet.headerValues || [];
      const mismatch = current.length !== TRADE_HEADERS.length ||
                       current.some((h, i) => h !== TRADE_HEADERS[i]);
      if (mismatch) {
        await sheet.setHeaderRow(TRADE_HEADERS);
      }
    } catch {}

    // Filtrar sólo columnas conocidas (evita columnas "raras" en Sheets)
    const row = {};
    for (const k of TRADE_HEADERS) {
      row[k] = trade?.[k] ?? null;
    }
    await sheet.addRow(row);

    // Invalidar caché de esa pestaña
    _cache.delete(tab);

    return true;
  } catch (e) {
    console.warn('[sheets] appendTrade falló (se ignora):', e?.message || e);
    return false;
  }
}

// Export agrupado (por si en otro lado hacen default import)
export default { readRows, readRowsCached, appendRow, writeRows, appendTrade };
