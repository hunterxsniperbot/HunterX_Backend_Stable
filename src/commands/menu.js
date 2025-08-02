// src/commands/menu.js

/**
 * Módulo 2: Teclado táctil (Reply Keyboard)
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function menuCommand(bot, services) {
  // Al recibir /menu (o mejor aún, también al inicio) mostramos el Reply Keyboard:
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const keyboard = [
      ['📡 Tendencias', '👁️ Tokens nuevos'],
      ['🎯 Sniper ON', '🔴 Sniper OFF'],
      ['⚙️ Configurar', '💼 Cartera'],
      ['📊 Historial',  '🛠️ Demo ON/OFF'],
      ['🆘 Ayuda']
    ];
    await bot.sendMessage(chatId,
      'Selecciona una opción:', {
        reply_markup: {
          keyboard,
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
  });

  // Manejador de respuesta a esos botones
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text   = msg.text;

    // Ignoramos si es un comando con slash
    if (text.startsWith('/')) return;

    switch (text) {
      case '📡 Tendencias':
        return bot.sendMessage(chatId, '📡 Mostrando tendencias en Discord...');
      case '👁️ Tokens nuevos':
        return bot.sendMessage(chatId, '👁️ Listando tokens nuevos...');
      case '🎯 Sniper ON':
        return bot.sendMessage(chatId, '🎯 Sniper Automático ACTIVADO');
      case '🔴 Sniper OFF':
        return bot.sendMessage(chatId, '🔴 Sniper detenido');
      case '⚙️ Configurar':
        return bot.sendMessage(chatId, '⚙️ Abriendo configuración del sniper...');
      case '💼 Cartera':
        return bot.sendMessage(chatId, '💼 Mostrando cartera...');
      case '📊 Historial':
        return bot.sendMessage(chatId, '📊 Cargando historial...');
      case '🛠️ Demo ON/OFF':
        return bot.sendMessage(chatId, '🛠️ Modo DEMO alternado');
      case '🆘 Ayuda':
        return bot.sendMessage(chatId, '🆘 Aquí tienes ayuda rápida...');
      default:
        // Para cualquier otro texto, puedes ignorar o reenviar...
        return;
    }
  });
}
