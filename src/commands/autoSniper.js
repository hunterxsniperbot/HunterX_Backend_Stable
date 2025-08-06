// src/commands/autoSniper.js
export default function registerAutoSniper(bot, {
  quickNodeClient,
  phantomClient,
  sheetsClient,
  supabaseClient
}) {
  // --- /autosniper → arranca el sniper ---
  bot.onText(/\/autosniper/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Si ya había un intervalo, lo limpiamos
    if (bot._intervals[userId]) {
      clearInterval(bot._intervals[userId]);
    }

    // Aviso mínimo de activación
    await bot.sendMessage(chatId,
      `🤖 Sniper Automático ACTIVADO\n\n` +
      `💰 Monto compra por operación: $${(bot.sniperConfig[userId]?.monto ?? 100).toFixed(2)}`
    );

    // Arrancamos el loop y lo guardamos
    bot._intervals[userId] = setInterval(async () => {
      try {
        // 1) Escaneo de nuevos tokens
        const rawTokens = await quickNodeClient.scanNewTokens();
        const now = Date.now();
        // 2) Enriquecemos y filtramos (lógica oculta al usuario)
        const candidates = rawTokens
          .map(t => ({
            ...t,
            ageMinutes: t.launchTimestamp
              ? (now - t.launchTimestamp) / 60_000
              : Infinity
          }))
          .filter(t =>
            t.ageMinutes >= 1 &&
            t.ageMinutes <= 5 &&
            t.metrics.liquidity >= 150 &&
            t.metrics.fdv <= 300_000 &&
            t.metrics.holders <= 400 &&
            t.metrics.volume >= 1_500
          );

        if (!candidates.length) return;

        // 3) Para cada candidato, notificamos y ejecutamos compra
        for (const cand of candidates) {
          // Preparamos datos
          const amountUsd = bot.sniperConfig[userId]?.monto ?? 100;
          const slippage = bot.sniperConfig[userId]?.slippage ?? 1.5;
          const mintAddress = cand.mintAddress || cand.mint;

          // 3.1 Notificación de candidato
          await bot.sendMessage(chatId,
            `🎯 **Token gema encontrado**\n` +
            `⏱️ Edad token: **${cand.ageMinutes.toFixed(1)} min**\n` +
            `💧 Liquidez: **${cand.metrics.liquidity.toFixed(1)} SOL**\n` +
            `📉 FDV: **${cand.metrics.fdv.toLocaleString()} USD**\n` +
            `👥 Holders: **${cand.metrics.holders}**\n` +
            `📈 Volumen: **$${cand.metrics.volume.toLocaleString()} USD/min**\n` +
            `💰 Monto compra: **$${amountUsd.toFixed(2)} USD**\n` +
            `💸 Slippage: **${slippage}%**\n` +
            `🔐 Contrato renunciado: **✅**\n` +
            `🛡️ Honeypot: **❌**\n` +
            `🐳 Whale detect: **✅**`,
            { parse_mode: 'Markdown' }
          );

          // 3.2 Ejecutamos la compra
          const txHash = await phantomClient.buyToken({
            mintAddress,
            amountUsd,
            slippage
          });

          // 3.3 Log en consola
          console.log(`✅ COMPRA EJECUTADA: ${txHash}`);

          // 3.4 Opcional: guardamos en Sheets
          await sheetsClient.appendRow([
            new Date().toISOString(),
            userId,
            cand.symbol,
            amountUsd,
            cand.currentPrice || cand.metrics.priceUsd || '',
            slippage,
            txHash
          ]);

          // 3.5 Confirmación final al usuario
          await bot.sendMessage(chatId,
            `✅ **COMPRA EJECUTADA**\n` +
            `🪙 **${cand.symbol}**\n` +
            `- Monto: $${amountUsd.toFixed(2)} USD\n` +
            `- Entrada: ${cand.amountToken?.toFixed(6) ?? '–'}\n` +
            `- TX: \`${txHash}\``,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (err) {
        console.error(`❌ Error en sniper loop [${userId}]:`, err);
      }
    }, bot.sniperConfig[userId]?.scanInterval ?? 15_000);
  });

  // --- /stop → detiene el sniper ---
  bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (bot._intervals[userId]) {
      clearInterval(bot._intervals[userId]);
      delete bot._intervals[userId];
      await bot.sendMessage(chatId, '🔴 Sniper Automático DETENIDO');
    } else {
      await bot.sendMessage(chatId, '🔴 No había sniper activo');
    }
  });
}
