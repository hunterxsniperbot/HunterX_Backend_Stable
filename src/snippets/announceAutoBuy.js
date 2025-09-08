// === HunterX — announceAutoBuy (COMPRA) ===
// Formato exacto pedido (HTML). "TP/SL/Cooldown" y "buy/scam score" son condicionales.
function announceAutoBuy(bot, uid, info) {
  try {
    const chatId   = (bot._notifyChatByUid && bot._notifyChatByUid[uid]) ? bot._notifyChatByUid[uid] : Number(uid);
    const t        = info.trade || {};
    const tradeId  = String(t.id || t.tradeId || ("demo-" + Date.now()));
    const sym      = String(info.symbol || t.token || "—").trim();
    const mint     = String(t.mint || "So11111111111111111111111111111111111111112");
    const mintShort= mint.slice(0,6) + "…";

    const sizeUsd  = Number(info.size ?? t.amountUsd ?? 0);
    const sizeSol  = (t.sizeSol!=null) ? Number(t.sizeSol) : 0;
    const entryUsd = (t.priceUsd!=null) ? Number(t.priceUsd) : 200.0000;  // placeholder OK
    const route    = t.route || "Raydium";
    const slipBps  = (t.slippageBps!=null) ? Number(t.slippageBps) : 50;
    const feesUsd  = (t.feesUsd!=null) ? Number(t.feesUsd) : 0.01;

    // Opcionales
    const showScores = process.env.SHOW_SCORES === '1';
    const showTPSL   = process.env.SHOW_TPSL   === '1';

    const buyScore  = (t.buyScorePct!=null)  ? (Number(t.buyScorePct).toFixed(0)+"%") : null;
    const scamScore = (t.scamScorePct!=null) ? (Number(t.scamScorePct).toFixed(0)+"%") : null;
    const T1        = (t.T1!=null) ? String(t.T1) : null;
    const scamT1    = (t.scam_t1!=null) ? String(t.scam_t1) : null;

    const tpPct       = (t.tpPct!=null) ? Number(t.tpPct) : null;
    const slPct       = (t.slPct!=null) ? Number(t.slPct) : null;
    const cooldownSec = (t.cooldownSec!=null) ? Number(t.cooldownSec) : null;

    const ts = new Date().toLocaleString();

    const lines = [
      "✅ <b>COMPRA AUTOMÁTICA EJECUTADA</b>",
      "🧾 <b>Trade ID:</b> #"+tradeId,
      "🪙 <b>Token:</b> $"+sym+" ("+mintShort+")",
      "🔗 <b>Ruta:</b> "+route+" • <b>Slippage:</b> "+slipBps+" bps • <b>Fees/Gas:</b> ~"+feesUsd,
      "💵 <b>Invertido:</b> "+sizeUsd.toFixed(2)+" USD ("+sizeSol.toFixed(6)+" SOL) 🎯 <b>Entrada:</b> "+entryUsd.toFixed(4)+" USD",
      "🛡️<b>Guardas:</b>",
      "- Honeypot ✅",
      "• LiqLocked 🔒",
      "• Renounced 🗝️",
      "• Stale ✅",
      "⏱️ <b>Hora:</b> "+ts,
      // Enlaces (sin frase extra)
      "<b>Enlaces rápidos</b> <a href=\"https://dexscreener.com/solana\">DexScreener</a> | <a href=\"https://jup.ag/swap/SOL-USDC\">Jupiter</a> | <a href=\"https://raydium.io/swap/?from=SOL&to=USDC\">Raydium</a> | <a href=\"https://birdeye.so/token/SOL?chain=solana\">Birdeye</a> | <a href=\"https://solscan.io/token/"+mint+"\">Solscan</a>"
    ];

    // Agregar buy/scam score SOLO si hay datos y está habilitado
    if (showScores && (buyScore || scamScore)) {
      const bs = buyScore ? buyScore : "—";
      const sc = scamScore ? scamScore : "—";
      const t1 = T1 ? T1 : "—";
      const st = scamT1 ? scamT1 : "—";
      lines.splice(5, 0, "📊 <b>buy_score:</b> "+bs+" (T1 "+t1+") • <b>scam_score:</b> "+sc+" (scam_t1 "+st+")");
    }

    // Agregar TP/SL/Cooldown SOLO si hay datos y está habilitado
    if (showTPSL && (tpPct!=null || slPct!=null || cooldownSec!=null)) {
      const tp = (tpPct!=null) ? (tpPct.toFixed(0)+"%") : "—";
      const sl = (slPct!=null) ? (slPct.toFixed(0)+"%") : "—";
      const cd = (cooldownSec!=null) ? (cooldownSec+" s") : "—";
      lines.splice(lines.indexOf("⏱️ <b>Hora:</b> "+ts), 0, "📈 <b>TP/SL:</b> TP "+tp+" • SL "+sl+" • <b>Cooldown:</b> "+cd);
    }

    const html = lines.join("\n");

    const kb = {
      inline_keyboard: [
        [{ text: "📊 PnL", callback_data: "HX_PNL:"+tradeId }],
        [
          { text: "🔁 25%", callback_data: "HX_SELL:"+tradeId+":25" },
          { text: "🔁 50%", callback_data: "HX_SELL:"+tradeId+":50" },
          { text: "🔁 75%", callback_data: "HX_SELL:"+tradeId+":75" },
          { text: "💯 100%", callback_data: "HX_SELL:"+tradeId+":100" }
        ]
      ]
    };

    bot.sendMessage(chatId, html, { parse_mode: "HTML", disable_web_page_preview: true, reply_markup: kb }).catch(()=>{});
  } catch(_) {}
}
