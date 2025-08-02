// src/commands/orderbook.js

/**
 * Módulo para ver el /orderbook
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function orderbookCommand(bot, services) {
  bot.onText(/\/orderbook/, async (msg) => {
    const chatId = msg.chat.id;
    // Ejemplo: usar services.quickNodeClient para leer libro de órdenes
    await bot.sendMessage(chatId, '📖 *Order Book BTC/USDT*:\nBid: …\nAsk: …', {
      parse_mode: 'Markdown'
    });
  });
}
