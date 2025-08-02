// src/commands/vertokens.js

/**
 * Módulo: /vertokens
 * Lista tokens recién lanzados.
 */
export default function verTokensCommand(bot, services) {
  bot.onText(/\/vertokens/, async (msg) => {
    const chatId = msg.chat.id;
    // Aquí llamas a tu scanNewTokens o stub:
    await bot.sendMessage(chatId, '👁️ Listando tokens nuevos...');
  });
}
