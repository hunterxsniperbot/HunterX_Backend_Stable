// src/bot/inlinePnlSell.js (clean canonical)
import { sellAllDemo } from "../services/demoBank.js";

/* ===== UI helpers ===== */
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
function escHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

/* ===== Quotes (para toast PnL) ===== */
async function getUsdQuote(symbol, mint, fallback) {
  try {
    const id = (symbol || "SOL").toUpperCase();
    const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: "GET", keepalive: false, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const js = await res.json();
    const p = js?.data?.[id]?.price;
    if (Number.isFinite(p)) return Number(p);
  } catch {}
  return Number(fallback || 0);
}

/* ===== Card builder (usada para refrescar “Invertido”) ===== */
function buildTradeHtml(info) {
  const mintSOL = info.mint || "So11111111111111111111111111111111111111112";
  const linkDex  = "https://dexscreener.com/solana";
  const linkJup  = "https://jup.ag/swap/SOL-USDC";
  const linkRay  = "https://raydium.io/swap/?from=SOL&to=USDC";
  const linkBird = `https://birdeye.so/token/${mintSOL}?chain=solana`;
  const linkScan = `https://solscan.io/token/${mintSOL}`;

  const lines = [
    "✅ <b>COMPRA AUTOMÁTICA EJECUTADA</b>",
    "🧾 <b>Trade ID:</b> #" + escHtml(info.tradeId || "—"),
    "🪙 <b>Token:</b> $" + escHtml(info.symbol || "SOL") + " (So1111…)",
    "🔗 <b>Ruta:</b> Raydium • <b>Slippage:</b> 50 bps • <b>Fees/Gas:</b> ~0.01",
    "💵 <b>Invertido:</b> " + Number(info.amountUsdRem||0).toFixed(2) + " USD (0.000000 SOL)  " +
      (info.entryUsd!=null ? "🎯 <b>Entrada:</b> " + Number(info.entryUsd).toFixed(4) + " USD" : ""),
    "🛡️<b>Guardas:</b>",
    "- Honeypot ✅",
    "• Liquidez bloqueada 🔒",
    "• Propiedad renunciada 🗝️",
    "• Datos desactualizados ✅",
    "⏱️ <b>Hora:</b> " + new Date().toLocaleString(),
    "<b>Enlaces rápidos</b> " +
      `<a href="${linkDex}">DexScreener</a> | ` +
      `<a href="${linkJup}">Jupiter</a> | ` +
      `<a href="${linkRay}">Raydium</a> | ` +
      `<a href="${linkBird}">Birdeye</a> | ` +
      `<a href="${linkScan}">Solscan</a>`
  ];
  return lines.join("\n");
}

async function editBuyCard(bot, uid, tradeId) {
  try {
    const k   = `${uid}:${tradeId}`;
    const info= bot._hxTradeInfo?.[k];
    const ref = bot._hxMsgByKey?.[k];
    if (!info || !ref?.chatId || !ref?.message_id) return;

    const html = buildTradeHtml(info);
    await bot.editMessageText(html, {
      chat_id: ref.chatId,
      message_id: ref.message_id,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: renderTradeKeyboard(uid, tradeId)
    });
  } catch {}
}

/* ===== Recibos (controlados por ENV) ===== */
function receiptMode(){ return (process?.env?.HX_RECEIPT_MODE || "partial_compact_close_full").trim(); }
function receiptTtl(){ const n=Number(process?.env?.HX_RECEIPT_TTL||7); return Number.isFinite(n)&&n>0?n:7; }

async function sendReceipt(bot, chatId, type, payload) {
  const { tradeId, symbol="SOL", soldUsd=0, pct=0, remUsd=0, rem=0, exitPx=null, avgExitPx=null } = payload || {};
  const mode = receiptMode();

  if (type === "partial") {
    if (mode === "none") return;
    const msg =
      `✂️ <b>VENTA PARCIAL EJECUTADA</b>\n` +
      `🧾 <b>Trade ID:</b> #${tradeId} • <b>Token:</b> $${symbol}\n` +
      `💵 <b>Vendido:</b> ${Number(soldUsd).toFixed(2)} USD (${pct}%) • <b>Queda:</b> ${Number(remUsd).toFixed(2)} USD (${rem}%)\n` +
      `📤 <b>Salida:</b> ${exitPx!=null?Number(exitPx).toFixed(4):"—"}\n` +
      `⏱️ <b>Hora:</b> ${new Date().toLocaleString()}`;
    const res = await bot.sendMessage(chatId, msg, { parse_mode:"HTML", disable_web_page_preview:true });
    if (mode.includes("compact")) {
      try { setTimeout(()=>bot.deleteMessage(chatId, res.message_id).catch(()=>{}), receiptTtl()*1000); } catch {}
    }
    return;
  }

  // close (100%) — formato minimalista que pediste
  if (mode === "none") return;
  const lines = [
    "✂️ <b>VENTA TOTAL EJECUTADA</b>",
    `🧾 <b>Trade ID:</b> #${tradeId} • <b>Token:</b> $${symbol}`,
    `📤 <b>Precio. Entrada:</b> ${avgExitPx!=null && exitPx!=null ? "—" : "—"}`, // placeholder opcional
    `📤 <b>Precio. Salida:</b> ${exitPx!=null?Number(exitPx).toFixed(4):"—"}`,
    `⏱️ <b>Hora:</b> ${new Date().toLocaleString()}`
  ];
  await bot.sendMessage(chatId, lines.join("\n"), { parse_mode:"HTML", disable_web_page_preview:true });
}

