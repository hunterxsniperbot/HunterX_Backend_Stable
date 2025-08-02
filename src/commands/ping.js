// src/commands/ping.js

/**
 * Módulo /ping
 * Responde con “pong” y chequea latencia.
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function pingCommand(bot, services) {
  bot.onText(/\/ping/, async (msg) => {
    const chatId = msg.chat.id;
    const start = Date.now();
    const sentMessage = await bot.sendMessage(chatId, '🏓 Pong...');
    const latency = Date.now() - start;
    await bot.editMessageText(`🏓 Pong! Latencia: ${latency} ms`, {
      chat_id: chatId,
      message_id: sentMessage.message_id
    });
  });
}
