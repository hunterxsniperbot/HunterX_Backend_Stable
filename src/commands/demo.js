// src/commands/demo.js

/**
 * Módulo: /demo
 * Alterna el modo demo (simulación) por usuario.
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function demoCommand(bot) {
  bot.onText(/\/demo/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Inicializa el estado demo si hace falta
    bot.demoMode = bot.demoMode || {};
    const current = bot.demoMode[userId] || false;

    // Alterna y notifica
    bot.demoMode[userId] = !current;
    const status = bot.demoMode[userId] ? 'activado' : 'desactivado';
    await bot.sendMessage(chatId, `🛠️ Modo DEMO ${status}.`);
  });
}
