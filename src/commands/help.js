// src/commands/help.js

/**
 * Módulo Ayuda Rápida: /help o /ayuda
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function helpCommand(bot, services) {
  bot.onText(/\/(help|ayuda)/, async (msg) => {
    const chatId = msg.chat.id;
    const texto = [
      '🆘 *Comandos disponibles:*',
      '/start — Iniciar HunterX',
      '/menu — Ver Menú Principal',
      '/autoSniper — Activar sniper automático',
      '/detener — Detener sniper',
      '/configurar — Configurar parámetros del sniper',
      '/cartera — Ver mi cartera',
      '/historial — Ver historial de operaciones',
      '/demo — Alternar modo DEMO',
      '/help — Esta ayuda rápida',
    ].join('\n');

    await bot.sendMessage(chatId, texto, { parse_mode: 'Markdown' });
  });
}
