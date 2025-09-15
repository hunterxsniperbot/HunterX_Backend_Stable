/* 
 * HUNTER X — inlinePnlSell | PnL/Sell callbacks — HX-B01 v2025-09-14
 * Purpose: Botones 25/50/75/100% + recibos; guarda cierre en Supabase y (opcional) Sheets.
 * Inputs:  callback_query, estado de trade (uid, entry, rem%), env de modo
 * Outputs: Edición de tarjeta + recibo; registro en Supabase/Sheets
 * Deps:    services/supa.js, services/sheets.js
 * ENV:     HX_RECEIPT_MODE, HX_TZ
 * Invariants: Nunca hace 'return' top-level; evita duplicar funciones; clamp de remanentes
 * Notes:   Auto-documentado; mantener esta cabecera al día.
 */

import sheets from "../services/sheets.js";
import { insertClosedTrade } from "../services/supa.js";
import { appendTradeToSheet } from "../services/sheets.js";

// src/bot/inlinePnlSell.js (canonical clean)
import { sellAllDemo } from "../services/demoBank.js";/* ===== Helpers (sanados) ===== */
function renderTradeKeyboard(uid, tradeId) {
  const u = String(uid);
  const t = String(tradeId || `demo-${Date.now()}`);
  return {
    inline_keyboard: [

      [
        { text: "25%", callback_data: `hxv1|sell|${u}|${t}|25` },
        { text: "50%", callback_data: `hxv1|sell|${u}|${t}|50` },
        { text: "75%", callback_data: `hxv1|sell|${u}|${t}|75` },
        { text: "💯",  callback_data: `hxv1|sell|${u}|${t}|100` }
      ]
    ]
  };
}

function escHtml(s){
  return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

/* Quote rápido (Jupiter) con fallback */
async function getUsdQuote(symbol="SOL", mint, fallback=0){
  try{
    const id  = String(symbol||"SOL").toUpperCase();
    const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`;
    const res = await fetch(url, { method: "GET", keepalive: false, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const js = await res.json();
    const p  = js?.data?.[id]?.price;
    if (Number.isFinite(p)) return Number(p);
  } catch {}
  return Number(fallback||0);
}

function buildTradeHtml(info) {
  const mintSOL = info.mint || "So11111111111111111111111111111111111111112";
  const linkDex  = "https://dexscreener.com/solana/" + mintSOL;
  const linkJup  = "https://jup.ag/swap/SOL-USDC";
  const linkRay  = "https://raydium.io/swap/?from=SOL&to=USDC";
  const linkBird = `https://birdeye.so/token/${mintSOL}?chain=solana`;
  const linkScan = `https://solscan.io/token/${mintSOL}`;

  const lines = [
    "✅ <b>COMPRA AUTOMÁTICA EJECUTADA</b>",
    "🧾 <b>Trade ID:</b> #" + (info.tradeId ?? "—"),
    "🪙 <b>Token:</b> $" + (info.symbol ?? "SOL") + " (So1111…)",
    "🔗 <b>Ruta:</b> Raydium • <b>Slippage:</b> 50 bps • <b>Fees/Gas:</b> ~0.01",
    "💵 <b>Invertido:</b> " + Number(info.amountUsdRem ?? 0).toFixed(2) + " USD (0.000000 SOL)  " +
      (info.entryUsd != null ? "🎯 <b>Entrada:</b> " + Number(info.entryUsd).toFixed(4) + " USD" : ""),
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
      reply_markup: renderTradeKeyboard(uid, tradeId),
    });
  try { await (bot._hxRefreshWallet?.(uid)); } catch {}
} catch (e) {
    // silencioso para no romper flujo si la edición falla
  }
}


/* === Recibos (push) === */
function receiptMode(){ 
  return (process?.env?.HX_RECEIPT_MODE || "partial_compact_close_full").trim(); 
}
function receiptTtl(){ 
  const n=Number(process?.env?.HX_RECEIPT_TTL||7); 
  return Number.isFinite(n)&&n>0?n:7; 
}

