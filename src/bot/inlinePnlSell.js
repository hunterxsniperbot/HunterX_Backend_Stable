// src/bot/inlinePnlSell.js
import { sellAllDemo } from "../services/demoBank.js";

export default function registerInlinePnlSell(bot) {
  // Estado en memoria por sesión del bot
  bot._hxRemain = bot._hxRemain || {};  // { "uid:tradeId": 0..100 }
  bot._hxOpLock = bot._hxOpLock || {};  // locks anti doble click

  bot.on("callback_query", async (q) => {
    const data = String(q?.data || "");
    // Formatos esperados:
    //  - hxv1|pnl|<uid>|<tradeId>
    //  - hxv1|sell|<uid>|<tradeId>|<pct>
    const m = data.match(/^hxv1\|(sell|pnl)\|(\d+)\|(demo-\d+)(?:\|(\d+))?$/);
    if (!m) return;

    const [, kind, uid, tradeId, pctStr] = m;
    const key = `${uid}:${tradeId}`;
    const chatId = q?.message?.chat?.id;

    // Anti reentrancia
    if (bot._hxOpLock[key]) {
      try { await bot.answerCallbackQuery(q.id, { text: "⏳ Procesando…", show_alert: false }); } catch {}
      return;
    }
    bot._hxOpLock[key] = 1;

    try {
      if (kind === "pnl") {
        // Placeholder: sólo confirmamos refresh (la cotización la agregamos luego)
        try { await bot.answerCallbackQuery(q.id, { text: "📊 PnL refrescado", show_alert: false }); } catch {}
        return;
      }

      // kind === "sell"
      let pct = Math.max(1, Math.min(100, Number(pctStr || 0) || 0));
      let rem = bot._hxRemain[key];
      if (rem == null) rem = 100; // primera vez, 100% remanente

      if (rem <= 0) {
        try { await bot.answerCallbackQuery(q.id, { text: "⚠️ Ya no queda remanente", show_alert: true }); } catch {}
        return;
      }

      if (pct > rem) pct = rem; // clamp

      // Si vendemos el 100% del remanente -> cerrar posición demo en el banco
      if (pct === rem) {
        try { await sellAllDemo(uid, tradeId); } catch (e) {
          // si falla, no rompemos la UX
          console.log("[inlinePnlSell] sellAllDemo error:", e?.message || e);
        }
        rem = 0;
      } else {
        rem = rem - pct;
      }

      bot._hxRemain[key] = rem;

      // Feedback inmediato
      try { await bot.answerCallbackQuery(q.id, { text: `✂️ Vendido ${pct}% (remanente ${rem}%)`, show_alert: false }); } catch {}
      if (chatId) {
        await bot.sendMessage(
          chatId,
          `✂️ <b>VENTA PARCIAL EJECUTADA</b>\n<b>Trade ID:</b> #${tradeId} • <b>Vendido:</b> ${pct}% • <b>Remanente:</b> ${rem}% • <b>Hora:</b> ${new Date().toLocaleString()}`,
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
      }
    } catch (e) {
      console.error("[inlinePnlSell] error:", e?.message || e);
      try { await bot.answerCallbackQuery(q.id, { text: "❌ Error en venta", show_alert: true }); } catch {}
    } finally {
      bot._hxOpLock[key] = 0;
    }
  });
}
