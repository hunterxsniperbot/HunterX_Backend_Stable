// src/commands/autoSniper.js

/**
 * Módulo 3 mejorado: /activarsniper + modo DEMO
 * Escanea, filtra según balance y thresholds (estáticos o IA tuning),
 * compra (o simula si estás en DEMO) y registra en Supabase/Sheets.
 * Permite detener con /detener.
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function autoSniperCommand(bot, services) {
  let intervalId = null;

  bot.onText(/\/activarsniper/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (intervalId) {
      return bot.sendMessage(chatId, '⚠️ Sniper ya está activo');
    }
    await bot.sendMessage(chatId, '🤖 Sniper Automático ACTIVADO');

    // --- Lectura dinámica de thresholds (IA tuning) ---
    let t = {};
    try {
      const { data: tuningData, error: tuningError } = await services.supabaseClient
        .from('sniper_tuning')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (tuningError) console.error('Error fetching sniper_tuning:', tuningError);
      else if (Array.isArray(tuningData) && tuningData.length > 0) t = tuningData[0];
    } catch (err) {
      console.error('Exception reading sniper_tuning:', err);
    }
    const defaultConfig = { slippage: 1.5, monto: 100 };
    const stateConfig  = bot.sniperConfig?.[userId]?.config || defaultConfig;
    const thresholds   = {
      minAge:       1,
      maxAge:       5,
      minLiquidity: t.liquidez_opt  ?? 150,
      maxFDV:       t.fdv_opt       ?? 300_000,
      maxHolders:   t.holders_opt   ?? 400,
      minVolume:    t.volumen_opt   ?? 1_500,
      slippage:     t.slippage_opt  ?? stateConfig.slippage,
      monto:        t.monto_opt     ?? stateConfig.monto
    };
    // ---------------------------------------------------

    intervalId = setInterval(async () => {
      try {
        // 1) Escanear nuevos tokens
        const tokens = await services.quickNodeClient.scanNewTokens();

        // 2) Filtrar por thresholds
        const passed = tokens.filter(token => {
          const ageMin = (Date.now() - token.launchTimestamp) / 60000;
          const m = thresholds;
          return (
            ageMin >= m.minAge &&
            ageMin <= m.maxAge &&
            token.metrics.liquidity >= m.minLiquidity &&
            token.metrics.fdv       <= m.maxFDV &&
            token.metrics.holders   <= m.maxHolders &&
            token.metrics.volume    >= m.minVolume &&
            !token.isHoneypot &&
            token.isRenounced &&
            token.whaleDetected
          );
        });

        // 3) Control por balance y monto
        const balanceUsd = await services.phantomClient.getBalanceUsd();
        const maxBuys    = Math.floor(balanceUsd / thresholds.monto);
        const candidates = passed.slice(0, maxBuys);

        // 4) Comprar o simular según modo DEMO
        const inDemo = bot.demoMode?.[userId] === true;
        for (const token of candidates) {
          if (inDemo) {
            console.log(`(DEMO) Simulando compra de ${token.symbol} por $${thresholds.monto}`);
            await bot.sendMessage(
              msg.chat.id,
              `(DEMO) ✅ Simulado ${token.symbol} por $${thresholds.monto}`
            );
            continue;
          }

          // Compra real
          const tx = await services.phantomClient.buyToken({
            mint:      token.mintAddress,
            amountUsd: thresholds.monto
          });

          const trade = {
            user:      userId,
            token:     token.symbol,
            mint:      token.mintAddress,
            amount:    thresholds.monto,
            price:     token.currentPrice,
            tx,
            timestamp: new Date()
          };
          // Registrar en Supabase
          await services.supabaseClient.from('trades').insert([trade]);
          // Registrar en Google Sheets
          await services.sheetsClient.appendRow([
            trade.timestamp.toISOString(),
            trade.user,
            trade.token,
            trade.amount,
            trade.price,
            trade.tx
          ]);
          // Notificar en chat
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

  // /detener para parar el sniper
  bot.onText(/\/detener/, (msg) => {
    if (!intervalId) return bot.sendMessage(msg.chat.id, '⚠️ Sniper no está activo');
    clearInterval(intervalId);
    intervalId = null;
    bot.sendMessage(msg.chat.id, '🛑 Sniper Automático DETENIDO');
  });
}
