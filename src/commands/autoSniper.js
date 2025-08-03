// src/commands/autoSniper.js

/**
 * Módulo 3 completo: Sniper Automático + Filtros IA + Modo DEMO + Registro de Compras
 *
 * Comando: /activarsniper
 * Parámetros:
 *  - Usa thresholds dinámicos de 'sniper_tuning' (o valores por defecto)
 *  - Controla balance via Phantom
 *  - Compra simulada en modo DEMO (/demo)
 *  - Registro real en Supabase tabla 'trades'
 *  - Registro en Google Sheets (via sheetsClient.appendRow)
 *
 * @param {TelegramBot} bot
 * @param {Object} services   // { supabaseClient, quickNodeClient, phantomClient, sheetsClient }
 */
export default function autoSniperCommand(bot, services) {
  let intervalId = null;

  // Activa el sniper con /activarsniper
  bot.onText(/\/activarsniper/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (intervalId) {
      return bot.sendMessage(chatId, '⚠️ Sniper ya está activo');
    }
    await bot.sendMessage(chatId, '🤖 Sniper Automático ACTIVADO');

    // — Lectura de thresholds IA (‘sniper_tuning’)
    let tuning = {};
    try {
      const { data, error } = await services.supabaseClient
        .from('sniper_tuning')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) console.error('Error fetching sniper_tuning:', error);
      else if (Array.isArray(data) && data.length) tuning = data[0];
    } catch (e) {
      console.error('Exception reading sniper_tuning:', e);
    }

    // Configuración por usuario (/configurar)
    const defaultConfig = { slippage: 1.5, monto: 100 };
    const userConfig    = bot.sniperConfig?.[userId]?.config || defaultConfig;

    const thresholds = {
      minAge:       1,                  // minutos
      maxAge:       5,
      minLiquidity: tuning.liquidez_opt  ?? 150,    // SOL
      maxFDV:       tuning.fdv_opt       ?? 300_000, // USD
      maxHolders:   tuning.holders_opt   ?? 400,
      minVolume:    tuning.volumen_opt   ?? 1_500,   // USD/min
      slippage:     tuning.slippage_opt  ?? userConfig.slippage,
      monto:        tuning.monto_opt     ?? userConfig.monto
    };

    // Loop de escaneo cada 5s
    intervalId = setInterval(async () => {
      try {
        // 1) Escanear nuevos tokens
        const tokens = await services.quickNodeClient.scanNewTokens();

        // 2) Filtrar según thresholds
        const passed = tokens.filter(token => {
          const ageMin = (Date.now() - token.launchTimestamp) / 60000;
          return (
            ageMin >= thresholds.minAge &&
            ageMin <= thresholds.maxAge &&
            token.metrics.liquidity >= thresholds.minLiquidity &&
            token.metrics.fdv       <= thresholds.maxFDV &&
            token.metrics.holders   <= thresholds.maxHolders &&
            token.metrics.volume    >= thresholds.minVolume &&
            !token.isHoneypot &&
            token.isRenounced &&
            token.whaleDetected
          );
        });

        // 3) Control por balance y monto
        const balanceUsd = await services.phantomClient.getBalanceUsd();
        const maxBuys    = Math.floor(balanceUsd / thresholds.monto);
        const candidates = passed.slice(0, maxBuys);

        // 4) Comprar o simular
        const inDemo = bot.demoMode?.[userId] === true;
        for (const token of candidates) {
          // Cantidad de token a comprar = monto USD / precio actual
          const cantidad = thresholds.monto / token.currentPrice;

          if (inDemo) {
            console.log(`(DEMO) Simulando compra de ${token.symbol} por $${thresholds.monto}`);
            await bot.sendMessage(
              chatId,
              `(DEMO) ✅ Simulado ${token.symbol} por $${thresholds.monto}`
            );
            continue;
          }

          // Compra real
          const txSignature = await services.phantomClient.buyToken({
            mint:      token.mintAddress,
            amountUsd: thresholds.monto,
            slippage:  thresholds.slippage
          });

          // Notificar en Telegram
          await bot.sendMessage(
            chatId,
            `✅ COMPRA EJECUTADA\n🪙 ${token.symbol}\n💵 ${thresholds.monto} USD\n📥 Precio: ${token.currentPrice}\n🔐 Tx: ${txSignature}`
          );

          // Registrar en Supabase
          await services.supabaseClient.from('trades').insert([{
            user_id:       userId,
            token:         token.symbol,
            amount_usd:    thresholds.monto,
            amount_token:  cantidad,
            price:         token.currentPrice,
            tx_signature:  txSignature,
            pnl:           null
          }]);

          // Registrar en Google Sheets
          await services.sheetsClient.appendRow([
            new Date().toISOString(),
            userId,
            token.symbol,
            thresholds.monto,
            cantidad,
            token.currentPrice,
            txSignature
          ]);
        }
      } catch (err) {
        console.error('Error en sniper loop:', err);
      }
    }, 5000);
  });

  // Detener sniper con /detener
  bot.onText(/\/detener/, (msg) => {
    if (!intervalId) return bot.sendMessage(msg.chat.id, '⚠️ Sniper no está activo');
    clearInterval(intervalId);
    intervalId = null;
    bot.sendMessage(msg.chat.id, '🛑 Sniper Automático DETENIDO');
  });
}
