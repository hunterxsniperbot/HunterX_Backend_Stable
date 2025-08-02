// src/commands/cartera.js

/**
 * Módulo 8: /Mi Cartera
 * Muestra posiciones abiertas con botones de acción y enlaces.
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function carteraCommand(bot, services) {
  bot.onText(/\/cartera/, async (msg) => {
    const chatId = msg.chat.id;
    // Aquí iría tu lógica para recuperar de servicios.supabaseClient, quickNodeClient, etc.
    const texto = [
      '💼 *Mi Cartera*',
      '🏷️ $SOLCHAD — Invertido: 1000 USD — PnL: +28.1% (+281 USD)',
      '🏷️ $GEMBOMB — Invertido: 500 USD — PnL: -19% (-95 USD)',
      '💳 *Total disponible:* 8600 USD',
      '💷 *Libre para sniper:* 7100 USD',
    ].join('\n');

    // Envía el texto con botones (puedes ajustar los inline keyboards luego)
    await bot.sendMessage(chatId, texto, { parse_mode: 'Markdown' });
  });
}
