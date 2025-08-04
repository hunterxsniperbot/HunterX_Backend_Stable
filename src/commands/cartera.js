// src/commands/cartera.js
export default function registerCartera(bot, { phantomClient }) {
  bot.onText(/\/cartera/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // 1) Recuperamos posiciones abiertas
      const positions = await phantomClient.getOpenPositions(userId);

      if (!positions || positions.length === 0) {
        return bot.sendMessage(chatId, '💼 No tienes posiciones abiertas');
      }

      // 2) Por cada posición, construimos un bloque con texto y botones
      for (const pos of positions) {
        // 2a) Calculamos PnL
        const pnlPercent = pos.currentPrice
          ? ((pos.currentPrice / pos.entryPrice - 1) * 100)
          : 0;
        const pnlUsd     = pos.currentPrice
          ? (pos.amountToken * pos.currentPrice - pos.amountUsd)
          : 0;

        // 2b) Texto a mostrar
        const text =
          `🪙 *${pos.tokenSymbol}*\n` +
          `📥 Entrada: ${pos.entryPrice.toFixed(6)}\n` +
          `📤 Actual:   ${pos.currentPrice.toFixed(6)}\n` +
          `💵 Invertido: $${pos.amountUsd.toFixed(2)}\n` +
          `📈 PnL: ${pnlPercent.toFixed(2)}% ($${pnlUsd.toFixed(2)})`;

        // 2c) Inline‐keyboard con ventas y enlaces
        const keyboard = {
          inline_keyboard: [
            [
              { text: '🔁 25%', callback_data: `sell_25_${pos.buyTxSignature}` },
              { text: '🔁 50%', callback_data: `sell_50_${pos.buyTxSignature}` }
            ],
            [
              { text: '🔁 75%', callback_data: `sell_75_${pos.buyTxSignature}` },
              { text: '💯 Vender', callback_data: `sell_100_${pos.buyTxSignature}` }
            ],
            [
              { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${pos.tokenMint}` },
              { text: '📎 Solscan',      url: `https://solscan.io/token/${pos.tokenMint}` }
            ]
          ]
        };

        // 3) Enviamos mensaje con teclado
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }

    } catch (err) {
      console.error('❌ Error de red al obtener cartera:', err);
      bot.sendMessage(chatId,
        '⚠️ No pude recuperar tus posiciones en este momento. ' +
        'Reintentá en unos segundos con /cartera, por favor.'
      );
    }
  });
}
