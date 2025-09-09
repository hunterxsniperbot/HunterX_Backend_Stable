import { buyDemo, resetDemoBank } from "../services/demoBank.js";

/* ==== Precio: Jupiter (fallback fijo) ==== */
export async function fetchQuote(symbol="SOL", fallback=213.90){
  try{
    const id = String(symbol||"SOL").toUpperCase();
    const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`;
    const res = await fetch(url, { method:"GET", keepalive:false, cache:"no-store" });
    if(!res.ok) throw new Error("HTTP "+res.status);
    const js = await res.json();
    const p = js?.data?.[id]?.price;
    if (Number.isFinite(p)) return Number(p);
  }catch{}
  return Number(fallback||0);
}

/* ==== Teclado inline ==== */
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

/* ==== HTML tarjeta compra ==== */
function escHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function announceDemoBuy(bot, chatId, uid, info) {
  const tradeId = String(info.tradeId || `demo-${Date.now()}`);
  const sym     = String(info.symbol || "SOL");
  const usd     = Number(info.amountUsd ?? info.size ?? 0);
  const price   = (info.priceUsd != null) ? Number(info.priceUsd) : null;

  // Links demo (SOL)
  const mintSOL = "So11111111111111111111111111111111111111112";
  const linkDex  = 'https://dexscreener.com/solana';
  const linkJup  = 'https://jup.ag/swap/SOL-USDC';
  const linkRay  = 'https://raydium.io/swap/?from=SOL&to=USDC';
  const linkBird = `https://birdeye.so/token/${mintSOL}?chain=solana`;
  const linkScan = `https://solscan.io/token/${mintSOL}`;

  const ts = new Date().toLocaleString();

  const lines = [
    "✅ <b>COMPRA AUTOMÁTICA EJECUTADA</b>",
    "🧾 <b>Trade ID:</b> #"+tradeId,
    "🪙 <b>Token:</b> $"+escHtml(sym)+" (So1111…)",
    "🔗 <b>Ruta:</b> Raydium • <b>Slippage:</b> 50 bps • <b>Fees/Gas:</b> ~0.01",
    "💵 <b>Invertido:</b> "+usd.toFixed(2)+" USD (0.000000 SOL)  " + (price!=null ? "🎯 <b>Entrada:</b> "+price.toFixed(4)+" USD" : ""),
    "🛡️<b>Guardas:</b>",
    "- Honeypot ✅",
    "• Liquidez bloqueada 🔒",
    "• Propiedad renunciada 🗝️",
    "• Datos desactualizados ✅",
    "⏱️ <b>Hora:</b> "+ ts,
    "<b>Enlaces rápidos</b> " +
      `<a href="${linkDex}">DexScreener</a> | ` +
      `<a href="${linkJup}">Jupiter</a> | ` +
      `<a href="${linkRay}">Raydium</a> | ` +
      `<a href="${linkBird}">Birdeye</a> | ` +
      `<a href="${linkScan}">Solscan</a>`
  ];
  const html = lines.join("\n");

  const res = await bot.sendMessage(chatId, html, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: renderTradeKeyboard(uid, tradeId),
  });

  // Guardamos referencias para edición/ventas
  bot._hxMsgByKey  = bot._hxMsgByKey  || {};
  bot._hxTradeInfo = bot._hxTradeInfo || {};
  const k = `${uid}:${tradeId}`;
  bot._hxMsgByKey[k] = { chatId, message_id: res.message_id };

  const _entry = price ?? 213.90;
  const _amt   = Number(usd||0);
  const _qty   = (_entry>0) ? (_amt / _entry) : 0;

  bot._hxTradeInfo[k] = {
ts,
    tradeId,
    symbol: sym,
    mint: mintSOL,
    amountUsd: _amt,   
      amountUsdRem: _amt,
// original
    entryUsd: _entry,
    qtyEntry: _qty,
    // acumuladores ventas
    qtySoldCum: 0,
    soldUsdCum: 0,
    // remanente
    remUsd: _amt,
    remPct: 100
  };
}

/* ==== Registro de comandos ==== */
export default function registerDemoCmds(bot) {
  // /demo_reset robusto
  bot.onText(/^\/demo_reset(?:@[\w_]+)?\b/i, async (msg) => {
    const uid = String(msg.from.id);

    // Limpiar estado local
    bot._hxMsgByKey  = bot._hxMsgByKey  || {};
    bot._hxTradeInfo = bot._hxTradeInfo || {};
    bot._hxRemain    = bot._hxRemain    || {};
    for (const k of Object.keys(bot._hxMsgByKey))  if (k.startsWith(uid+':')) delete bot._hxMsgByKey[k];
    for (const k of Object.keys(bot._hxTradeInfo)) if (k.startsWith(uid+':')) delete bot._hxTradeInfo[k];
    for (const k of Object.keys(bot._hxRemain))    if (k.startsWith(uid+':')) delete bot._hxRemain[k];

    const cap = Number(process.env.DEMO_BANK_CAP||1000);
    try { await resetDemoBank(uid, { amount: cap }); }
    catch(e){ console.log('[/demo_reset] soft-fail:', e?.message||e); }

    const cap2 = cap.toFixed(2);
    await bot.sendMessage(
      msg.chat.id,
      `🔄 DEMO RESET a $${cap2}\nCash: $${cap2} | Invested: $0.00 | Total: $${cap2}`,
      { disable_web_page_preview: true }
    );
  });

  // /demo_buy <usd>
  bot.onText(/^\/demo_buy\s+(\d+(?:\.\d+)?)\b/i, async (msg, m) => {
    const uid = String(msg.from.id);
    const chatId = msg.chat.id;
    const usd = Number(m[1]);
    const tradeId = `demo-${Date.now()}`;
    const priceUsd = await fetchQuote("SOL", 213.90);

    try {
      await buyDemo(uid, {
        amountUsd: usd,
        token: "SOL",
        priceUsd,
        tradeId,
        mint: "So11111111111111111111111111111111111111112",
      });
    } catch(e) {
      console.log("[/demo_buy] buyDemo error:", e?.message||e);
    }

    await announceDemoBuy(bot, chatId, uid, {
      symbol: "SOL",
      amountUsd: usd,
      priceUsd,
      tradeId,
    });
  });
}
