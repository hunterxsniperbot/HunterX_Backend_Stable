/* 
 * HUNTER X — services/supa | Persistencia Supabase — HX-S01 v2025-09-14
 * Purpose: Insert de cierres, listado de trades, sumas de PnL y utilidades de tabla por modo.
 * Inputs:  fetch REST Supabase
 * Outputs: Funciones ESM reusables
 * Deps:    ENV Supabase, fetch
 * ENV:     SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_TABLE_DEMO, SUPABASE_TABLE_REAL
 * Invariants: Siempre chequear r.ok; lanzar error con status para debugging
 * Notes:   Auto-documentado; mantener esta cabecera al día.
 */

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


export async function listClosedRange({mode="DEMO", fromUTC, toUTC, uid, limit=200}={}){
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
  const table = (mode==="REAL")
    ? (process.env.SUPABASE_TABLE_REAL||"operaciones_reales")
    : (process.env.SUPABASE_TABLE_DEMO||"operaciones_demo");
  const qs = [
    "select=*",
    fromUTC ? `fecha_hora=gte.${fromUTC}` : "",
    toUTC   ? `fecha_hora=lt.${toUTC}`   : "",
    uid     ? `uid=eq.${encodeURIComponent(uid)}` : "",
    "order=fecha_hora.desc",
    `limit=${limit}`
  ].filter(Boolean).join("&");
  const url = `${base}/rest/v1/${table}?${qs}`;
  const r = await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!r.ok){ const t=await r.text().catch(()=>r.statusText); throw new Error(`HTTP ${r.status} ${t}`); }
  return r.json();
}

/**
 * Suma PnL de operaciones cerradas en un rango de días [fromDay..toDay] (YYYYMMDD).
 * Devuelve { inv, pnl } con montos totales en USD.
 */
export async function sumClosedPnL({ mode = "DEMO", uid = null, fromDay, toDay } = {}) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
  const table = (String(mode).toUpperCase() === "REAL")
    ? (process.env.SUPABASE_TABLE_REAL || "operaciones_reales")
    : (process.env.SUPABASE_TABLE_DEMO || "operaciones_demo");

  if (!base || !key) throw new Error("supabase creds missing");

  const parts = ["select=inversion_usd,pnl_usd,fecha_dia"];
  if (fromDay) parts.push(`fecha_dia=gte.${fromDay}`);
  if (toDay)   parts.push(`fecha_dia=lte.${toDay}`);
  // Si en el futuro agregás columna uid propia: parts.push(`uid=eq.${uid}`)
  // Si lo guardás en JSON "extra", habría que ajustar a un filtro rpc o materializar uid.

  const url = `${base}/rest/v1/${table}?` + parts.join("&");
  const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`supabase sumClosedPnL: HTTP ${r.status}`);
  const rows = await r.json();

  return rows.reduce((acc, it) => {
    acc.inv += Number(it.inversion_usd || 0);
    acc.pnl += Number(it.pnl_usd || 0);
    return acc;
  }, { inv: 0, pnl: 0 });
}
