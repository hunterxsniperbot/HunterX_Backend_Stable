// src/services/registry.js
import fs from "fs";
import path from "path";

const DBFILE = process.env.HX_LOCAL_CLOSES_FILE || "data/closed_trades.json";
const ensureDir = (p)=>{ try{ fs.mkdirSync(path.dirname(p), {recursive:true}); }catch{} };

export async function appendLocalClose(row){
  ensureDir(DBFILE);
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(DBFILE, "utf8")||"[]"); } catch { arr = []; }
  arr.push(row);
  fs.writeFileSync(DBFILE, JSON.stringify(arr,null,2));
  return { ok:true, file: DBFILE };
}

export async function listLocalCloses(uid, opts={}){
  const { limit=20, since=null } = opts;
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(DBFILE, "utf8")||"[]"); } catch { arr = []; }
  if (uid) arr = arr.filter(r=> String(r.uid||"") === String(uid));
  if (since) arr = arr.filter(r=> new Date(r.closed_at||0) >= new Date(since));
  arr.sort((a,b)=> new Date(b.closed_at||0) - new Date(a.closed_at||0));
  return arr.slice(0, limit);
}

export async function recordClose(row){
  const out = { local:false, supabase:false, sheets:false };

  // Local JSON (siempre)
  try { await appendLocalClose(row); out.local = true; } 
  catch(e){ console.log("[registry][local] warn:", e?.message||e); }

  // Supabase (si hay credenciales)
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_ANON_KEY)) {
    try {
      const mod = await import("./supa.js");
      const res = await mod.insertClosedTrade(row);
      out.supabase = !!res?.ok;
      if (!out.supabase) console.log("[registry][supa] warn:", res?.status, res?.message);
    } catch(e){ console.log("[registry][supa] warn:", e?.message||e); }
  }

  // Google Sheets (si hay credenciales/ID)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_SHEETS_ID) {
    try {
      const mod = await import("./sheets.js");
      const res = await (mod.appendTradeToSheet?.(row));
      out.sheets = !!res?.ok;
      if (!out.sheets) console.log("[registry][sheets] warn:", res?.message || "appendTradeToSheet() no respondió ok");
    } catch(e){ console.log("[registry][sheets] warn:", e?.message||e); }
  }

  return out;
}
export default { appendLocalClose, listLocalCloses, recordClose };
