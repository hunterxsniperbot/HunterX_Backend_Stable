
// src/commands/registro.js
// /registro [hoy|ayer|semana|mes|YYYY-MM-DD|YYYY-MM-DD..YYYY-MM-DD]
// Lista cerradas (Supabase), resumen del rango y Libre(DEMO) desde abiertos en memoria.

function dayNumLocal(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0");
  return Number(`${y}${m}${dd}`);
}
function parseRange(arg){
  const now = new Date();
  const today = dayNumLocal(now);
  if(!arg || !arg.trim()) return {label:"hoy", from:today, to:today};

  const s = arg.trim().toLowerCase();
  if (s==="hoy")   return {label:"hoy", from:today, to:today};
  if (s==="ayer"){ const d=new Date(now); d.setDate(d.getDate()-1); const n=dayNumLocal(d); return {label:"ayer", from:n, to:n}; }
  if (s==="semana"){
    const w=new Date(now); const dow=(w.getDay()+6)%7; w.setDate(w.getDate()-dow);
    const from=dayNumLocal(w); return {label:"semana", from, to:today};
  }
  if (s==="mes"){
    const m=new Date(now.getFullYear(), now.getMonth(), 1); const from=dayNumLocal(m);
    return {label:"mes", from, to:today};
  }
  // YYYY-MM-DD .. YYYY-MM-DD
  const m = s.match(/^(d{4}-d{2}-d{2})(?:..(d{4}-d{2}-d{2}))?$/);
  if (m){
    const d1 = new Date(m[1]+"T00:00:00");
    const from = dayNumLocal(d1);
    const to   = m[2] ? dayNumLocal(new Date(m[2]+"T00:00:00")) : from;
    return {label: m[2] ? `${m[1]}..${m[2]}` : m[1], from, to};
  }
  return {label:"hoy", from:today, to:today};
}

function sumOpenDemo(bot, uid){
  const map = bot?._hxTradeInfo || {};
  const prefix = String(uid)+":";
  let rem = 0;
  for (const k of Object.keys(map)){
    if (!k.startsWith(prefix)) continue;
    const t = map[k];
    const r = Number(t?.remUsd ?? t?.amountUsdRem ?? 0);
    if (r>0) rem += r;
  }
  return rem;
}
function fmtUsd(n){ return "$"+Number(n||0).toFixed(2); }
function formatAR(dtIso){
  try{ return new Date(dtIso).toLocaleString("es-AR",{timeZone: (process?.env?.TZ || "America/Argentina/Buenos_Aires")}); }
  catch{ return new Date(dtIso).toLocaleString(); }
}
function monthTabName(mode, d){
  const meses=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const mm = meses[d.getMonth()]+"_"+d.getFullYear();
  return `${mode}_${mm}`;
}
function sheetsTabForMode(mode){
  const tabMode = String(process?.env?.SHEETS_TAB_MODE||"monthly"); // monthly|static
  if (tabMode==="static"){
    return String(process?.env?.SHEETS_TAB_STATIC || (mode==="REAL"?"REAL":"DEMO"));
  }
  const now = new Date();
  return monthTabName(mode, now);
}

export default function registerRegistro(bot){
  bot.onText(/^\/registro(?:\s+(.+))?$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);
    const arg = (m && m[1]) ? m[1].trim() : "";
    const {label, from, to} = parseRange(arg);

    let rows = [];
    let invSum = 0, pnlSum = 0, cerradas = 0;

    try{
      const { listClosedTrades, sumClosedPnL } = await import("../services/supa.js");
      const mode = "DEMO";
      rows = await listClosedTrades({ mode, fromDay: from, toDay: to, limit: 100 });
      const sums = await sumClosedPnL({ mode, fromDay: from, toDay: to });
      invSum = Number(sums?.inv||0);
      pnlSum = Number(sums?.pnl||0);
      cerradas = rows.length;
    }catch(e){
      console.log("[/registro] supa warn:", e?.message||e);
    }

    const cap = Number(process?.env?.DEMO_BANK_CAP || 1000);
    const libre = Math.max(0, cap - sumOpenDemo(bot, uid));
    const pct = invSum>0 ? (pnlSum/invSum)*100 : 0;

    const head = [
      "📊<b>VER POSICIONES CERRADAS</b> (DEMO) /registro "+label,
      "🧾 <b>Resumen:</b> Cerradas="+cerradas,
      "• <b>Invertido:</b> "+fmtUsd(invSum),
      "• <b>PnL:</b> "+fmtUsd(pnlSum)+" ("+pct.toFixed(2)+"%)",
      "💼 <b>Libre (DEMO):</b> "+fmtUsd(libre)
    ].join("\n");

    const cards = rows.map(r=>{
      const token = r?.token || "—";
      const entrada = (r?.entrada_usd!=null) ? Number(r.entrada_usd).toFixed(4) : "—";
      const salida  = (r?.salida_usd !=null) ? Number(r.salida_usd).toFixed(4)  : "—";
      const inv     = Number(r?.inversion_usd||0).toFixed(2);
      const pnlPct  = (r?.pnl_pct!=null) ? Number(r.pnl_pct).toFixed(2) : "0.00";
      const pnlUsd  = (r?.pnl_usd!=null) ? Number(r.pnl_usd).toFixed(2) : "0.00";
      const when    = formatAR(r?.fecha_hora || new Date().toISOString());
      const mint    = r?.mint || "So11111111111111111111111111111111111111112";
      const linkDex = `https://dexscreener.com/solana/${mint}`;
      const linkScan= `https://solscan.io/token/${mint}`;

      return [
        "🪙 <b>Token:</b> $"+token,
        "📈 <b>Precio de entrada:</b> "+entrada,
        "📤 <b>Precio de salida:</b> "+salida,
        "💵 <b>Invertido:</b> "+inv+" USD",
        "📈 <b>Ganancia:</b> "+pnlPct+"% (+"+pnlUsd+" USD)",
        "📅 "+when,
        `<a href="${linkDex}">📊 DexScreener</a>  <a href="${linkScan}">📎 Solscan</a>`
      ].join("\n");
    });

    const txt = cards.length ? (head + "\n\n" + cards.join("\n\n")) : head;

    // Link a Google Sheets (pestaña mensual o estática)
    const tab = sheetsTabForMode("DEMO");
    const sheetsId = process?.env?.GOOGLE_SHEETS_ID || "";
    const linkSheets = sheetsId ? `\n\n<a href="https://docs.google.com/spreadsheets/d/${sheetsId}/edit#gid=0&range=${encodeURIComponent(tab)}!A1">📲 Google Sheets</a>` : "";
    try{
      await bot.sendMessage(chatId, txt+linkSheets, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });
    }catch(e){
      console.log("[/registro] send fail:", e?.message||e);
    }
  });
}
