import sheets from "../services/sheets.js";
import { insertClosedTrade, tableForMode } from "../services/supa.js";
// src/bot/inlinePnlSell.js (canonical clean)
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

/* ===== Quotes (toast PnL) ===== */
async function getUsdQuote(symbol, mint, fallback) {
  try {
    const id = (symbol || "SOL").toUpperCase();
    const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`;
    const res = await fetch(url, { method:"GET", keepalive:false, cache:"no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const js = await res.json();
    const p = js?.data?.[id]?.price;
    if (Number.isFinite(p)) return Number(p);
  } catch {}
  return Number(fallback || 0);
}

/* ===== Card builder (refresca “Invertido”) ===== */
function buildTradeHtml(info) {
  const mintSOL = info.mint || "So11111111111111111111111111111111111111112";
  const linkDex  = "https://dexscreener.com/solana";
  const linkJup  = "https://jup.ag/swap/SOL-USDC";
  const linkRay  = "https://raydium.io/swap/?from=SOL&to=USDC";
  const linkBird = `https://birdeye.so/token/${mintSOL}?chain=solana`;
  const linkScan = `https://solscan.io/token/${mintSOL}`;

  const lines = [
    "✅ <b>COMPRA AUTOMÁTICA EJECUTADA</b>",
    "🧾 <b>Trade ID:</b> #"+escHtml(info.tradeId || "—"),
    "🪙 <b>Token:</b> $"+escHtml(info.symbol || "SOL")+" (So1111…)",
    "🔗 <b>Ruta:</b> Raydium • <b>Slippage:</b> 50 bps • <b>Fees/Gas:</b> ~0.01",
    "💵 <b>Invertido:</b> "+Number((info.amountUsdRem ?? info.remUsd) || 0).toFixed(2)+" USD (0.000000 SOL)  " +
      (info.entryUsd!=null ? "🎯 <b>Entrada:</b> "+Number(info.entryUsd).toFixed(4)+" USD" : ""),
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

/* ===== Recibos (ENV) ===== */
function __hxActiveMode(bot){
  try{
    if (bot?._hxMode?.mode) return String(bot._hxMode.mode).toUpperCase();
    if (process?.env?.HX_MODE) return String(process.env.HX_MODE).toUpperCase();
  }catch{}
  return "DEMO";
}

async function recordClose(info, uid){
  try{
    const nowIso = new Date().toISOString();
    const day    = nowIso.slice(0,10).replace(/-/g,"");
    const qtyAll = Number(info.qtyEntry||0);
    const entry  = Number(info.entryUsd||0);
    const avgOut = Number(info.avgExitPx||info.exitPx||0);
    const invUsd = Number(info.amountUsdOrig||info.amountUsd||0);

    // Si cerró 100%, qtySoldCum ≈ qtyEntry
    const pnlPct = (entry>0 && avgOut>0) ? ((avgOut/entry - 1)*100) : 0;
    const pnlUsd = (qtyAll>0 && entry>0 && avgOut>0) ? ((avgOut-entry)*qtyAll) : 0;

    const row = {
      uid: String(uid||""),
      mode: "DEMO",            // si tenés flag global para REAL, cámbialo aquí
      type: "sell",
      token: String(info.symbol||"—"),
      mint:  String(info.mint||""),
      entrada_usd: (entry||null),
      salida_usd:  (avgOut||null),      // usamos promedio de salida
      inversion_usd: invUsd,
      pnl_usd: pnlUsd,
      pnl_pct: pnlPct,
      red: "Solana",
      fuente: "bot_hunterx",
      url: "",
      extra: "",
      fecha_hora: nowIso,
      fecha_dia: Number(day)
    };

    try { await insertClosedTrade(row); } catch(e){ console.log("[recordClose] supa fail:", e?.message||e); }
    // opcional: append a Sheets si tenés appendTradeToSheet(row)
    // try { await appendTradeToSheet(row); } catch(e){}

  } catch(e){
    console.log("[recordClose] fatal:", e?.message||e);
  }
}


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

  // close (100%) minimal
  if (mode === "none") return;
  const lines = [
    "✂️ <b>VENTA TOTAL EJECUTADA</b>",
    `🧾 <b>Trade ID:</b> #${tradeId} • <b>Token:</b> $${symbol}`,
    `📤 <b>Precio. Salida:</b> ${exitPx!=null?Number(exitPx).toFixed(4):"—"}`,
    `⏱️ <b>Hora:</b> ${new Date().toLocaleString()}`
  ];
  await bot.sendMessage(chatId, lines.join("\n"), { parse_mode:"HTML", disable_web_page_preview:true });
}

/* ===== Handler principal ===== */
export default function registerInlinePnlSell(bot) {
  bot._hxMsgByKey  = bot._hxMsgByKey  || {};
  bot._hxTradeInfo = bot._hxTradeInfo || {};
  bot._hxOpLock    = bot._hxOpLock    || {};

  bot.on("callback_query", async (q) => {
    const data = String(q?.data || "");
    const m = data.match(/^hxv1\|(sell|pnl)\|(\d+)\|(demo-\d+)(?:\|(\d+))?$/);
    if (!m) return;

    const [, kind, uid, tradeId, pctStr] = m;
    const key    = `${uid}:${tradeId}`;
    const chatId = q?.message?.chat?.id;

    if (bot._hxOpLock[key]) {
      try { await bot.answerCallbackQuery(q.id, { text:"⏳ Procesando…", show_alert:false }); } catch {}
      return;
    }
    bot._hxOpLock[key] = 1;

    try {
      const info = bot._hxTradeInfo[key];
      if (!info) {
        try { await bot.answerCallbackQuery(q.id, { text:"ℹ️ Sin info de trade", show_alert:false }); } catch {}
        return;
      }

      // defaults seguros
      info.amountUsdOrig = Number(info.amountUsdOrig ?? info.amountUsd ?? 0);
      // aceptar ambos nombres por compatibilidad
      info.amountUsdRem  = Number(info.amountUsdRem ?? info.remUsd ?? info.amountUsd ?? 0);
      info.entryUsd      = Number(info.entryUsd ?? 0);
      info.remPct        = Number.isFinite(info.remPct) ? info.remPct : 100;
      info.qtyEntry      = Number(info.qtyEntry ?? (info.entryUsd>0 ? info.amountUsdOrig / info.entryUsd : 0));
      info.qtySoldCum    = Number(info.qtySoldCum ?? 0);
      info.exitPxCum     = Number(info.exitPxCum ?? 0);

      if (kind === "pnl") {
        const curr = await getUsdQuote(info.symbol, info.mint, info.entryUsd);
        const pnlPct = info.entryUsd ? ((curr - info.entryUsd)/info.entryUsd)*100 : 0;
        const pnlUsd = info.amountUsdOrig ? (info.amountUsdOrig * (curr/info.entryUsd - 1)) : 0;
        try { await bot.answerCallbackQuery(q.id, { text: `📊 ${pnlPct.toFixed(2)}% (${pnlUsd.toFixed(2)}) • ${curr.toFixed(4)}`, show_alert:false }); } catch {}
        return;
      }

      // === SELL: porcentaje sobre REMANENTE ===
      let btnPct = Math.max(1, Math.min(100, Number(pctStr || 0) || 0)); // 25/50/75/100 del remanente
      if (info.remPct <= 0 || info.amountUsdRem <= 0) {
        try { await bot.answerCallbackQuery(q.id, { text:"⚠️ Ya no queda remanente", show_alert:true }); } catch {}
        return;
      }

      const soldUsd   = info.amountUsdRem * (btnPct / 100);        // USD vendidos ahora (sobre remanente)
      const remUsdNew = Math.max(0, info.amountUsdRem - soldUsd);  // USD remanentes
      const remPctNew = Math.max(0, info.remPct - (info.remPct * (btnPct/100))); // % remanente

      // placeholder de precio de salida (hasta tener fill/tx real)
      const exitPx     = info.entryUsd || null;
      const soldQtyNow = (exitPx && exitPx>0) ? (soldUsd / exitPx) : 0;

      // acumular promedio de salida
      info.qtySoldCum = Number(info.qtySoldCum||0) + soldQtyNow;
      info.exitPxCum  = Number(info.exitPxCum||0)  + (soldQtyNow * (exitPx || 0));
      const avgExitPx = (info.qtySoldCum>0 && info.exitPxCum>0) ? (info.exitPxCum / info.qtySoldCum)
                                                                : (info.entryUsd || null);

      // clamp + redondeo
      const __round = (n,d)=>Math.round(n*Math.pow(10,d))/Math.pow(10,d);
      info.amountUsdRem = __round(remUsdNew,2);
      info.remPct       = __round(remPctNew,3);

      // refrescar tarjeta principal
      await editBuyCard(bot, uid, tradeId);

      // recibo abajo
      if (chatId) {
        await sendReceipt(bot, chatId, (info.remPct>0 ? "partial" : "close"), {
          tradeId, symbol: info.symbol,
          soldUsd, pct: btnPct,
          remUsd: info.amountUsdRem, rem: info.remPct,
          exitPx, avgExitPx
        });
      }

      // cierre total: liberar DEMO y guardar cierre
      if (info.remPct <= 0 || info.amountUsdRem <= 0.001) {
        try { await sellAllDemo(uid, tradeId); } catch {}
        // registro local + supabase (si existe)
        const close = {
          uid, tradeId, symbol: info.symbol || "SOL", mint: info.mint,
          entry_px: info.entryUsd || null,
          exit_px_avg: avgExitPx || exitPx || null,
          invested_usd: info.amountUsdOrig,
          // pnl% (aprox al no tener fee/slip real aquí)
          pnl_pct: (info.entryUsd && avgExitPx) ? ((avgExitPx-info.entryUsd)/info.entryUsd)*100 : 0,
          closed_at: new Date().toISOString()
        };
        try { await recordClose(close); } catch(e){ console.log("[close][local] warn:", e?.message||e); }
        }

      try { await bot.answerCallbackQuery(q.id, { text: `✂️ Vendido ${btnPct}% (remanente ${info.remPct}%)`, show_alert:false }); } catch {}
    } catch(e){
      console.error("[inlinePnlSell] error:", e?.message || e);
      try { await bot.answerCallbackQuery(q.id, { text: "❌ Error", show_alert:true }); } catch {}
    } finally {
      bot._hxOpLock[key] = 0;
    }
  });
}
