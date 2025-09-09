// src/services/sheets.js
import 'dotenv/config';
import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const KEYFILE  = process.env.GOOGLE_APPLICATION_CREDENTIALS;

const HEADERS = [
  "fecha_hora","mode","type","token","mint",
  "entrada_usd","salida_usd","inversion_usd",
  "pnl_usd","pnl_pct","slippage_pct",
  "volumen_24h_usd","liquidez_usd","holders","fdv_usd","marketcap_usd",
  "red","fuente","url","extra","fecha_dia"
];

function sheetNameForMode(mode){
  return String(mode).toUpperCase() === "REAL" ? "REAL" : "DEMO";
}

async function getSheetsClient(){
  if (!SHEET_ID || !KEYFILE) throw new Error("Missing GOOGLE_SHEETS_ID or GOOGLE_APPLICATION_CREDENTIALS");
  const auth = await google.auth.getClient({
    keyFile: KEYFILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

async function ensureSheetExists(sheets, spreadsheetId, title){
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(s => s.properties?.title === title);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] }
  });
}

async function ensureHeader(sheets, spreadsheetId, title){
  const rng = `${title}!1:1`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: rng });
  const has = Array.isArray(res.data.values) && res.data.values.length>0 && res.data.values[0].length>0;
  if (has) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: rng,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS] }
  });
}

function rowFromPayload(p={}){
  const obj = { ...p };
  // Serializo extra si viene como objeto
  if (obj.extra && typeof obj.extra === 'object') obj.extra = JSON.stringify(obj.extra);
  return HEADERS.map(h => obj[h] ?? "");
}

export async function appendTradeToSheet(payload){
  try{
    const sheets = await getSheetsClient();
    const tab = sheetNameForMode(payload?.mode || 'DEMO');
    await ensureSheetExists(sheets, SHEET_ID, tab);
    await ensureHeader(sheets, SHEET_ID, tab);

    const values = [ rowFromPayload(payload) ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });
    return { ok:true };
  } catch(e){
    console.log("[sheets] append fail:", e?.message || e);
    return { ok:false, error: e?.message || String(e) };
  }
}

export default { appendTradeToSheet };


export function linkForSheet(mode="DEMO"){
  const id = process.env.GOOGLE_SHEETS_ID || "";
  if (!id) return "";
  const tab = String(mode||"DEMO").toUpperCase();
  // Abrir el doc apuntando a la pestaña usando range=TAB!A1
  return `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0&range=${encodeURIComponent(tab)}!A1`;
}
