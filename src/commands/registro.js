// src/commands/registro.js — ESM: lee cierres del día desde Google Sheets y muestra el modo
export default (bot, { sheetsClient }) => {
  const fmt = (n, d=2) => (n===null||n===undefined||Number.isNaN(n)) ? '–' : Number(n).toFixed(d);

  bot.onText(/^\/registro\b/, async (msg) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);

    try {
      const today = new Date();
      const { rows, title } = await sheetsClient.listClosedTradesByDate({ date: today, uid });

      if (!rows.length) {
        const url = sheetsClient.getSheetUrlForMonth(today);
        return bot.sendMessage(
          chatId,
          `📊 *POSICIONES CERRADAS — Hoy*\n\nNo hay cierres por ahora.\n\n[📲 Google Sheets](${url})`,
          { parse_mode: 'Markdown', disable_web_page_preview: false }
        );
      }

      const lines = rows.slice(0, 30).map(r => {
        const gainPct = (r.entry && r.exit) ? ((r.exit/r.entry - 1) * 100) : null;
        const mode = r.mode || ''; const icon = mode === 'REAL' ? '🔵' : (mode === 'DEMO' ? '🟣' : '🔘');
        return (
          `${icon} ${mode || 'MODO'} — 🪙 $${r.token}\n` +
          `📥 Entrada: ${fmt(r.entry,6)}   📤 Salida: ${fmt(r.exit,6)}\n` +
          (r.investedUsd!=null ? `💵 Invertido: $${fmt(r.investedUsd,2)}\n` : '') +
          (r.pnlUsd!=null ? `📈 Ganancia: ${(r.pnlUsd>=0?'+':'')}$${fmt(r.pnlUsd,2)}${gainPct!=null?` (${gainPct>=0?'+':''}${fmt(gainPct,1)}%)`:''}\n` : '') +
          `📅 ${r.local || r.iso}\n` +
          `[📊 DexScreener](${r.dex})  [📎 Solscan](${r.sol})`
        );
      });

      const monthStats = await sheetsClient.computeMonthlyStats({ date: today, uid });
      try { await sheetsClient.renameMonthlySheetWithNet({ date: today, uid }); } catch {}

      const url = sheetsClient.getSheetUrlForMonth(today);
      const summary =
        `\n\n🟢 Resumen parcial *${monthStats.title}*\n` +
        `Balance Neto: ${(monthStats.net>=0?'+':'')}$${fmt(monthStats.net,2)}\n` +
        `Entradas: ${monthStats.entries}\n` +
        `Pérdidas: ${monthStats.losses}\n` +
        `Efectividad: ${fmt(monthStats.eff,1)}%`;

      const text = `📊 *POSICIONES CERRADAS — Hoy*\n\n` + lines.join('\n\n') + summary + `\n\n[📲 Google Sheets](${url})`;
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: false });
    } catch (e) {
      await bot.sendMessage(chatId, `⚠️ Error leyendo Google Sheets: ${e.message}`);
    }
  });
};
