// src/services/sheets.js — Google Sheets con "googleapis" (ESM, estable)
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Encabezados por defecto para tus trades
const DEFAULT_HEADERS = [
  'fecha_hora','mode','type','token','mint',
  'entrada_usd','salida_usd','inversion_usd',
  'pnl_usd','pnl_pct','slippage_pct',
  'volumen_24h_usd','liquidez_usd','holders','fdv_usd','marketcap_usd',
  'red','fuente','url','extra'
];

let _sheets = null;
let _spreadsheetId = null;

/** Auth + cliente Sheets */
async function getSheetsClient() {
  if (_sheets) return _sheets;

  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  if (!keyFile) throw new Error('GOOGLE_APPLICATION_CREDENTIALS no definido');
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_ID no definido');

  // Valida que exista el JSON
  const full = path.resolve(keyFile);
  if (!fs.existsSync(full)) {
    throw new Error(`No existe ${full} (service account)`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: full,
    scopes: SCOPES
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  _sheets = sheets;
  _spreadsheetId = spreadsheetId;
  return sheets;
}

/** Trae metadata de la hoja (lista de pestañas) */
async function getSpreadsheet() {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: _spreadsheetId
  });
  return data;
}

/** Asegura que exista la pestaña (sheet) con ese título */
async function ensureSheetExists(title) {
  const sheets = await getSheetsClient();
  const meta = await getSpreadsheet();
  const exists = (meta.sheets || []).some(s => s.properties?.title === title);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: _spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: { title }
        }
      }]
    }
  });
}

/** Lee la fila 1 (encabezados) de una pestaña */
async function getHeaderRow(title) {
  const sheets = await getSheetsClient();
  const range = `${title}!1:1`;
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: _spreadsheetId,
    range
  });
  const row = data.values?.[0] || [];
  return row.map(v => String(v || '').trim());
}

/** Convierte número de columna (1..N) a letra A1 (A,B,..,AA,AB,...) */
function colToA1(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Escribe encabezados en A1 */
async function setHeaderRow(title, headers) {
  const sheets = await getSheetsClient();
  const endCol = colToA1(headers.length);
  const range = `${title}!A1:${endCol}1`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: _spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] }
  });
}

/** Asegura encabezados por defecto (o los que pases) y crea pestaña si falta */
async function ensureHeaderRow(title, headers = DEFAULT_HEADERS) {
  try {
    await ensureSheetExists(title);
    const current = await getHeaderRow(title);
    if (current.length === 0) {
      await setHeaderRow(title, headers);
      console.log(`[Sheets] Headers creados en "${title}" (${headers.length} cols)`);
      return headers;
    }
    // si ya existen, devolvé los actuales
    return current;
  } catch (e) {
    console.error('[Sheets] ensureHeaderRow error:', e?.message || e);
    throw e;
  }
}

/** Agrega/actualiza encabezados si vienen nuevos campos en obj */
async function ensureHeaderHasKeys(title, headers, obj) {
  const keys = Object.keys(obj || {});
  const add = keys.filter(k => !headers.includes(k));
  if (add.length === 0) return headers;

  const newHeaders = [...headers, ...add];
  await setHeaderRow(title, newHeaders);
  console.log(`[Sheets] Headers ampliados en "${title}": +${add.length} (${add.join(', ')})`);
  return newHeaders;
}

/** Normaliza valor a celda (string/number) */
function toCell(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Inserta fila acorde a encabezados (auto-expande si hay campos nuevos) */
async function appendRow(obj, { tabTitle } = {}) {
  const title = tabTitle || 'Hoja 1';
  const sheets = await getSheetsClient();

  let headers = await ensureHeaderRow(title, DEFAULT_HEADERS);
  headers = await ensureHeaderHasKeys(title, headers, obj);

  const row = headers.map(h => toCell(obj[h]));
  const range = `${title}!A1`;

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: _spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    });
    return true;
  } catch (e) {
    console.error('[Sheets] appendRow error:', e?.message || e);
    return false;
  }
}

/** Decide pestaña DEMO/REAL y escribe el trade */
async function appendTrade(trade) {
  const mode = String(trade?.mode || 'DEMO').toUpperCase();
  const title = (mode === 'REAL')
    ? (process.env.SHEETS_TAB_REAL || 'REAL')
    : (process.env.SHEETS_TAB_DEMO || 'DEMO');

  return appendRow(trade, { tabTitle: title });
}

export default {
  ensureHeaderRow,
  appendRow,
  appendTrade
};
