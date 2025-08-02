// src/commands/autoSniper.js

/**
 * Módulo 3: /autosniper
 * Escanea, filtra, compra y registra; permite detener con /detener o botón “🔴 Sniper OFF”.
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function autoSniperCommand(bot, services) {
  let intervalId = null;

  // Activar sniper automático
  bot.onText(/\/autosniper/, async (msg) => {
    const chatId = msg.chat.id;
    if (intervalId) {
      return bot.sendMessage(chatId, '⚠️ Sniper ya está activo');
    }
    await bot.sendMessage(chatId, '🤖 Sniper Automático ACTIVADO');

    intervalId = setInterval(async () => {
      try {
        const tokens = await services.quickNodeClient.scanNewTokens();
        for (const token of tokens) {
          const ageMin = (Date.now() - token.launchTimestamp) / 60000;
          const { liquidity, fdv, holders, volume } = token.metrics;

          // Filtros
          if (ageMin < 1 || ageMin > 5)      continue;
          if (liquidity < 150)              continue;
          if (fdv > 300_000)                continue;
          if (holders > 400)                continue;
          if (volume < 1_500)               continue;
          if (token.isHoneypot)             continue;
          if (!token.isRenounced)           continue;
          if (!token.whaleDetected)         continue;

          // Compra
          const tx = await services.phantomClient.buyToken({
            mint:     token.mintAddress,
            amountUsd: 100
          });

          // Registro en Supabase
          const trade = {
            user:      msg.from.id,
            token:     token.symbol,
            mint:      token.mintAddress,
            amount:    100,
            price:     token.currentPrice,
            tx,
            timestamp: new Date()
          };
          await services.supabaseClient.from('trades').insert([trade]);

          // Registro en Google Sheets
          await services.sheetsClient.appendRow([
            trade.timestamp.toISOString(),
            trade.user,
            trade.token,
            trade.amount,
            trade.price,
            trade.tx
          ]);

          // Notificación en chat
          await bot.sendMessage(
            chatId,
            `✅ Comprado ${token.symbol} por $${trade.amount}\nTx: ${trade.tx}`
          );
        }
      } catch (e) {
        console.error('Error en sniper loop:', e);
      }
    }, 5000);
  });

  // Detener sniper con /detener o botón “🔴 Sniper OFF”
  bot.on('message', (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    // Comando slash
    if (text === '/detener') {
      if (!intervalId) {
        return bot.sendMessage(chatId, '⚠️ Sniper no está activo');
      }
      clearInterval(intervalId);
      intervalId = null;
      return bot.sendMessage(chatId, '🛑 Sniper Automático DETENIDO');
    }

    // Botón táctil
    if (text === '🔴 Sniper OFF') {
      if (!intervalId) {
        return bot.sendMessage(chatId, '⚠️ Sniper no está activo');
      }
      clearInterval(intervalId);
      intervalId = null;
      return bot.sendMessage(chatId, '🛑 Sniper Automático DETENIDO (OFF)');
    }
  });
}
