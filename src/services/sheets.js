// src/services/sheets.js (ESM) — Soporta credenciales desde JSON o envs sueltos
// Prioridad:
// 1) GOOGLE_APPLICATION_CREDENTIALS -> ruta a JSON (service account)
// 2) GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY (con \n escapados)
//
// Requiere:
//   GOOGLE_SHEETS_ID= <ID del documento>  (obligatorio)
//
// API expuesta:
//   sheetsClient.appendRow(rowArray, { sheetName?, ensureHeader?, headers? })

import fs from 'fs/promises';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_ID =
  process.env.GOOGLE_SHEETS_ID ||
  process.env.GOOGLE_SHEET_ID ||
  '';

if (!SHEET_ID) {
  console.warn('[Sheets] Falta GOOGLE_SHEETS_ID en .env');
}

// ---------- Carga de credenciales ----------
async function loadCreds() {
  // 1) JSON vía ruta
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    try {
      const raw = await fs.readFile(credPath, 'utf8');
      const json = JSON.parse(raw);
      const email = json.client_email;
      let key = json.private_key || '';
      // Si viniera con \n reales, perfecto; si viniera escapado, lo normalizamos
      key = key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
      if (!email || !key) throw new Error('client_email/private_key faltan en JSON');
      return { email, key };
    } catch (e) {
      console.error('[Sheets] No se pudo leer GOOGLE_APPLICATION_CREDENTIALS:', e.message || e);
      // seguimos a la opción 2
    }
  }

  // 2) Envs sueltos
  const email =
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.GOOGLE_SERVICE_EMAIL ||
    '';
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  if (key) key = key.replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error('Faltan credenciales: defina GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY');
  }
  return { email, key };
}

let _doc = null;

// ---------- Lazy init del documento ----------
async function getDoc() {
  if (_doc) return _doc;
  if (!SHEET_ID) {
    throw new Error('Falta GOOGLE_SHEETS_ID');
  }
  const { email, key } = await loadCreds();
  const auth = new JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(SHEET_ID, auth);
  await doc.loadInfo();
  console.log(`[Sheets] Conectado: ${doc.title} (sheets: ${doc.sheetCount})`);
  _doc = doc;
  return _doc;
}

// ---------- Helpers de pestañas/headers ----------
async function ensureSheetByName(title) {
  const doc = await getDoc();
  await doc.loadInfo();
  let sheet = doc.sheetsByTitle[title];
  if (!sheet) sheet = await doc.addSheet({ title });
  return sheet;
}

async function ensureHeaders(sheet, headers, ensureHeader) {
  await sheet.loadHeaderRow();
  const current = sheet.headerValues || [];
  if (ensureHeader && headers && headers.length) {
    const mismatch =
      current.length !== headers.length ||
      headers.some((h, i) => current[i] !== h);
    if (mismatch) {
      await sheet.setHeaderRow(headers);
      return;
    }
  }
  if (!current || current.length === 0) {
    if (headers && headers.length) {
      await sheet.setHeaderRow(headers);
    }
  }
}

// ---------- API pública: appendRow ----------
async function appendRow(rowArray, opts = {}) {
  // rowArray: array de valores en orden A..Z (o el tamaño que uses)
  // opts.sheetName: string (opcional) — pestaña destino
  // opts.ensureHeader: boolean (opcional)
  // opts.headers: string[] (opcional) — cabeceras exactas a asegurar

  const doc = await getDoc();
  let sheet;
  if (opts.sheetName) {
    sheet = await ensureSheetByName(opts.sheetName);
  } else {
    sheet = doc.sheetsByIndex[0]; // hoja por defecto
  }

  if (opts.ensureHeader || opts.headers) {
    const headers = opts.headers || [];
    if (headers.length) await ensureHeaders(sheet, headers, true);
  }

  await sheet.loadHeaderRow();
  const headerValues = sheet.headerValues || [];

  // Si hay headers y el tamaño coincide, mapear por objeto para que cada valor entre en su columna.
  if (headerValues.length && headerValues.length === rowArray.length) {
    const obj = {};
    headerValues.forEach((h, i) => (obj[h] = rowArray[i]));
    await sheet.addRow(obj);
    return;
  }

  // Si no hay headers o difiere el tamaño, inserta arreglo "en crudo"
  await sheet.addRow(rowArray);
}

// También exportamos como objeto con método (compat)
const sheetsClient = { appendRow };

export default sheetsClient;
export { appendRow };
