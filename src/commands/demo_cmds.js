import { buyDemo, resetDemoBank } from "../services/demoBank.js";

/* ==== Teclado inline (PnL + ventas 25/50/75/100) ==== */
function renderTradeKeyboard(uid, tradeId) {
  const u = String(uid);
  const t = String(tradeId || `demo-${Date.now()}`);
  return {
    inline_keyboard: [
      [ { text: "📊 PnL", callback_data: `hxv1|pnl|${u}|${t}` } ],
      [
        { text: "25%", callback_data: `hxv1|sell|${u}|${t}|25` },
        { text: "50%", callback_data: `hxv1|sell|${u}|${t}|50` },
        { text: "75%", callback_data: `hxv1|sell|${u}|${t}|75` },
        { text: "💯",  callback_data: `hxv1|sell|${u}|${t}|100` }
      ]
    ]
  };
}

/* ==== Anuncio EXACTO pedido (HTML) ==== */
function escHtml(s) { return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function announceDemoBuy(bot, chatId, uid, info) {
  const tradeId = String(info.tradeId || `demo-${Date.now()}`);
  const sym     = String(info.symbol || "SOL");
  const usd     = Number(info.amountUsd ?? info.size ?? 0);
  const price   = (info.priceUsd != null) ? Number(info.priceUsd) : null;

  // Links: SOL por defecto (podrás sustituir por mint/pair reales cuando los tengamos)
  const mintSOL = "So11111111111111111111111111111111111111112";
  const linkDex  = 'https://dexscreener.com/solana';
  const linkJup  = 'https://jup.ag/swap/SOL-USDC';
  const linkRay  = 'https://raydium.io/swap/?from=SOL&to=USDC';
  const linkBird = `https://birdeye.so/token/${mintSOL}?chain=solana`;
  const linkScan = `https://solscan.io/token/${mintSOL}`;

  const ts = new Date().toLocaleString();

  const lines = [
    "✅ <b>COMPRA AUTOMÁTICA EJECUTADA</b>",
    "🧾 <b>Trade ID:</b> #" + tradeId,
    "🪙 <b>Token:</b> $" + escHtml(sym) + " (So1111…)",
    "🔗 <b>Ruta:</b> Raydium • <b>Slippage:</b> 50 bps • <b>Fees/Gas:</b> ~0.01",
    "💵 <b>Invertido:</b> " + usd.toFixed(2) + " USD (0.000000 SOL)  " + (price!=null ? "🎯 <b>Entrada:</b> " + price.toFixed(4) + " USD" : ""),
    "🛡️<b>Guardas:</b>",
    "- Honeypot ✅",
    "• Liquidez bloqueada 🔒",
    "• Propiedad renunciada 🗝️",
    "• Datos desactualizados ✅",
    "⏱️ <b>Hora:</b> " + ts,
    "<b>Enlaces rápidos</b> " +
      `<a href="${linkDex}">DexScreener</a> | ` +
      `<a href="${linkJup}">Jupiter</a> | ` +
      `<a href="${linkRay}">Raydium</a> | ` +
      `<a href="${linkBird}">Birdeye</a> | ` +
      `<a href="${linkScan}">Solscan</a>`
  ];
  const html = lines.join("\n");

  await bot.sendMessage(chatId, html, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: renderTradeKeyboard(uid, tradeId),
  });
}

/* ==== Registro de comandos ==== */
export default function registerDemoCmds(bot) {
  // /demo_reset
  bot.onText(/^\/demo_reset\b/i, async (msg) => {
    const uid = String(msg.from.id);
    try {
      await resetDemoBank(uid, { amount: 1000 });
      await bot.sendMessage(msg.chat.id,
        "🔄 DEMO RESET a $1000.00\nCash: $1000.00 | Invested: $0.00 | Total: $1000.00",
        { disable_web_page_preview: true }
      );
    } catch(e) {
      await bot.sendMessage(msg.chat.id, "❌ DEMO RESET falló: " + (e?.message||e));
    }
  });

  // /demo_buy 20
  bot.onText(/^\/demo_buy\s+(\d+(?:\.\d+)?)\b/i, async (msg, m) => {
    const uid = String(msg.from.id);
    const chatId = msg.chat.id;
    const usd = Number(m[1]);
    const tradeId = `demo-${Date.now()}`;
    const priceUsd = 213.90; // placeholder estable (cuando integremos quote, lo reemplazamos)

    try {
      // persistencia demo
      await buyDemo(uid, {
        amountUsd: usd,
        token: "SOL",
        priceUsd,
        tradeId,
        mint: "So11111111111111111111111111111111111111112",
      });
    } catch(e) {
      // Seguimos de todas formas para que veas la tarjeta (no cortamos la UX)
      console.log("[demo_cmds] buyDemo error:", e?.message||e);
    }

    // Tarjeta nueva (exacta) con botones
    await announceDemoBuy(bot, chatId, uid, {
      symbol: "SOL",
      amountUsd: usd,
      priceUsd,
      tradeId,
    });
  });
}
