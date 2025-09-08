import fs from 'fs';

const file = 'src/commands/autoSniper.js';
const src = fs.readFileSync(file,'utf8');

// Bloque nuevo de announceAutoBuy (TEXTO EXACTO + ES en guardas)
const block = `
function announceAutoBuy(bot, uid, info) {
  try {
    const chatId = (bot._notifyChatByUid && bot._notifyChatByUid[uid]) ? bot._notifyChatByUid[uid] : Number(uid);

    // Datos que podamos tener del selector/compra
    const tradeId = String(info.trade?.id || info.tradeId || \`demo-\${Date.now()}\`);
    const sym     = String(info.symbol || info.trade?.token || '-');
    const size    = Number(info.size ?? info.trade?.amountUsd ?? 0);
    const price   = (info.trade && info.trade.priceUsd!=null) ? Number(info.trade.priceUsd) : null;

    // Mint / pair si están disponibles (para links reales)
    const mint    = info.mint || info.trade?.mint || null;
    const pair    = info.pair || info.trade?.pair || null;

    // Construcción de links (token reales si tenemos mint/pair)
    const linkDex  = pair ? \`https://dexscreener.com/solana/\${pair}\` : 'https://dexscreener.com/solana';
    const linkJup  = 'https://jup.ag/swap/SOL-USDC';
    const linkRay  = 'https://raydium.io/swap/?from=SOL&to=USDC';
    const linkBird = mint ? \`https://birdeye.so/token/\${mint}?chain=solana\` : 'https://birdeye.so/token/SOL?chain=solana';
    const linkScan = mint ? \`https://solscan.io/token/\${mint}\` : 'https://solscan.io/token/So11111111111111111111111111111111111111112';

    const ts = new Date().toLocaleString();

    // Texto EXACTO que pediste (línea por línea)
    const lines = [
      "✅ <b>COMPRA AUTOMÁTICA EJECUTADA</b>",
      "🧾 <b>Trade ID:</b> #" + tradeId,
      "🪙 <b>Token:</b> $" + escHtml(sym) + " (So1111…)",
      "🔗 <b>Ruta:</b> Raydium • <b>Slippage:</b> 50 bps • <b>Fees/Gas:</b> ~0.01",
      "💵 <b>Invertido:</b> " + size.toFixed(2) + " USD (0.000000 SOL)  " + (price!=null ? "🎯 <b>Entrada:</b> " + price.toFixed(4) + " USD" : ""),
      "🛡️<b>Guardas:</b>",
      "- Honeypot ✅",
      "• Liquidez bloqueada 🔒",
      "• Propiedad renunciada 🗝️",
      "• Datos desactualizados ✅",
      "⏱️ <b>Hora:</b> " + escHtml(ts),
      "<b>Enlaces rápidos</b> <a href=\\"" + linkDex + "\\">DexScreener</a> | <a href=\\"" + linkJup + "\\">Jupiter</a> | <a href=\\"" + linkRay + "\\">Raydium</a> | <a href=\\"" + linkBird + "\\">Birdeye</a> | <a href=\\"" + linkScan + "\\">Solscan</a>"
    ].filter(Boolean);

    const html = lines.join("\\n");

    // Guardar mapping para edición/acciones
    bot._hxMsgs  = bot._hxMsgs  || {};
    bot._hxMsgs[uid] = bot._hxMsgs[uid] || {};
    // teclado inline (por ahora "placeholders", Parte 2 cablea la lógica)
    const kb = {
      inline_keyboard: [[
        { text: "📊 PnL",         callback_data: \`hx:pnl:\${uid}:\${tradeId}\` },
        { text: "25%",            callback_data: \`hx:sell:\${uid}:\${tradeId}:25:demo\` },
        { text: "50%",            callback_data: \`hx:sell:\${uid}:\${tradeId}:50:demo\` },
        { text: "75%",            callback_data: \`hx:sell:\${uid}:\${tradeId}:75:demo\` },
        { text: "💯",             callback_data: \`hx:sell:\${uid}:\${tradeId}:100:demo\` }
      ]]
    };

    bot.sendMessage(chatId, html, { parse_mode: "HTML", disable_web_page_preview: true, reply_markup: kb })
      .then(m => {
        bot._hxMsgs[uid][tradeId] = { chatId, message_id: m.message_id };
        // Guardamos un snapshot mínimo para Parte 2
        bot._hxPos = bot._hxPos || {};
        bot._hxPos[uid] = bot._hxPos[uid] || {};
        bot._hxPos[uid][tradeId] = {
          tradeId, sym, mint, pair,
          entryPrice: price, sizeUsd: size, ts
        };
      })
      .catch(()=>{});
  } catch(_e) {}
}
`;

// Reemplazo seguro de la función (si existe), o la agrego al final
let out;
if (/function\s+announceAutoBuy\s*\(/s.test(src)) {
  out = src.replace(/function\s+announceAutoBuy\s*\([\s\S]*?\n\}\n/s, block + "\n");
} else {
  out = src + "\n\n// ===== HX insert (announceAutoBuy) =====\n" + block + "\n";
}

fs.writeFileSync(file, out);
console.log("✔ announceAutoBuy actualizado (formato + botones).");
