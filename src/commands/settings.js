// src/commands/settings.js
export default function registerSettings(bot) {
  // Manejador del comando /settings
  bot.onText(/\/settings/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    // Valor por defecto si no existe
    const cfg = bot.sniperConfig[userId] || { monto: 100 };

    // Texto y teclado inline
    const text = `💰 Monto de compra por operación: *\$${cfg.monto.toFixed(2)}*\n\n` +
                 `Pulsa el botón para cambiarlo:`;
    const reply_markup = {
      inline_keyboard: [
        [
          { 
            text: `✏️ Cambiar a \$${cfg.monto.toFixed(2)}`, 
            callback_data: `set_monto` 
          }
        ]
      ]
    };

    bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup
    });
  });

  // Manejador de los callbacks
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data === 'set_monto') {
      // 1) Pedimos el nuevo monto
      await bot.sendMessage(chatId, '➡️ Ingresa el nuevo monto de compra por operación (en USD):');
      
      // 2) Esperamos un único mensaje de respuesta de este usuario
      const responder = (msg) => {
        if (msg.chat.id !== chatId || msg.from.id !== userId) return;
        const val = parseFloat(msg.text.replace(/[^0-9.]/g, ''));
        if (isNaN(val) || val <= 0) {
          bot.sendMessage(chatId, '❌ Monto inválido. Usa /settings para intentarlo otra vez.');
        } else {
          // 3) Guardamos la nueva configuración
          bot.sniperConfig[userId] = {
            ...(bot.sniperConfig[userId] || {}),
            monto: val
          };
          bot.sendMessage(chatId, `✅ Monto actualizado a *\$${val.toFixed(2)}* USD`, { parse_mode: 'Markdown' });
        }
        // 4) Dejamos de escuchar
        bot.removeListener('message', responder);
      };

      bot.on('message', responder);
    }

    // IMPORTANT: responde al callback para quitar el “relojcito” en Telegram
    await bot.answerCallbackQuery(query.id);
  });
}
