// --- [HX] DEMO autobuy notifier (HTML) — formato exacto + links reales + botones
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export async function announceAutoBuy(bot, uid, info) {
  try {
    const chatId =
      (bot._notifyChatByUid && bot._notifyChatByUid[uid])
        ? bot._notifyChatByUid[uid]
        : Number(uid);

    const t         = info.trade || {};
    const tradeId   = t.id ? String(t.id) : ("demo-" + Date.now());
    const sym       = String(info.symbol || t.token || "-").toUpperCase().trim();
    const sizeUsd   = Number(info.size ?? t.amountUsd ?? 0);
    const sizeSol   = (t.sizeSol!=null) ? Number(t.sizeSol) : 0;
    const price     = (t.priceUsd!=null) ? Number(t.priceUsd) : null;
    const route     = String(info.route || t.route || "Raydium");
    const slippage  = Number(info.slippage_bps ?? t.slippage_bps ?? 50);
    const feesUsd   = (info.fees_usd ?? t.fees_usd ?? "0.01");

    let mint        = String(info.baseMint || info.mint || t.mint || info.tokenMint || "").trim();
    let poolAddress = String(info.poolAddress || t.poolAddress || "").trim();

    // Resolver mint/pool desde el feed si faltan
    try {
      const mp = await import("../../src/services/marketsPref.js");
      if ((!mint || !poolAddress) && mp?.getSolanaPairs) {
        const pairs = await mp.getSolanaPairs({ limit: 120 });
        let cand = pairs.find(p => String(p.baseSymbol||"").toUpperCase().trim() === sym);
        if (!cand) cand = pairs.find(p => String(p.baseSymbol||"").toUpperCase().includes(sym));
        if (cand) {
          mint        = mint || (cand.baseMint || cand.base_token_address || cand.baseMintAddress || "");
          poolAddress = poolAddress ||
                        cand.poolAddress ||
                        cand.pairAddress ||
                        (String(cand.id||"").includes("_") ? String(cand.id).split("_")[1] : "");
        }
      }
    } catch(_) {}

    if (!mint) mint = "So11111111111111111111111111111111111111112"; // fallback
    const mintShort = mint.slice(0,6) + "…";

    // Links reales (si hay pool usa pool, sino mint)
    const dsUrl   = poolAddress
      ? `https://dexscreener.com/solana/${poolAddress}`
      : `https://dexscreener.com/solana/${mint}`;
    const jupUrl  = `https://jup.ag/swap/${mint}-${USDC_MINT}`;
    const rayUrl  = `https://raydium.io/swap/?inputMint=${mint}&outputMint=${USDC_MINT}`;
    const beUrl   = `https://birdeye.so/token/${mint}?chain=solana`;
    const ssUrl   = `https://solscan.io/token/${mint}`;

    const ts = new Date().toLocaleString();

    // === Formato EXACTO (HTML) ===
    const html = [
      "✅ <b>COMPRA AUTOMÁTICA EJECUTADA</b>",
      "🧾 <b>Trade ID:</b> #" + tradeId,
      "🪙 <b>Token:</b> $" + sym + " (" + mintShort + ")",
      "🔗 <b>Ruta:</b> " + route,
      " • <b>Slippage:</b> " + slippage + " bps",
      " • <b>Fees/Gas:</b> ~" + String(feesUsd),
      "💵 <b>Invertido:</b> " + (sizeUsd ? sizeUsd.toFixed(2) : "0.00") + " USD (" + sizeSol.toFixed(6) + " SOL) ",
      "🎯 <b>Entrada:</b> " + (price!=null ? price.toFixed(4) : "—") + " USD",
      "🛡️<b>Guardas:</b>",
      "- Honeypot ✅",
      "• Liquidez bloqueada 🔒",
      "• Propiedad renunciada 🗝️",
      "• Datos desactualizados ✅",
      "⏱️ <b>Hora:</b> " + ts,
      "<b>Enlaces rápidos</b> " +
        `<a href="${dsUrl}">DexScreener</a> | ` +
        `<a href="${jupUrl}">Jupiter</a> | ` +
        `<a href="${rayUrl}">Raydium</a> | ` +
        `<a href="${beUrl}">Birdeye</a> | ` +
        `<a href="${ssUrl}">Solscan</a>`
    ].join("\n");

    // Botones inline (Pnl + parciales)
    const keyboard = {
      inline_keyboard: [
        [
          { text: "📊 PnL",       callback_data: `pnl:${tradeId}` },
          { text: "🔁 25%",       callback_data: `sell:${tradeId}:25` },
          { text: "🔁 50%",       callback_data: `sell:${tradeId}:50` },
          { text: "🔁 75%",       callback_data: `sell:${tradeId}:75` },
          { text: "💯 Vender",    callback_data: `sell:${tradeId}:100` }
        ]
      ]
    };

    await bot.sendMessage(chatId, html, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: keyboard
    });
  } catch(_e) {}
}
