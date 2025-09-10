
// src/services/sheets.js (SHEETS_TAB_MODE=monthly|static)
// Usa Service Account (GOOGLE_APPLICATION_CREDENTIALS) y GOOGLE_SHEETS_ID

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const TAB_MODE = (process.env.SHEETS_TAB_MODE || "monthly").toLowerCase();

function monthEsName(d){
  // Mes en español (capitalizado corto)
  const m = new Intl.DateTimeFormat('es-AR',{month:'long', timeZone:'America/Argentina/Buenos_Aires'})
              .format(d);
  // Capitalizar primera
  return m.charAt(0).toUpperCase()+m.slice(1);
}

function tabNameFor(mode, dateStr){
  const modeUp = String(mode||"DEMO").toUpperCase();
  if (TAB_MODE === "static") return modeUp;

  // monthly
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const mon = monthEsName(d); // p.ej. "Septiembre"
  return `${modeUp}_${mon}_${y}`;
}

// ---------- OAuth (SA) ----------
async function getAccessToken(){
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(!keyPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS missing");
  const raw = await fs.promises.readFile(keyPath, "utf8");
  const json = JSON.parse(raw);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: await buildJWT(json, ["https://www.googleapis.com/auth/spreadsheets"])
  });
  const r = await fetch("https://www.googleapis.com/oauth2/v4/token", {
    method: "POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body
  });
  const js = await r.json();
  if(!r.ok) throw new Error(js.error_description || "oauth fail");
  return js.access_token;
}

async function buildJWT(sa, scopes){
  const header = { alg:"RS256", typ:"JWT" };
  const now = Math.floor(Date.now()/1000);
  const claim = {
    iss: sa.client_email,
    scope: scopes.join(" "),
    aud: "https://www.googleapis.com/oauth2/v4/token",
    iat: now,
    exp: now + 3600
  };
  const enc = (obj)=> Buffer.from(JSON.stringify(obj)).toString("base64url");
  const data = enc(header)+"."+enc(claim);
  const sign = cryptoSignRS256(data, sa.private_key);
  return data+"."+sign;
}

function cryptoSignRS256(data, privateKey){
  const crypto = require("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data);
  return sign.sign(privateKey, "base64url");
}

// ---------- Sheets helpers ----------
async function getSheetMeta(token){
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if(!r.ok) throw new Error("get spreadsheet meta fail");
  return r.json(); // {sheets:[{properties:{title, sheetId}}]}
}

async function ensureSheetExists(token, title){
  const meta = await getSheetMeta(token);
  const found = meta?.sheets?.find(s=>s?.properties?.title===title);
  if (found) return found.properties.sheetId;

  // create
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type":"application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      requests:[{ addSheet: { properties: { title } } }]
    })
  });
  const js = await r.json();
  if(!r.ok) throw new Error("addSheet fail: "+JSON.stringify(js));
  const newId = js?.replies?.[0]?.addSheet?.properties?.sheetId;

  // header opcional
  const headers = [
    "fecha_hora", "fecha_hora_ar", "mode", "type", "token", "mint",
    "entrada_usd","salida_usd","inversion_usd","pnl_usd","pnl_pct",
    "red","fuente","url","extra","uid","chat_id"
  ];
  await appendRaw(token, title, [headers]);
  return newId;
}

async function appendRaw(token, tab, values){
  // values: array de filas (array de arrays)
  const params = new URLSearchParams({
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS"
  });
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab+"!A1")}:append?${params}`, {
    method: "POST",
    headers: { "Content-Type":"application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ values })
  });
  const js = await r.json();
  if(!r.ok) throw new Error("values.append fail: "+JSON.stringify(js));
  return js;
}

// ---------- API principal ----------
export async function appendTradeToSheet(row){
  // row esperado: { mode, token, mint, entrada_usd, salida_usd, inversion_usd, pnl_pct, pnl_usd, fecha_hora, ... }
  const token = await getAccessToken();
  const tab = tabNameFor(row?.mode || "DEMO", row?.fecha_hora);
  await ensureSheetExists(token, tab);

  // fecha local “es-AR”
  const d = row?.fecha_hora ? new Date(row.fecha_hora) : new Date();
  const fecha_hora_ar = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  }).format(d);

  const values = [[
    row?.fecha_hora || new Date().toISOString(),
    fecha_hora_ar,
    String(row?.mode||"DEMO").toUpperCase(),
    row?.type || "sell",
    row?.token || "",
    row?.mint || "",
    Number(row?.entrada_usd||0),
    Number(row?.salida_usd||0),
    Number(row?.inversion_usd||0),
    Number(row?.pnl_usd||0),
    Number(row?.pnl_pct||0),
    row?.red || "Solana",
    row?.fuente || "bot",
    row?.url || "",
    row?.extra || "",
    row?.uid || "",
    row?.chat_id || ""
  ]];

  const res = await appendRaw(token, tab, values);
  return { ok:true, tab, res };
}

export function sheetTabNameFor(mode, dateStr){
  return tabNameFor(mode, dateStr);
}

export default { appendTradeToSheet, sheetTabNameFor };


// === Monthly tabs helpers ===
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function monthEs(d=new Date()){
  const fmt = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: process.env.TZ||'America/Argentina/Buenos_Aires' });
  const m = fmt.format(d);
  const y = d.getFullYear();
  // Capitaliza primera letra: Septiembre
  return m.charAt(0).toUpperCase()+m.slice(1)+"_"+y;
}

async function listSheets(spreadsheetId, token){
  const r = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`,{
    headers:{ Authorization: `Bearer ${token}` }
  });
  if(!r.ok) throw new Error("listSheets HTTP "+r.status);
  const j = await r.json();
  return (j.sheets||[]).map(x=>x.properties?.title).filter(Boolean);
}

async function addSheet(spreadsheetId, token, title){
  const body = { requests: [{ addSheet: { properties: { title } } }] };
  const r = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method:'POST',
    headers:{
      Authorization: `Bearer ${token}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify(body)
  });
  if(!r.ok) throw new Error("addSheet HTTP "+r.status);
  return true;
}

async function ensureMonthlyTab(spreadsheetId, token, mode){
  const mes = monthEs(new Date());
  const tab = `${mode}_${mes}`; // p.ej. DEMO_Septiembre_2025
  const tabs = await listSheets(spreadsheetId, token);
  if(!tabs.includes(tab)){
    await addSheet(spreadsheetId, token, tab);
    // Encabezados (A1:H1)
    const headers = [[
      "fecha_hora_ar","token","mint",
      "entrada_usd","salida_usd","inversion_usd",
      "pnl_pct","pnl_usd"
    ]];
    const rr = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=USER_ENTERED`,{
      method:'POST',
      headers:{
        Authorization:`Bearer ${token}`,
        'Content-Type':'application/json'
      },
      body: JSON.stringify({ values: headers })
    });
    if(!rr.ok) throw new Error("header append HTTP "+rr.status);
  }
  return tab;
}
