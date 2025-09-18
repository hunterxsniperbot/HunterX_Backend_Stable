import { createClient } from "@supabase/supabase-js";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false }
});

const num = v => (typeof v === "number" ? v : (v ? Number(v) : 0));
const pick = (row, keys, d=0) => { for (const k of keys) if (k in row && row[k]!=null) return row[k]; return d; };
const isOpen = r => {
  const estado = (pick(r, ["estado","status"], "")||"").toString().toLowerCase();
  const cerradaAt = r.cerrada_at || r.closed_at || null;
  return (estado && !["cerrada","closed"].includes(estado)) || !cerradaAt;
};
const isClosed = r => !isOpen(r);

function dayBounds(tz="America/Argentina/Buenos_Aires"){
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"});
  const [y,m,d]=fmt.format(now).split("-");
  return {
    start: new Date(`${y}-${m}-${d}T00:00:00-03:00`),
    end:   new Date(`${y}-${m}-${d}T23:59:59-03:00`)
  };
}
const withinToday = (r, tz) => {
  const {start,end}=dayBounds(tz);
  const t=new Date(pick(r,["cerrada_at","closed_at","updated_at","created_at"], new Date()));
  return t>=start && t<=end;
};

let CACHE = { at:0, data:null };
export async function getDBMetrics(mode="DEMO", tz="America/Argentina/Buenos_Aires", market={}){
  const now=Date.now();
  if (CACHE.data && (now-CACHE.at)<5000) return CACHE.data; // TTL 5s

  const table = mode==="REAL" ? "operaciones_reales" : "operaciones_demo";
  const { data: rows, error } = await supa.from(table).select("*").order("created_at",{ascending:false}).limit(500);

  if (error){
    const fallback = { abiertas:0, exposicion_usd:0, pnl_no_realizado_usd:0, cerradas_hoy:0, pnl_dia_usd:0, winrate_dia:null };
    CACHE={at:now,data:fallback}; return fallback;
  }

  const opens = rows.filter(isOpen);
  const exp = opens.reduce((a,r)=>a+num(pick(r,["invertido_usd","inversion_usd","monto_usd","amount_usd","value_usd"],0)),0);

  // PnL no realizado (seguro): solo si hay qty y precio_entrada POR TOKEN + precio actual (ej. SOL)
  let pnlNoReal=0;
  const solPrice = market?.sol_usd;
  if (solPrice){
    for (const r of opens){
      const qty = num(pick(r,["qty","cantidad","size","cantidad_token"],0));
      const entry = num(pick(r,["precio_entrada"],0)); // por token
      if (qty && entry) pnlNoReal += (solPrice - entry) * qty;
    }
  }

  const closedToday = rows.filter(r=>isClosed(r) && withinToday(r,tz));
  const pnlDia = closedToday.reduce((a,r)=>a+num(pick(r,["pnl_usd","ganancia_usd","resultado_usd","pnl"],0)),0);
  const wins = closedToday.filter(r=>num(pick(r,["pnl_usd","ganancia_usd","resultado_usd","pnl"],0))>0).length;
  const wr = closedToday.length ? wins/closedToday.length : null;

  const out = {
    abiertas: opens.length,
    exposicion_usd: Number(exp.toFixed(2)),
    pnl_no_realizado_usd: Number(pnlNoReal.toFixed(2)),
    cerradas_hoy: closedToday.length,
    pnl_dia_usd: Number(pnlDia.toFixed(2)),
    winrate_dia: wr
  };
  CACHE={at:now,data:out};
  return out;
}
