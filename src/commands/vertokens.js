// src/commands/vertokens.js
export default function registerVerTokens(bot, { quickNodeClient }) {
  bot.onText(/\/vertokens/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const tokens = await quickNodeClient.scanNewTokens();
      if (!tokens.length) {
        return bot.sendMessage(chatId, '👁️ No hay tokens nuevos en este momento');
      }
      // Listamos los 5 primeros
      const list = tokens.slice(0,5)
        .map(t => `• ${t.symbol} (${t.metrics.volume.toFixed(0)} USD/m)`)
        .join('\n');
      await bot.sendMessage(chatId, `👁️ Tokens nuevos:\n${list}`);
    } catch (err) {
      console.error('❌ vertokens:', err);
      bot.sendMessage(chatId, '❌ Error al obtener tokens nuevos');
    }
  });
}
