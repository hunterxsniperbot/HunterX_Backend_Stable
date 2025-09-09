
// src/services/supa.js — inserción y lectura de cierres (con uid)
const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
export function tableForMode(mode="DEMO"){
  const m = String(mode||"DEMO").toUpperCase();
  return (m==="REAL") ? (process.env.SUPABASE_TABLE_REAL||"operaciones_real")
                      : (process.env.SUPABASE_TABLE_DEMO||"operaciones_demo");
}

export async function insertClosedTrade(row){
  if (!BASE || !KEY) throw new Error("Faltan SUPABASE_URL / KEY");
  const table = tableForMode(row?.mode||"DEMO");
  const url = `${BASE}/rest/v1/${table}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(row||{})
  });
  if (!r.ok) {
    const txt = await r.text().catch(()=>r.statusText);
    throw new Error(`supabase insert ${table}: HTTP ${r.status} ${txt}`);
  }
  return r.json();
}

export async function listClosedTrades({mode="DEMO", day, uid, limit=20}={}){
  if (!BASE || !KEY) throw new Error("Faltan SUPABASE_URL / KEY");
  const table = tableForMode(mode);
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("order", "fecha_hora.desc");
  if (limit) params.set("limit", String(limit));
  if (day)   params.set("fecha_dia", `eq.${day}`);
  if (uid)   params.set("uid", `eq.${uid}`);
  const url = `${BASE}/rest/v1/${table}?${params.toString()}`;
  const r = await fetch(url, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  if (!r.ok) {
    const txt = await r.text().catch(()=>r.statusText);
    throw new Error(`supabase list ${table}: HTTP ${r.status} ${txt}`);
  }
  return r.json();
}

export default { insertClosedTrade, listClosedTrades, tableForMode };