/* ===== Handler principal ===== */
export default function registerInlinePnlSell(bot) {
  bot._hxMsgByKey  = bot._hxMsgByKey  || {}; // { "uid:tradeId": { chatId, message_id } }
  bot._hxTradeInfo = bot._hxTradeInfo || {}; // { "uid:tradeId": { amountUsdOrig, amountUsdRem, entryUsd, ... } }
  bot._hxOpLock    = bot._hxOpLock    || {};

  bot.on("callback_query", async (q) => {
    const data = String(q?.data || "");
    const m = data.match(/^hxv1\|(sell|pnl)\|(\d+)\|(demo-\d+)(?:\|(\d+))?$/);
    if (!m) return;

    const [, kind, uid, tradeId, pctStr] = m;
    const key    = `${uid}:${tradeId}`;
    const chatId = q?.message?.chat?.id;

    if (bot._hxOpLock[key]) {
      try { await bot.answerCallbackQuery(q.id, { text: "⏳ Procesando…", show_alert: false }); } catch {}
      return;
    }
    bot._hxOpLock[key] = 1;

    try {
      const info = bot._hxTradeInfo[key];
      if (!info) {
        try { await bot.answerCallbackQuery(q.id, { text: "ℹ️ Sin info de trade", show_alert: false }); } catch {}
        return;
      }

      // Defaults
      info.amountUsdOrig   = Number(info.amountUsdOrig ?? info.amountUsd ?? 0);
      info.amountUsdRem    = Number(info.amountUsdRem  ?? info.amountUsd ?? 0);
      info.entryUsd        = Number(info.entryUsd ?? 0);
      info.remPct          = Number.isFinite(info.remPct) ? info.remPct : 100;
      info.qtyEntry        = Number(info.qtyEntry ?? (info.entryUsd>0 ? info.amountUsdOrig / info.entryUsd : 0));
      info.qtySoldCum      = Number(info.qtySoldCum ?? 0);
      info.realizedUsdCum  = Number(info.realizedUsdCum ?? 0);

      if (kind === "pnl") {
        const curr   = await getUsdQuote(info.symbol, info.mint, info.entryUsd);
        const pnlPct = info.entryUsd ? ((curr - info.entryUsd)/info.entryUsd)*100 : 0;
        const pnlUsd = info.amountUsdRem ? (info.amountUsdRem * (curr/info.entryUsd - 1)) : 0;
        try { await bot.answerCallbackQuery(q.id, { text: `📊 ${pnlPct.toFixed(2)}% (${pnlUsd.toFixed(2)}) • ${curr.toFixed(4)}`, show_alert:false }); } catch {}
        return;
      }

      // SELL: porcentaje sobre REMANENTE
      let btnPct = Math.max(1, Math.min(100, Number(pctStr || 0) || 0)); // 25/50/75/100 del remanente
      if (info.remPct <= 0 || info.amountUsdRem <= 0) {
        try { await bot.answerCallbackQuery(q.id, { text: "⚠️ Ya no queda remanente", show_alert: true }); } catch {}
        return;
      }

      const soldPctOfOrig = info.remPct * (btnPct / 100);               // % del original vendido AHORA
      const soldUsd       = info.amountUsdRem * (btnPct / 100);         // USD vendidos AHORA (sobre remanente)
      const remPctNew     = Math.max(0, info.remPct - soldPctOfOrig);   // % del original remanente
      const remUsdNew     = Math.max(0, info.amountUsdRem - soldUsd);   // USD remanentes

      // Precio de salida en DEMO: usamos entryUsd como placeholder (consistente)
      const exitPx = info.entryUsd || null;

      // Promedio salida: acumulamos cantidad vendida y USD realizados
      const soldQtyNow = info.qtyEntry * (soldPctOfOrig / 100);
      info.qtySoldCum     += soldQtyNow;
      info.realizedUsdCum += soldQtyNow * (exitPx || 0);
      const avgExitPx = (info.qtySoldCum > 0) ? (info.realizedUsdCum / info.qtySoldCum) : null;

      // Aplicar nuevos remanentes
      info.remPct       = remPctNew;
      info.amountUsdRem = remUsdNew;

      // Refrescar card superior (💵 Invertido = remanente)
      await editBuyCard(bot, uid, tradeId);

      // Recibo (según modo)
      if (chatId) {
        await sendReceipt(bot, chatId, (remPctNew>0 ? 'partial' : 'close'), {
          tradeId,
          symbol: info.symbol || 'SOL',
          soldUsd,
          pct: btnPct,
          remUsd: remUsdNew,
          rem: Math.round(remPctNew),
          exitPx,
          avgExitPx
        });
      }

      // Cierre total: avisar a demoBank para /wallet y /registro coherentes
      if (remPctNew <= 0) {
        try { await sellAllDemo(uid, tradeId); } catch {}
      }

      // Toast
      try { await bot.answerCallbackQuery(q.id, { text: `✂️ Vendido ${btnPct}% (remanente ${Math.round(remPctNew)}%)`, show_alert:false }); } catch {}

    } catch(e) {
      console.error("[inlinePnlSell] error:", e?.message || e);
      try { await bot.answerCallbackQuery(q.id, { text: "❌ Error", show_alert:true }); } catch {}
    } finally {
      bot._hxOpLock[key] = 0;
    }
  });
}
