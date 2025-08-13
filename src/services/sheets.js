// src/services/sheets.js — Google Sheets con auth por JWT + caché simple
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

// -------- Config --------
const SHEET_ID =
  process.env.GOOGLE_SHEETS_ID ||
  process.env.SHEETS_ID ||
  '';

if (!SHEET_ID) {
  console.warn('⚠️ GOOGLE_SHEETS_ID no está definido. sheets.js funcionará, pero fallará al abrir el doc.');
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
    return JSON.parse(raw);
  }
  // b) JSON inline
  const inlineJson = process.env.GOOGLE_SA_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }
  // c) email + private key
  const email = process.env.GOOGLE_SA_EMAIL;
  const key   = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (email && key) {
    return { client_email: email, private_key: key };
  }
  throw new Error('Service Account de Google Sheets no configurado (usa GOOGLE_SA_JSON_PATH o GOOGLE_SA_JSON o GOOGLE_SA_EMAIL/GOOGLE_SA_PRIVATE_KEY)');
}

// 2) Crear auth JWT + abrir documento
async function openDoc() {
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
}

// 3) Helper: obtener hoja por nombre (crea si no existe, opcional)
async function getSheetByTitle(doc, title, { createIfMissing = false, headerValues = null } = {}) {
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

// -------- API pública --------

// Lee todas las filas de una pestaña (array de objetos)
export async function readRows(tab) {
  const doc = await openDoc();
  const sheet = await getSheetByTitle(doc, tab, { createIfMissing: false });
  const rows = await sheet.getRows();
  // Normalizamos a objetos simples
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
  const sheet = await getSheetByTitle(doc, tab, { createIfMissing: true });
  await sheet.addRow(obj);
  // invalidar caché
  _cache.delete(tab);
}

// Sobrescribe todas las filas (array de objetos)
export async function writeRows(tab, rows) {
  const doc = await openDoc();
  const sheet = await getSheetByTitle(doc, tab, { createIfMissing: true });
  // Borramos todo y re-escribimos
  await sheet.clear();
  const headers = Object.keys(rows[0] || { timestamp: '', side: '', symbol: '' });
  await sheet.setHeaderRow(headers);
  if (rows.length) await sheet.addRows(rows);
  _cache.delete(tab);
}

// Export agrupado (por si en otro lado hacen default import)
export default { readRows, readRowsCached, appendRow, writeRows };
