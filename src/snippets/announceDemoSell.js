// === HunterX — announceDemoSell (VENTA PARCIAL) ===
function announceDemoSell(bot, chatId, t) {
  try {
    const tradeId = String(t.tradeId || t.id || ("demo-" + Date.now()));
    const sym     = String(t.symbol || t.token || "—").trim();

    const soldUsd    = Number(t.soldUsd ?? 0);
    const soldPct    = Number(t.soldPct ?? 0);
    const remainUsd  = Number(t.remainUsd ?? 0);
    const remainPct  = Number(t.remainPct ?? 0);
    const exitUsd    = (t.exitPriceUsd!=null) ? Number(t.exitPriceUsd) : 220.0000;
    const avgExitUsd = (t.avgExitPriceUsd!=null) ? Number(t.avgExitPriceUsd) : exitUsd;
    const pnlUsd     = (t.realizedPnlUsd!=null) ? Number(t.realizedPnlUsd) : 1.00;
    const pnlPct     = (t.realizedPnlPct!=null) ? Number(t.realizedPnlPct) : 10.00;
    const hold       = t.holdTime || "—";
    const mint       = String(t.mint || "So11111111111111111111111111111111111111112");
    const ts         = new Date().toLocaleString();

    const html = [
      "✂️ <b>VENTA PARCIAL EJECUTADA </b>",
      "🧾 <b>Trade ID:</b> #"+tradeId+" • <b>Token:</b> $"+sym,
      "💵 <b>Vendido:</b> "+soldUsd.toFixed(2)+" USD ("+soldPct+"%) • <b>Queda:</b> "+remainUsd.toFixed(2)+" USD ("+remainPct+"%)",
      "📤 <b>Salida:</b> "+exitUsd.toFixed(4)+" USD • <b>Prom. Salida:</b> "+avgExitUsd.toFixed(4)",
      "📈 <b>PnL realizado:</b> "+pnlUsd.toFixed(2)+" USD ("+pnlPct.toFixed(2)+"%)",
      "⏱️ <b>Tiempo en trade:</b> "+hold+" • <b>Hora:</b> "+ts,
      "<b>Enlaces rápidos</b> <a href=\"https://dexscreener.com/solana\">DexScreener</a> | <a href=\"https://jup.ag/swap/SOL-USDC\">Jupiter</a> | <a href=\"https://raydium.io/swap/?from=SOL&to=USDC\">Raydium</a> | <a href=\"https://birdeye.so/token/SOL?chain=solana\">Birdeye</a> | <a href=\"https://solscan.io/token/"+mint+"\">Solscan</a> Con los botones de pnl para actualizarlos cuando quiera y bonores de venta parcial 25 50 75 10"
    ].join("\n");

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

    bot.sendMessage(chatId, html, { parse_mode:"HTML", disable_web_page_preview:true, reply_markup: kb }).catch(()=>{});
  } catch(_) {}
}
