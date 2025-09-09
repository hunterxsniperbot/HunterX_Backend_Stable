// src/commands/registro.js
import { listClosedTrades } from "../services/supa.js";

/* ===== Helpers ===== */
function mesES(i){
  return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio",
          "Agosto","Septiembre","Octubre","Noviembre","Diciembre"][i]||"Mes";
}
function sheetTabName(mode, dt){
  const d = new Date(dt||Date.now());
  return `${mode}_${mesES(d.getMonth())}_${d.getFullYear()}`;
}
function yyyymmdd(d){
  return Number(new Date(d||Date.now()).toISOString().slice(0,10).replace(/-/g,""));
}
function fmt(n,dec=2){ const x = Number(n ?? 0); return Number.isFinite(x) ? x.toFixed(dec) : "0.00"; }
function safeDate(ts){ try{ return ts ? new Date(ts).toLocaleString() : "—"; }catch{ return "—"; } }

/* ===== Handler ===== */
export default function registerRegistro(bot){
  // /registro  | /registro hoy | /registro ayer | /registro 2025-09-09
  bot.onText(/^\/registro(?:\s+(hoy|ayer|\d{4}-\d{2}-\d{2}))?$/i, async (msg, match) => {
    const chatId = msg?.chat?.id;
    const uid    = String(msg?.from?.id || "0");      // <--- definido acá
    const mode   = (bot._hxUserMode?.[uid] || (process.env.MODE || "DEMO")).toUpperCase();

    // rango por defecto: HOY (si pasás fecha, se usa esa)
    const arg = (match?.[1]||"").toLowerCase();
    let dayInt = yyyymmdd(Date.now());
    if (arg === "ayer"){
      const d = new Date(); d.setDate(d.getDate()-1); dayInt = yyyymmdd(d);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)){
      dayInt = Number(arg.replace(/-/g,""));
    }

    try{
      // Trae últimos (hasta 5) del día/mode; filtro por uid en app (rápido y seguro)
      let rows = await listClosedTrades({ mode, day: dayInt, limit: 10 });
      rows = (rows||[]).filter(r => !r.uid || String(r.uid) === uid).slice(0,5);

      if (!rows.length){
        const msgNo = [
          "📊**VER POSICIONES CERRADAS** /registro",
          "",
          "No hay cierres para mostrar."
        ].join("\n");
        await bot.sendMessage(chatId, msgNo, { parse_mode: "Markdown" });
        return;
      }

      const sheetId = process.env.GOOGLE_SHEETS_ID || "";
      const tab     = sheetTabName(mode, rows[0]?.fecha_hora);
      const sheetUrl = sheetId
        ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=0&range=${encodeURIComponent(tab+"!A1")}`
        : "";

      const out = ["📊**VER POSICIONES CERRADAS** /registro"];
      for (const r of rows){
        const token = r.token || "—";
        const ent   = (r.entrada_usd!=null) ? fmt(r.entrada_usd,4) : "—";
        const sal   = (r.salida_usd!=null)  ? fmt(r.salida_usd,4)  : "—";
        const inv   = (r.inversion_usd!=null)? fmt(r.inversion_usd,2) : "0.00";
        const gUsd  = (r.pnl_usd!=null) ? fmt(r.pnl_usd,2) : "0.00";
        const gPct  = (r.pnl_pct!=null) ? fmt(r.pnl_pct,2) : "0.00";
        const when  = safeDate(r.fecha_hora);
        const dex   = "https://dexscreener.com/solana";
        const scan  = `https://solscan.io/token/${encodeURIComponent(r.mint||"")}`;

        out.push(
`🪙 **Token:** $${token}
📈 **Precio de entrada:** ${ent}
📤 **Precio de salida:** ${sal}
💵 **Invertido:** ${inv} USD
📈 **Ganancia:** ${gPct}% (+${gUsd} USD)
📅 ${when}
[📊 DexScreener](${dex})  [📎 Solscan](${scan})`
        );
      }

      if (sheetUrl) out.push(`\n[📲 Google Sheets](${sheetUrl})`);

      await bot.sendMessage(chatId, out.join("\n\n"), {
        parse_mode: "Markdown",
        disable_web_page_preview: false
      });

    }catch(e){
      await bot.sendMessage(chatId, `❌ /registro error: ${e?.message||e}`, { parse_mode: "Markdown" });
    }
  });
}
