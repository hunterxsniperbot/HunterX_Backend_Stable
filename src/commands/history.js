// src/commands/history.js

/**
 * Módulo 9: /historial
 * Muestra operaciones cerradas del día.
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function historyCommand(bot, services) {
  bot.onText(/\/historial/, async (msg) => {
    const chatId = msg.chat.id;
    // Ejemplo de consulta a Supabase:
    // const { data } = await services.supabaseClient
    //   .from('trades')
    //   .select('*')
    //   .eq('date', new Date().toISOString().slice(0,10));

    const texto = [
      '📊 *Historial de Hoy*',
      '🪙 $SOLBOMB — +100% (+20 USD) — 14/07/2025 10:12',
      '🪙 $ANOTOKEN — -50% (-5 USD) — 14/07/2025 11:05',
    ].join('\n');

    await bot.sendMessage(chatId, texto, { parse_mode: 'Markdown' });
  });
}
