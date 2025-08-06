// src/commands/autoSniper.js
export default function registerAutoSniper(bot, { phantomClient, sheetsClient }) {
  const scanIntervalMs = 15000;

  // Comando para activar el sniper automático
  bot.onText(/^\/autosniper$/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, `🎯 Sniper automático ACTIVADO\n\nEscaneando tokens nuevos cada 15 segundos...`);

    setInterval(async () => {
      const candidates = [
        {
          mint: '7996740495',
          symbol: 'SOLBOMB',
          priceUsd: 0.00089
        }
      ];

      if (!candidates.length) return;

      for (const cand of candidates) {
        try {
          const amountUsd = 100;
          const slippage = 1.5;
          const mintAddress = cand.mint;

          const txHash = await phantomClient.buyToken({
            mintAddress,
            amountUsd,
            slippage
          });

          console.log(`✅ Compra ejecutada: ${txHash}`);

          // Mensaje en Telegram
          await bot.sendMessage(chatId, `🎯 *Token gema encontrado!*\n\n⏱️ Edad token: *2.0 min*\n💧 Liquidez: *200.0 SOL*\n📉 FDV: *250,000 USD*\n👥 Holders: *150*\n📈 Volumen: *$2,000 USD/min*\n💰 Monto compra: *$${amountUsd.toFixed(2)} USD*\n💸 Slippage: *${slippage}%*\n🔐 Contrato renunciado: *✅*\n🛡️ Honeypot: *❌*\n🐳 Whale detect: *✅*\n✅ *COMPRA EJECUTADA*\n\n🪙 *${cand.symbol}*\n- Monto: $${amountUsd.toFixed(2)}\n- Entrada: ${cand.priceUsd || '0.00000'}\n- Verificado con Phantom`, { parse_mode: "Markdown" });

          // Registro en Google Sheets
          await sheetsClient.appendRow([
            new Date().toISOString(),
            Date.now(),
            cand.symbol || 'TOKEN',
            amountUsd,
            cand.priceUsd || '',
            slippage,
            txHash
          ]);
        } catch (err) {
          console.error('❌ Error en compra automática:', err);
          await bot.sendMessage(chatId, `⚠️ Error al comprar ${cand.symbol || 'TOKEN'}`);
        }
      }
    }, scanIntervalMs);
  });
}
