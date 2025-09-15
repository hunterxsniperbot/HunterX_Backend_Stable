
// src/commands/pnl.js
import { getUsdQuote } from "../services/price.js";
import { calcUnrealizedFor, aggregateUnrealized, fmtUsd, fmtPx, fmtPct } from "../services/pnl.js";
let supa = null;
try { supa = await import("../services/supa.js"); } catch {}
const sumClosedPnL = supa?.sumClosedPnL || (async ()=>({inv:0,pnl:0}));

function humanNowAR(){
  try{
    return new Date().toLocaleString("es-AR", { timeZone: process.env.TZ || "America/Argentina/Buenos_Aires" });
  }catch{
    return new Date().toLocaleString();
  }
}

export default function registerPnL(bot){
  bot.onText(/^\/pnl(?:\s+(.+))?$/i, async (msg) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);
    const mode = "DEMO"; // hoy DEMO

    // Abiertos del usuario
    const all = bot._hxTradeInfo || {};
    const my = Object.entries(all)
      .filter(([k,info])=> k.startsWith(uid + ":"))
      .map(([,info])=> info)
      .filter(info=>{
        const remPct = Number.isFinite(info?.remPct) ? info.remPct : 100;
        const amountOrig = Number(info?.amountUsdOrig ?? info?.amountUsd ?? 0);
        const amountRem  = Number(info?.amountUsdRem ?? info?.remUsd ?? (amountOrig * (remPct/100)));
        return remPct>0 && amountRem>0.0001;
      });

    // Precios + PnL live
    let sumOpenCost = 0;
    const aggs = [];
    for (const info of my){
      const currPx = await getUsdQuote({ mint: info?.mint||null, symbol: info?.symbol||"SOL", fallback: info?.entryUsd||0 });
      const calc = calcUnrealizedFor(info, currPx);
      sumOpenCost += Number(calc.costRem||0);
      aggs.push(calc);
    }
    const agg = aggregateUnrealized(aggs);
    const CAP = Number(process.env.DEMO_BANK_CAP || 1000);
    const libre = Math.max(0, CAP - sumOpenCost);

    // Realizado
    const today = new Date();
    const ymd = (d)=> d.toISOString().slice(0,10).replace(/-/g,"");
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek= new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay()+6)%7));
    const startOfMonth= new Date(today.getFullYear(), today.getMonth(), 1);

    let pnlHoy = {inv:0,pnl:0}, pnlSem = {inv:0,pnl:0}, pnlMes = {inv:0,pnl:0};
    try { pnlHoy = await sumClosedPnL({ mode, fromDay: ymd(startOfDay), toDay: ymd(today) }); } catch {}
    try { pnlSem = await sumClosedPnL({ mode, fromDay: ymd(startOfWeek), toDay: ymd(today) }); } catch {}
    try { pnlMes = await sumClosedPnL({ mode, fromDay: ymd(startOfMonth), toDay: ymd(today) }); } catch {}

    const pct = (x,y)=> y>0 ? (x/y*100) : 0;

    const txt = [
      "📊 <b>Resumen PnL</b> ("+mode+")",
      "⏱️ " + humanNowAR(),
      "— — —",
      "💵 <b>Libre:</b> $" + fmtUsd(libre),
      "📂 <b>Invertido (abiertos):</b> $" + fmtUsd(sumOpenCost),
      "📈 <b>PNL LIVE (abiertos):</b> " + (agg.totalUsd>=0?"+":"") + "$" + fmtUsd(agg.totalUsd) + " (" + (agg.pct>=0?"+":"") + fmtPct(agg.pct) + "%)",
      "— — —",
      "✅ <b>PNL (cerradas)</b>",
      "• <b>Hoy:</b> $" + fmtUsd(pnlHoy.pnl) + " (" + fmtPct(pct(pnlHoy.pnl, pnlHoy.inv)) + "%)",
      "• <b>Semana:</b> $" + fmtUsd(pnlSem.pnl) + " (" + fmtPct(pct(pnlSem.pnl, pnlSem.inv)) + "%)",
      "• <b>Mes:</b> $" + fmtUsd(pnlMes.pnl) + " (" + fmtPct(pct(pnlMes.pnl, pnlMes.inv)) + "%)",
    ].join("\n");

    await bot.sendMessage(chatId, txt, { parse_mode:"HTML", disable_web_page_preview:true });
  });
}
