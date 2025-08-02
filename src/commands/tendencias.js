// src/commands/tendencias.js

/**
 * Módulo: /tendencias
 * Muestra tendencias en Discord.
 */
export default function tendenciasCommand(bot, services) {
  bot.onText(/\/tendencias/, async (msg) => {
    const chatId = msg.chat.id;
    // Aquí conectas a tu módulo de Discord o stub:
    await bot.sendMessage(chatId, '📡 Mostrando tendencias en Discord...');
  });
}
