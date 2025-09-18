import express from "express";
import crypto from "node:crypto";
import { getDBMetrics } from "../services/dbMetrics.js";

const rpcUrl = process.env.HELIUS_RPC_URL || process.env.QUICKNODE_URL || null;
const REFRESH_MS = Number(process.env.HX_STATUS_REFRESH_MS ?? 5000);
const tz = process.env.HX_TZ || "America/Argentina/Buenos_Aires";
const started = Date.now();

const state = {
  ts: null,
  runtime: { mode: process.env.HX_MODE ?? "DEMO", loop: "M4", uptime_s: 0, p95_ms: 0, timeouts_pct: 0, providers: [] },
  mercado: { tick_src: "gecko→rpc", sol_usd: null, lat_tick_ms: null },
  posiciones: { abiertas: 0, exposicion_usd: 0, pnl_no_realizado_usd: 0 },
  dia: { operaciones_cerradas: 0, pnl_dia_usd: 0, winrate_dia: null },
  mensajes: { hash: null, hints: ["Local status"] }
};

const p95 = arr => { if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); return s[Math.max(0,Math.ceil(0.95*s.length)-1)]; };
const sha = x => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0,8);

async function pingGecko(){
  const t0=Date.now();
  try{
    const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",{headers:{accept:"application/json"}});
    const lat=Date.now()-t0; const j=await r.json(); const sol=j?.solana?.usd ?? null;
    return { name:"gecko", ok:!!sol, lat_ms:lat, score: sol?0.94:0, sol_usd: sol };
  }catch(e){ return { name:"gecko", ok:false, lat_ms:Date.now()-t0, score:0, error:String(e)}; }
}
async function pingRPC(){
  if(!rpcUrl) return { name:"rpc", ok:false, lat_ms:0, score:0, error:"no_rpc" };
  const t0=Date.now();
  try{
    const r=await fetch(rpcUrl, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getSlot"})});
    const lat=Date.now()-t0; const j=await r.json(); const ok=!!j?.result;
    return { name:"rpc", ok, lat_ms:lat, score: ok?0.90:0 };
  }catch(e){ return { name:"rpc", ok:false, lat_ms:Date.now()-t0, score:0, error:String(e)}; }
}

const LAT_WIN=[]; const LAT_WIN_MAX=60;
async function tick(){
  const [g,rpc] = await Promise.all([ pingGecko(), pingRPC() ]);

  state.runtime.providers = [g,rpc];
  state.runtime.uptime_s = Math.floor((Date.now()-started)/1000);

  if (g.lat_ms) LAT_WIN.push(g.lat_ms);
  if (rpc.lat_ms) LAT_WIN.push(rpc.lat_ms);
  while (LAT_WIN.length>LAT_WIN_MAX) LAT_WIN.shift();
  state.runtime.p95_ms = Math.round(p95(LAT_WIN));

  state.mercado.sol_usd = g.sol_usd ?? state.mercado.sol_usd;
  state.mercado.lat_tick_ms = g.lat_ms ?? state.mercado.lat_tick_ms;

  const db = await getDBMetrics(state.runtime.mode, tz, { sol_usd: state.mercado.sol_usd });
  state.posiciones = {
    abiertas: db.abiertas,
    exposicion_usd: db.exposicion_usd,
    pnl_no_realizado_usd: db.pnl_no_realizado_usd
  };
  state.dia = {
    operaciones_cerradas: db.cerradas_hoy,
    pnl_dia_usd: db.pnl_dia_usd,
    winrate_dia: db.winrate_dia
  };

  state.ts = new Date().toLocaleString("es-AR", { timeZone: tz });
  state.mensajes.hash = sha({ sol:state.mercado.sol_usd, p95:state.runtime.p95_ms, up:state.runtime.uptime_s });
}
setInterval(tick, REFRESH_MS);
tick().catch(()=>{});

const app = express();
app.get("/health", (_q,res)=>res.json({ ok: !!state.ts, mode: state.runtime.mode, uptime_s: state.runtime.uptime_s, p95_ms: state.runtime.p95_ms, providers: state.runtime.providers }));
app.get("/status", (_q,res)=>res.json({ ts_local: state.ts, runtime: state.runtime, mercado: state.mercado, posiciones: state.posiciones, dia: state.dia, mensajes: state.mensajes }));
app.get("/", (_q,res)=>res.send("HX Local Status OK"));

const port = Number(process.env.HX_STATUS_PORT ?? 3031);
app.listen(port, ()=>console.log(`[HX-LOCAL] http://127.0.0.1:${port} | REFRESH=${REFRESH_MS}ms | MODE=${state.runtime.mode}`));
