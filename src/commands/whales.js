// src/commands/whales.js

/**
 * Módulo /whales
 * Muestra actividad de ballenas.
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function whalesCommand(bot, services) {
  bot.onText(/\/whales/, async (msg) => {
    const chatId = msg.chat.id;
    // Ejemplo: consultar WhaleAlert vía services.whaleAlertClient
    const texto = [
      '🐳 *Actividad de Ballenas*',
      '• Compra 500 SOL — @Whale1',
      '• Venta 300 SOL — @Whale2',
      '• OTC 1000 SOL — @WhaleFund'
    ].join('\n');

    await bot.sendMessage(chatId, texto, { parse_mode: 'Markdown' });
  });
}
