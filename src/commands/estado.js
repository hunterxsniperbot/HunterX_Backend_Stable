// src/commands/estado.js (ESM)
const nf2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfb = (b) => {
  const mb = Number(b||0)/ (1024*1024);
  return `${nf2.format(mb)} MB`;
};
const nowAR = () => new Date().toLocaleString("es-AR", { hour12:false });

function flags(){
  const pick = (k) => process?.env?.[k];
  return {
    MODE:            pick("MODE") || "DEMO",
    REAL_DRY_RUN:    pick("REAL_DRY_RUN") || "1",
    SCAN_INTERVAL:   pick("SCAN_INTERVAL_MS") || pick("SNIPER_TICK_MS") || "15000",
    DEMO_BANK_CAP:   pick("DEMO_BANK_CAP") || "1000",
    M4_SIZE_USD:     pick("M4_SIZE_USD") || pick("M4_AUTOBUY_USD") || "20",
    HX_PNL_INTERVAL: pick("HX_PNL_INTERVAL") || "20",
    HX_RECEIPT_MODE: pick("HX_RECEIPT_MODE") || "partial_compact_close_full",
    TZ:              pick("TZ") || Intl.DateTimeFormat().resolvedOptions().timeZone || "—",
    GIT_TAG:         pick("GIT_TAG") || pick("TAG") || "—",
  };
}

function procStats(){
  const mu = process.memoryUsage();
  return {
    uptime:  Math.floor(process.uptime()),
    rss:     nfb(mu.rss),
    heap:    nfb(mu.heapUsed),
    node:    process.version,
  };
}

export default function registerEstado(bot){
  bot.onText(/^\/estado\b/i, async (msg) => {
    try{
      const chatId = msg.chat.id;
      const ps = procStats();
      const fg = flags();
      const lastTick = bot?._hxLastTickAt ? new Date(bot._hxLastTickAt).toLocaleString("es-AR", {hour12:false}) : "—";
      const sniperOn = bot?._hxSniperOn ? "ON" : "OFF";

      const lines = [
        `🧭 <b>HunterX — Estado</b> (${nowAR()})`,
        "",
        `<b>Proceso</b>`,
        `• Uptime: ${ps.uptime}s  • Node: ${ps.node}`,
        `• Memoria: RSS ${ps.rss} · Heap ${ps.heap}`,
        "",
        `<b>Parámetros</b>`,
        `• Scan interval: ${fg.SCAN_INTERVAL} ms`,
        `• DEMO bank cap: $${fg.DEMO_BANK_CAP}  • M4 size: $${fg.M4_SIZE_USD}`,
        `• HX_PNL_INTERVAL: ${fg.HX_PNL_INTERVAL}s`,
        `• TZ: ${fg.TZ}  • Tag: ${fg.GIT_TAG}`,
        "",
        `<b>Sniper</b>`,
        `• Estado: <b>${sniperOn}</b>  • Modo: <b>${fg.MODE}</b> (dryrun=${fg.REAL_DRY_RUN})`,
        `• Último tick: ${lastTick}`,
        "",
        `[ /control ]   [ /wallet ]   [ /registro ]`
      ];

      await bot.sendMessage(chatId, lines.join("\n"), { parse_mode:"HTML", disable_web_page_preview:true });
    }catch(e){
      console.error("/estado error:", e?.message||e);
    }
  });
}