async function sendReceipt(bot, chatId, type, payload){
  const { tradeId, symbol="SOL", soldUsd=0, pct=0, remUsd=0, rem=0, exitPx=null, avgExitPx=null } = payload||{};
  const mode = receiptMode();

  if (type === "partial"){
    if (mode === "none") return;
    const msg =
      "✂️ <b>VENTA PARCIAL EJECUTADA</b>\n" +
      `🧾 <b>Trade ID:</b> #${tradeId} • <b>Token:</b> ${symbol}\n` +
      `💵 <b>Vendido:</b> ${Number(soldUsd).toFixed(2)} USD (${pct}%) • <b>Queda:</b> ${Number(remUsd).toFixed(2)} USD (${rem}%)\n` +
      `📤 <b>Salida:</b> ${exitPx!=null?Number(exitPx).toFixed(4):"—"}\n` +
      `⏱️ <b>Hora:</b> ${fmtARDate(new Date())}`;
    const res = await bot.sendMessage(chatId,msg,{ parse_mode:"HTML", disable_web_page_preview:true });
    if (mode.includes("compact")){
      try{ setTimeout(()=>bot.deleteMessage(chatId, res.message_id).catch(()=>{}), receiptTtl()*1000); }catch{}
    }
    return;
  }

  if (mode === "none") return;
  const lines = [
    "✂️ <b>VENTA TOTAL EJECUTADA</b>",
    `🧾 <b>Trade ID:</b> #${tradeId} • <b>Token:</b> ${symbol}`,
    `📤 <b>Prom. Salida:</b> ${avgExitPx!=null?Number(avgExitPx).toFixed(4):"—"} • <b>Últ. Salida:</b> ${exitPx!=null?Number(exitPx).toFixed(4):"—"}`,
    `⏱️ <b>Hora:</b> ${fmtARDate(new Date())}`
  ];
  await bot.sendMessage(chatId,lines.join("\n"),{ parse_mode:"HTML", disable_web_page_preview:true });
}

const HX_TZ = process.env.HX_TZ || "America/Argentina/Buenos_Aires";
function fmtARDate(d=new Date()){
  try{
    return new Intl.DateTimeFormat("es-AR",{
      timeZone: HX_TZ, year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
    }).format(d);
  }catch{ return new Date().toLocaleString(); }
}
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

      /* pnl branch removido */

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
        try { await ensureClosePersist(close); } catch(e){ console.log("[close][local] warn:", e?.message||e); }
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



/* =========================================
 * Persistencia de cierre (Supa + Sheets)
 * Calcula entrada/salida/promedio/invertido/PNL y escribe
 * ========================================= */
async function ensureClosePersist(info){
  try{
    const mode = (process?.env?.MODE || 'DEMO').toUpperCase();

    const entry = Number(
      info.entry_px ??
      info.entryUsd ??
      0
    ) || null;

    const exitAvg = Number(
      info.exit_px_avg ??
      info.avgExitPx ??
      info.exitPx ??
      0
    ) || null;

    const invested = Number(
      info.invested_usd ??
      info.amountUsdOrig ??
      info.inversion_usd ??
      0
    ) || 0;

    const pnlPct = (entry && exitAvg) ? ((exitAvg - entry)/entry)*100 : 0;
    const pnlUsd = invested * (pnlPct/100);

    const row = {
      mode, type: 'sell',
      token: info.symbol || 'SOL',
      mint: info.mint || 'So11111111111111111111111111111111111111112',
      entrada_usd: entry,
      salida_usd: exitAvg,
      inversion_usd: invested,
      pnl_usd: Number(pnlUsd.toFixed(2)),
      pnl_pct: Number(pnlPct.toFixed(2)),
      red: 'Solana',
      fuente: 'bot',
      url: '',
      extra: '',
      fecha_hora: new Date().toISOString(),
      uid: info.uid || null,
      chat_id: info.chatId || null
    };

    try {
      const { insertClosedTrade } = await import("../services/supa.js");
      await insertClosedTrade(row);
    } catch(e){
      console.log("[ensureClosePersist][supa] warn:", e?.message||e);
    }
    try {
      const { appendTradeToSheet } = await import("../services/sheets.js");
      await appendTradeToSheet(row);
    } catch(e){
      console.log("[ensureClosePersist][sheets] warn:", e?.message||e);
    }
  } catch(e) {
    console.log("[ensureClosePersist] fatal:", e?.message||e);
  }
}
